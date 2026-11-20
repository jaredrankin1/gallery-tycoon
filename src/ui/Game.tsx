import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ASSISTANT, absHour, canPlace, clockLabel, EVENT_KIND, fixtureAt, TIME, VENUE, weekday, type Action } from '../game';
import { IsoRenderer } from '../render/IsoRenderer';
import { shortMoney } from './bits';
import { BuildTray } from './BuildTray';
import { Ctx, type GameCtx, type SheetId, type Ui } from './context';
import { Icon } from './icons';
import { Inspector } from './Inspector';
import { PeopleSheet } from './sheets/People';
import { GuestCard } from './GuestCard';
import { ArtistTalk, CallerFace } from './ArtistTalk';
import { Onboarding } from './Onboarding';
import { TutorialCard, tutorialPulse } from './Tutorial';
import { portraitUrl } from '../render/sprites';
import { BooksSheet } from './sheets/Books';
import { ShopSheet } from './sheets/Shop';
import { CollectionSheet } from './sheets/Collection';
import { CalendarSheet } from './sheets/Events';
import { InboxSheet } from './sheets/Inbox';
import { useStore, type Store } from './store';
import { sound } from '../audio/sound';

interface Toast {
  id: number;
  text: string;
  tone: 'error' | 'info' | 'sale' | 'event' | 'warn' | 'guest' | 'review';
  /** Sprite name, to show the guest's face. */
  face?: string;
}

/** Four buttons, no sub-tabs. People open from the inbox or the floor, the books from the cash, the shop from its counter. */
const DOCK: { id: SheetId | 'build'; label: string; icon: string }[] = [
  { id: 'build', label: 'Build', icon: 'build' },
  { id: 'collection', label: 'Art', icon: 'art' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
];

/** Sheets cover this much of the screen; the room slides up into the rest. */
const SHEET_H = 0.56;

export function Game({ store, onQuit, onboarding, onSetupDone }: { store: Store; onQuit: () => void; onboarding: boolean; onSetupDone: () => void }) {
  const state = useStore(store);
  const [ui, setUiState] = useState<Ui>({
    sheet: null,
    build: null,
    building: false,
    selected: null,
    draft: null,
    guest: null,
    peopleTab: 'guests',
    artTab: 'market',
    talk: false,
  });
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const setUi = useCallback((patch: Partial<Ui>) => setUiState((u) => ({ ...u, ...patch })), []);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  const toast = useCallback((text: string, tone: Toast['tone'] = 'info', face?: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone, face }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 2600 : 3800);
  }, []);

  const act = useCallback(
    (a: Action) => {
      const r = store.act(a);
      if (!r.ok) {
        toast(r.error, 'error');
        sound.play('error');
      }
      return r.ok;
    },
    [store, toast],
  );

  // ---- canvas ----
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<IsoRenderer | null>(null);
  /** People on the floor right now, as drawn: the HUD count is exactly who you can see. */
  const [inside, setInside] = useState(0);
  useEffect(() => {
    const r = new IsoRenderer(
      canvasRef.current!,
      (x, y) => {
        const u = uiRef.current;
        const s = store.state;
        if (u.building) {
          if (!u.build) return toast('Pick something from the tray first.', 'error');
          if (u.build === 'remove') {
            const f = fixtureAt(s.floor, x, y);
            if (f) act({ type: 'removeFixture', fixtureId: f.id });
            return;
          }
          const err = canPlace(s.floor, u.build, x, y);
          if (err) toast(err, 'error');
          else act({ type: 'placeFixture', kind: u.build, x, y });
          return;
        }
        if (u.sheet) return setUi({ sheet: null });
        const same = u.selected && u.selected.x === x && u.selected.y === y;
        setUi({ selected: same ? null : { x, y }, guest: null });
      },
      (guestId) => {
        const u = uiRef.current;
        if (u.building) return;
        if (guestId.startsWith('artist:')) return openTalkRef.current();
        setUi({ guest: u.guest === guestId ? null : guestId, selected: null, sheet: null });
      },
    );
    r.setClock(() => absHour(store.state) + store.hourProgress);
    r.setOnCount(setInside);
    r.setOnSfx((k) => sound.play(k));
    rendererRef.current = r;
    // The room's murmur follows the crowd on screen.
    const amb = setInterval(() => {
      const a = r.ambience();
      sound.setAmbience(a.count, a.party, store.speedIndex === 0);
    }, 250);
    return () => {
      clearInterval(amb);
      r.destroy();
    };
  }, []);

  useEffect(() => {
    const r = rendererRef.current!;
    r.setState(state);
    r.setSelected(ui.building ? null : ui.selected);
    r.setSelectedGuest(ui.guest);
    if (onboarding) r.setInsets(0.1, 0.5);
    else if (ui.sheet) r.setInsets(0.12, SHEET_H);
    else r.setInsets(0.12, 0.1);
    r.setBuildKind(ui.building && ui.build && ui.build !== 'remove' ? ui.build : null);
  });

  // ---- feed -> toasts + floating labels ----
  const seenFeed = useRef(state.feedSeq);
  const lastChime = useRef(0);
  useEffect(() => {
    if (onboarding) {
      seenFeed.current = state.feedSeq;
      return;
    }
    const fresh = state.feed.filter((f) => f.id > seenFeed.current);
    seenFeed.current = state.feedSeq;
    for (const f of fresh) {
      // The gift shop's hourly trickle: a coin over the counter, no toast.
      if (f.quiet) {
        if (f.at && f.amount) rendererRef.current?.pop(f.at.x, f.at.y, `+${shortMoney(f.amount)}`);
        // At most one till chime every few seconds, so a busy museum doesn't jingle nonstop.
        if (performance.now() - lastChime.current > 5000) {
          lastChime.current = performance.now();
          sound.play('coin');
        }
        continue;
      }
      if (f.at && f.amount) {
        rendererRef.current?.pop(f.at.x, f.at.y, `+${shortMoney(f.amount)}`);
        sound.play('sale');
      } else if (f.kind === 'tickets' || f.kind === 'shop') sound.play('coin');
      else if (f.kind === 'event') sound.play('event');
      else if (f.kind === 'warn' || f.kind === 'bills') sound.play('warn');
      else if (f.kind === 'review' || f.kind === 'guest' || f.kind === 'delivery') sound.play('note');
      const face = f.face ?? (f.guestId ? state.guests[f.guestId]?.sprite : undefined);
      const tone: Toast['tone'] =
        f.kind === 'sale' || f.kind === 'tickets' || f.kind === 'shop'
          ? 'sale'
          : f.kind === 'event' || f.kind === 'delivery'
            ? 'event'
            : f.kind === 'review'
              ? 'review'
              : f.kind === 'guest'
                ? 'guest'
                : f.kind === 'warn' || f.kind === 'bills'
                  ? 'warn'
                  : 'info';
      toast(f.text, tone, face);
    }
  }, [state.feedSeq, onboarding]);

  // ---- inbox: news since you last looked ----
  const [readSeq, setReadSeq] = useState(state.feedSeq);
  useEffect(() => {
    if (ui.sheet === 'inbox') setReadSeq(state.feedSeq);
  }, [ui.sheet, state.feedSeq]);
  useEffect(() => {
    if (onboarding) setReadSeq(state.feedSeq);
  }, [onboarding]);
  const unread = state.feed.filter((f) => !f.quiet && f.id > readSeq).length;

  // ---- cash flash ----
  const lastCash = useRef(state.cash);
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    if (state.cash === lastCash.current) return;
    setFlash(state.cash > lastCash.current ? 'up' : 'down');
    lastCash.current = state.cash;
    const t = setTimeout(() => setFlash(''), 450);
    return () => clearTimeout(t);
  }, [state.cash]);

  // ---- talking to a visiting artist: the clock stops while you chat ----
  const talkSpeed = useRef(1);
  const openTalk = () => {
    const call = store.state.artistCall;
    if (!call || call.stage === 'done' || uiRef.current.talk) return;
    talkSpeed.current = store.speedIndex || 1;
    store.setSpeed(0);
    setUi({ talk: true, sheet: null, building: false, build: null, selected: null, guest: null });
  };
  const openTalkRef = useRef(openTalk);
  openTalkRef.current = openTalk;
  const closeTalk = () => {
    setUi({ talk: false });
    store.setSpeed(talkSpeed.current);
  };
  const caller = state.artistCall && state.artistCall.stage !== 'done' ? state.artistCall : null;

  const [menu, setMenu] = useState(false);
  const wasSpeed = useRef(1);
  const openMenu = () => {
    wasSpeed.current = store.speedIndex || 1;
    store.setSpeed(0);
    setMenu(true);
  };

  const ctx: GameCtx = { store, state, ui, setUi, act, toast };
  const tonight = state.events.find((e) => e.day === state.day);
  const dayFraction = (state.tick + store.hourProgress) / TIME.ticksPerDay;

  const openDock = (id: SheetId | 'build') => {
    if (id === 'build') setUi({ building: !ui.building, build: null, sheet: null, selected: null, guest: null, draft: null });
    else
      setUi({
        sheet: ui.sheet === id ? null : id,
        building: false,
        build: null,
        selected: null,
        guest: null,
        draft: null,
        // The art sheet opens on the auction on sale day.
        ...(id === 'collection' && ui.sheet !== id ? { artTab: state.auction?.day === state.day ? 'auction' : ui.artTab } : {}),
      });
  };
  const sheetFor = (id: SheetId) => ui.sheet === id || (id === 'inbox' && (ui.sheet === 'people' || ui.sheet === 'books' || ui.sheet === 'shop'));

  // One card floats over the room at a time: what you tapped, else a visiting artist, else Marisol's task.
  const free = !ui.talk && !ui.sheet && !ui.building;
  const card: 'inspect' | 'guest' | 'caller' | null = !free ? null : ui.selected ? 'inspect' : ui.guest ? 'guest' : caller ? 'caller' : null;
  const latest = toasts[toasts.length - 1];
  const fast = store.speedIndex > 1;
  const paused = store.speedIndex === 0;

  if (onboarding) {
    return (
      <Ctx.Provider value={ctx}>
        <div class="game">
          <canvas ref={canvasRef} class="iso" />
          <Onboarding
            onDone={() => {
              onSetupDone();
              setUi({ guest: null, selected: null, sheet: null });
            }}
          />
        </div>
      </Ctx.Provider>
    );
  }

  return (
    <Ctx.Provider value={ctx}>
      <div class="game">
        <canvas ref={canvasRef} class="iso" />

        <header class="hud">
          <div class="hud-row">
            <button class="venue-name" onClick={openMenu} title="Menu">
              <b>{state.name}</b>
              <small>
                <span class="dayring" style={{ '--p': dayFraction }} />
                {weekday(state.day).slice(0, 3)} {state.day} · {clockLabel(state.tick)} · <Icon name="star" size={11} />
                {Math.round(state.reputation)} · <Icon name="people" size={11} />
                {inside}
              </small>
            </button>
            <div class="speed" role="group" aria-label="Game speed">
              <button class={paused ? 'on' : ''} onClick={() => store.setSpeed(paused ? 1 : 0)} aria-label={paused ? 'Play' : 'Pause'}>
                <Icon name={paused ? 'play1' : 'pause'} size={16} />
              </button>
              <button
                class={fast ? 'on' : ''}
                onClick={() => store.setSpeed(store.speedIndex >= TIME.speeds.length - 1 ? 1 : Math.max(2, store.speedIndex + 1))}
                aria-label={`Fast forward (now ${TIME.speeds[store.speedIndex]}x)`}
              >
                <Icon name={store.speedIndex === 3 ? 'play3' : 'play2'} size={16} />
              </button>
            </div>
            <SoundToggle />
            <button
              class={`cash ${flash} ${tutorialPulse(state, ui) === 'books' ? 'pulse' : ''}`}
              onClick={() => setUi({ sheet: ui.sheet === 'books' ? null : 'books', building: false, build: null, selected: null, guest: null, draft: null })}
              title="Books"
            >
              <b>{shortMoney(state.cash)}</b>
            </button>
          </div>
          <button class={`ticker ${latest ? `has-news t-${latest.tone}` : ''}`} key={latest?.id ?? 0} onClick={() => openDock('inbox')} aria-live="polite">
            {latest ? (
              <>
                {latest.face ? <img class="ticker-face" src={portraitUrl(latest.face)} alt="" /> : <i class="ticker-dot" />}
                <span class="ticker-text">{latest.text}</span>
              </>
            ) : paused && state.status === 'playing' ? (
              <>
                <i class="ticker-dot" />
                <span class="ticker-text">Paused · tap ▶ to resume</span>
              </>
            ) : (
              <>
                <i class="ticker-dot calm" />
                <span class="ticker-text">
                  {tonight
                    ? `${EVENT_KIND[tonight.kind].label} tonight`
                    : state.exhibition
                      ? `Now showing: ${state.exhibition.title}`
                      : `${VENUE[state.venue].label} open`}
                </span>
              </>
            )}
            {unread > 0 && <span class="ticker-more">{unread} new ›</span>}
          </button>
        </header>

        {card === 'inspect' && <Inspector />}
        {card === 'guest' && <GuestCard id={ui.guest!} />}
        {card === 'caller' && caller && (
          <div class="caller-card">
            <CallerFace call={caller} />
            <span class="grow">
              <b>
                {state.artists[caller.artistId]?.name.split(' ')[0]} {caller.stage === 'waiting' ? 'dropped by' : 'is waiting'}
              </b>
              <small>{caller.stage === 'waiting' ? 'Brought new work to show you' : 'Still hoping to talk'}</small>
            </span>
            <button class="btn primary" onClick={openTalk}>
              Talk
            </button>
          </div>
        )}
        {ui.talk && <ArtistTalk onClose={closeTalk} />}
        {!ui.talk && <TutorialCard low={free && !card} slim={!!card || ui.building} />}
        {ui.building && <BuildTray />}

        {ui.sheet === 'collection' && <CollectionSheet />}
        {ui.sheet === 'calendar' && <CalendarSheet />}
        {ui.sheet === 'inbox' && <InboxSheet onTalk={openTalk} />}
        {ui.sheet === 'people' && <PeopleSheet />}
        {ui.sheet === 'books' && <BooksSheet />}
        {ui.sheet === 'shop' && <ShopSheet />}

        <nav class="dock">
          {DOCK.map((d) => {
            const pulse = tutorialPulse(state, ui);
            const on = d.id === 'build' ? ui.building : sheetFor(d.id);
            const badge =
              d.id === 'inbox'
                ? unread
                : d.id === 'calendar'
                  ? state.events.length
                  : d.id === 'collection'
                    ? Object.values(state.artworks).filter((w) => w.status === 'storage').length
                    : 0;
            return (
              <button class={`${on ? 'on' : ''} ${pulse === d.id ? 'pulse' : ''}`} onClick={() => openDock(d.id)}>
                <span class="dock-icon">
                  <Icon name={d.icon} />
                  {badge > 0 && <i class={`badge ${d.id === 'inbox' ? 'hot' : ''}`}>{badge > 9 ? '9+' : badge}</i>}
                </span>
                <small>{d.label}</small>
              </button>
            );
          })}
        </nav>

        {menu && (
          <div
            class="modal"
            onClick={() => {
              setMenu(false);
              store.setSpeed(wasSpeed.current);
            }}
          >
            <div class="modal-card" onClick={(e) => e.stopPropagation()}>
              <h2>{state.name}</h2>
              <p class="muted">Paused. Your game saves automatically.</p>
              <button
                class="btn primary wide"
                onClick={() => {
                  setMenu(false);
                  store.setSpeed(wasSpeed.current);
                }}
              >
                Resume
              </button>
              {state.tutorial?.status !== 'on' && (
                <button
                  class="btn ghost wide"
                  onClick={() => {
                    act({ type: 'tutorial', to: 'start' });
                    setMenu(false);
                    store.setSpeed(wasSpeed.current);
                  }}
                >
                  Replay {ASSISTANT.name}’s tour
                </button>
              )}
              <button class="btn ghost wide" onClick={onQuit}>
                Back to title
              </button>
            </div>
          </div>
        )}

        {state.status === 'bankrupt' && (
          <div class="modal">
            <div class="modal-card">
              <h2>Closed for good</h2>
              <p>
                {state.name} ran out of money on day {state.day}.
              </p>
              <button class="btn primary wide" onClick={onQuit}>
                Back to title
              </button>
            </div>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

function SoundToggle() {
  const [on, setOn] = useState(sound.enabled);
  const [blocked, setBlocked] = useState(sound.blocked);
  useEffect(() => sound.subscribe(() => (setOn(sound.enabled), setBlocked(sound.blocked))), []);
  const label = blocked ? 'Sound is blocked by this browser or viewer' : on ? 'Sound on: tap to mute' : 'Sound off: tap to unmute';
  return (
    <button class={`mini sound-btn${blocked ? ' blocked' : ''}`} onClick={() => sound.setEnabled(!on)} aria-label={label} aria-pressed={on} title={label}>
      <Icon name={on && !blocked ? 'sound' : 'mute'} size={16} />
    </button>
  );
}
