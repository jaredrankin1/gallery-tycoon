import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ASSISTANT, absHour, canPlace, clockLabel, fixtureAt, TIME, VENUE, weekday, type Action } from '../game';
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
import { EventsSheet } from './sheets/Events';
import { useStore, type Store } from './store';
import { sound } from '../audio/sound';

interface Toast {
  id: number;
  text: string;
  tone: 'error' | 'info' | 'sale' | 'event' | 'warn' | 'guest' | 'review';
  /** Sprite name, to show the guest's face. */
  face?: string;
}

const DOCK: { id: SheetId | 'build'; label: string; icon: string }[] = [
  { id: 'build', label: 'Build', icon: 'build' },
  { id: 'collection', label: 'Art', icon: 'art' },
  { id: 'people', label: 'People', icon: 'artists' },
  { id: 'events', label: 'Events', icon: 'events' },
  { id: 'books', label: 'Books', icon: 'books' },
];

export function Game({ store, onQuit, onboarding, onSetupDone }: { store: Store; onQuit: () => void; onboarding: boolean; onSetupDone: () => void }) {
  const state = useStore(store);
  const [ui, setUiState] = useState<Ui>({ sheet: null, build: null, building: false, selected: null, draft: null, guest: null, peopleTab: 'guests', eventsTab: 'show', talk: false });
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
    const r = new IsoRenderer(canvasRef.current!, (x, y) => {
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
    }, (guestId) => {
      const u = uiRef.current;
      if (u.building) return;
      if (guestId.startsWith('artist:')) return openTalkRef.current();
      setUi({ guest: u.guest === guestId ? null : guestId, selected: null, sheet: null });
    });
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
    else r.setInsets(0.17, 0.11);
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
        f.kind === 'sale' || f.kind === 'tickets' || f.kind === 'shop' ? 'sale' : f.kind === 'event' || f.kind === 'delivery' ? 'event' : f.kind === 'review' ? 'review' : f.kind === 'guest' ? 'guest' : f.kind === 'warn' || f.kind === 'bills' ? 'warn' : 'info';
      toast(f.text, tone, face);
    }
  }, [state.feedSeq, onboarding]);

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
    if (id === 'build') setUi({ building: !ui.building, build: null, sheet: null, selected: null, guest: null });
    else setUi({ sheet: ui.sheet === id ? null : id, building: false, build: null, selected: null, guest: null });
  };

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
                {VENUE[state.venue].label} · {weekday(state.day)}, day {state.day}
              </small>
            </button>
            <div class={`cash ${flash}`}>
              <small>Cash</small>
              <b>{shortMoney(state.cash)}</b>
            </div>
          </div>
          <div class="hud-row">
            <div class="clock">
              <span class="dayring" style={{ '--p': dayFraction }} />
              <b>{clockLabel(state.tick)}</b>
              {tonight ? (
                <span class="tonight">{tonight.kind} tonight</span>
              ) : (
                state.exhibition && (
                  <button class="tonight show-chip" onClick={() => setUi({ sheet: 'events', eventsTab: 'show', building: false, selected: null, guest: null })}>
                    {state.exhibition.title}
                  </button>
                )
              )}
            </div>
            <div class="chips-mini">
              <span class="mini" title="Reputation">
                <Icon name="star" size={14} />
                {Math.round(state.reputation)}
              </span>
              <span class="mini" title={`In the building now · ${state.today.visitors} today`}>
                <Icon name="people" size={14} />
                {inside}
              </span>
              <SoundToggle />
            </div>
            <div class="speed" role="group" aria-label="Game speed">
              {TIME.speeds.map((sp, i) => (
                <button class={store.speedIndex === i ? 'on' : ''} onClick={() => store.setSpeed(i)} aria-label={sp ? `${sp}x speed` : 'Pause'}>
                  <Icon name={sp === 0 ? 'pause' : sp === 1 ? 'play1' : sp === 2 ? 'play2' : 'play3'} size={16} />
                </button>
              ))}
            </div>
          </div>
        </header>

        <div class="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} class={`toast ${t.tone}`}>
              {t.face && <img class="toast-face" src={portraitUrl(t.face)} alt="" />}
              <span>{t.text}</span>
            </div>
          ))}
        </div>

        {store.speedIndex === 0 && state.status === 'playing' && (
          <button class="paused" onClick={() => store.setSpeed(1)}>
            Paused · tap to resume
          </button>
        )}

        {ui.selected && !ui.building && !ui.sheet && <Inspector />}
        {ui.guest && !ui.building && !ui.sheet && <GuestCard id={ui.guest} />}
        {caller && !ui.talk && !ui.sheet && !ui.building && !ui.selected && !ui.guest && (
          <button class="caller-chip" onClick={openTalk}>
            <CallerFace call={caller} />
            <span>
              <b>{state.artists[caller.artistId]?.name.split(' ')[0]} is here</b>
              <small>{caller.stage === 'waiting' ? 'Brought new work · tap to talk' : 'Waiting for you'}</small>
            </span>
          </button>
        )}
        {ui.talk && <ArtistTalk onClose={closeTalk} />}
        {!ui.talk && <TutorialCard low={!caller && !ui.sheet && !ui.building && !ui.selected && !ui.guest} />}
        {ui.building && <BuildTray />}

        {ui.sheet === 'collection' && <CollectionSheet />}
        {ui.sheet === 'people' && <PeopleSheet />}
        {ui.sheet === 'events' && <EventsSheet />}
        {ui.sheet === 'books' && <BooksSheet />}
        {ui.sheet === 'shop' && <ShopSheet />}

        <nav class="dock">
          {DOCK.map((d) => {
            const pulse = tutorialPulse(state, ui);
            const on = d.id === 'build' ? ui.building : ui.sheet === d.id || (d.id === 'books' && ui.sheet === 'shop');
            const badge = d.id === 'events' ? state.events.length + (state.exhibition ? 1 : 0) : d.id === 'collection' ? Object.values(state.artworks).filter((w) => w.status === 'storage').length : 0;
            return (
              <button class={`${on ? 'on' : ''} ${pulse === d.id ? 'pulse' : ''}`} onClick={() => openDock(d.id)}>
                <span class="dock-icon">
                  <Icon name={d.icon} />
                  {badge > 0 && <i class="badge">{badge}</i>}
                </span>
                <small>{d.label}</small>
              </button>
            );
          })}
        </nav>

        {menu && (
          <div class="modal" onClick={() => { setMenu(false); store.setSpeed(wasSpeed.current); }}>
            <div class="modal-card" onClick={(e) => e.stopPropagation()}>
              <h2>{state.name}</h2>
              <p class="muted">Paused. Your game saves automatically.</p>
              <button class="btn primary wide" onClick={() => { setMenu(false); store.setSpeed(wasSpeed.current); }}>
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
