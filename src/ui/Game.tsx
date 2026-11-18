import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { canPlace, clockLabel, fixtureAt, TIME, VENUE, weekday, type Action } from '../game';
import { IsoRenderer } from '../render/IsoRenderer';
import { shortMoney } from './bits';
import { BuildTray } from './BuildTray';
import { Ctx, type GameCtx, type SheetId, type Ui } from './context';
import { Icon } from './icons';
import { Inspector } from './Inspector';
import { ArtistsSheet } from './sheets/Artists';
import { BooksSheet } from './sheets/Books';
import { CollectionSheet } from './sheets/Collection';
import { EventsSheet } from './sheets/Events';
import { useStore, type Store } from './store';

interface Toast {
  id: number;
  text: string;
  tone: 'error' | 'info' | 'sale' | 'event' | 'warn';
}

const DOCK: { id: SheetId | 'build'; label: string; icon: string }[] = [
  { id: 'build', label: 'Build', icon: 'build' },
  { id: 'collection', label: 'Art', icon: 'art' },
  { id: 'artists', label: 'Artists', icon: 'artists' },
  { id: 'events', label: 'Events', icon: 'events' },
  { id: 'books', label: 'Books', icon: 'books' },
];

export function Game({ store, onQuit }: { store: Store; onQuit: () => void }) {
  const state = useStore(store);
  const [ui, setUiState] = useState<Ui>({ sheet: null, build: null, building: false, selected: null, draft: null });
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const setUi = useCallback((patch: Partial<Ui>) => setUiState((u) => ({ ...u, ...patch })), []);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 2600 : 3800);
  }, []);

  const act = useCallback(
    (a: Action) => {
      const r = store.act(a);
      if (!r.ok) toast(r.error, 'error');
      return r.ok;
    },
    [store, toast],
  );

  // ---- canvas ----
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<IsoRenderer | null>(null);
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
      setUi({ selected: same ? null : { x, y } });
    });
    rendererRef.current = r;
    return () => r.destroy();
  }, []);

  useEffect(() => {
    const r = rendererRef.current!;
    r.setState(state);
    r.setSelected(ui.building ? null : ui.selected);
    r.setBuildKind(ui.building && ui.build && ui.build !== 'remove' ? ui.build : null);
  });

  // ---- feed -> toasts + floating labels ----
  const seenFeed = useRef(state.feedSeq);
  useEffect(() => {
    const fresh = state.feed.filter((f) => f.id > seenFeed.current);
    seenFeed.current = state.feedSeq;
    for (const f of fresh) {
      if (f.at && f.amount) rendererRef.current?.pop(f.at.x, f.at.y, `+${shortMoney(f.amount)}`);
      toast(f.text, f.kind === 'sale' || f.kind === 'tickets' ? 'sale' : f.kind === 'event' ? 'event' : f.kind === 'warn' || f.kind === 'bills' ? 'warn' : 'info');
    }
  }, [state.feedSeq]);

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
    if (id === 'build') setUi({ building: !ui.building, build: null, sheet: null, selected: null });
    else setUi({ sheet: ui.sheet === id ? null : id, building: false, build: null, selected: null });
  };

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
              {tonight && <span class="tonight">{tonight.kind} tonight</span>}
            </div>
            <div class="chips-mini">
              <span class="mini" title="Reputation">
                <Icon name="star" size={14} />
                {Math.round(state.reputation)}
              </span>
              <span class="mini" title="Visitors today">
                <Icon name="people" size={14} />
                {state.today.visitors}
              </span>
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
              {t.text}
            </div>
          ))}
        </div>

        {store.speedIndex === 0 && state.status === 'playing' && (
          <button class="paused" onClick={() => store.setSpeed(1)}>
            Paused · tap to resume
          </button>
        )}

        {ui.selected && !ui.building && !ui.sheet && <Inspector />}
        {ui.building && <BuildTray />}

        {ui.sheet === 'collection' && <CollectionSheet />}
        {ui.sheet === 'artists' && <ArtistsSheet />}
        {ui.sheet === 'events' && <EventsSheet />}
        {ui.sheet === 'books' && <BooksSheet />}

        <nav class="dock">
          {DOCK.map((d) => {
            const on = d.id === 'build' ? ui.building : ui.sheet === d.id;
            const badge = d.id === 'events' ? state.events.length : d.id === 'collection' ? Object.values(state.artworks).filter((w) => w.status === 'storage').length : 0;
            return (
              <button class={on ? 'on' : ''} onClick={() => openDock(d.id)}>
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
