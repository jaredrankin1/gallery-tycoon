import { canPlace, DIFFICULTY, EVENT_KIND, VENUE, type Action, type GameState, type WeeklyReport } from '../game';
import { IsoRenderer } from '../render/IsoRenderer';
import { h, money, shortMoney, toast } from './dom';
import { artistsPanel } from './panels/artists';
import { booksPanel } from './panels/books';
import { eventsPanel } from './panels/events';
import { floorPanel } from './panels/floor';
import { marketPanel } from './panels/market';
import type { PanelCtx, Tab, UiState } from './panels/types';
import type { Store } from './store';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'floor', label: 'Floor', icon: '▦' },
  { id: 'market', label: 'Market', icon: '◈' },
  { id: 'artists', label: 'Artists', icon: '☺' },
  { id: 'events', label: 'Events', icon: '✦' },
  { id: 'books', label: 'Books', icon: '≡' },
];

const PANELS: Record<Tab, (ctx: PanelCtx) => Node[]> = {
  floor: floorPanel,
  market: marketPanel,
  artists: artistsPanel,
  events: eventsPanel,
  books: booksPanel,
};

export function mountGame(root: HTMLElement, store: Store, onQuit: () => void) {
  const ui: UiState = { tab: 'floor', selected: null, build: null, draft: null };

  const hud = h('header', { class: 'hud' });
  const canvas = h('canvas', { class: 'iso' });
  const nextBtn = h('button', { class: 'next', onclick: () => nextWeek() }, 'Next week ▸');
  const view = h('div', { class: 'view' }, canvas, nextBtn);
  const sheet = h('section', { class: 'sheet' });
  const nav = h('nav', { class: 'tabs' });
  const screen = h('div', { class: 'screen game' }, hud, view, sheet, nav);
  root.replaceChildren(screen);

  const act = (a: Action) => {
    const r = store.act(a);
    if (!r.ok) toast(screen, r.error, 'error');
    return r.ok;
  };

  const renderer = new IsoRenderer(canvas, (x, y) => {
    if (ui.build) {
      const kind = ui.build;
      const err = canPlace(store.state.floor, kind, x, y);
      renderer.setHighlight({ x, y, ok: !err });
      if (err) toast(screen, err, 'error');
      else act({ type: 'placeFixture', kind, x, y });
      return;
    }
    ui.selected = ui.selected && ui.selected.x === x && ui.selected.y === y ? null : { x, y };
    ui.tab = 'floor';
    render();
  });

  function render() {
    const s = store.state;
    renderer.setState(s);
    renderer.setSelected(ui.build ? null : ui.selected);
    if (!ui.build) renderer.setHighlight(null);

    hud.replaceChildren(
      h('div', { class: 'hud-title' }, h('b', {}, s.name), h('small', {}, `${VENUE[s.venue].label} · ${DIFFICULTY[s.difficulty].label} · Week ${s.week}`)),
      h('div', { class: 'hud-stats' },
        h('div', { class: `stat-pill ${s.cash < 0 ? 'bad' : ''}` }, h('small', {}, 'Cash'), h('b', {}, shortMoney(s.cash))),
        h('div', { class: 'stat-pill' }, h('small', {}, 'Rep'), h('b', {}, `${Math.round(s.reputation)}`)),
        h('button', { class: 'icon-btn', title: 'Menu', onclick: () => { if (confirmQuit()) onQuit(); } }, '⋯'),
      ),
    );

    const ctx: PanelCtx = { state: s, ui, act, refresh: render };
    const scroll = sheet.scrollTop;
    sheet.replaceChildren(...PANELS[ui.tab](ctx));
    sheet.scrollTop = scroll;

    nav.replaceChildren(...TABS.map((t) =>
      h('button', { class: ui.tab === t.id ? 'on' : '', onclick: () => { if (ui.tab !== t.id) { ui.tab = t.id; ui.build = null; sheet.scrollTop = 0; render(); } } },
        h('span', {}, t.icon), h('small', {}, t.label),
        t.id === 'events' && s.events.length ? h('i', { class: 'badge' }, String(s.events.length)) : null)));

    if (s.status === 'bankrupt') showGameOver();
  }

  function nextWeek() {
    if (act({ type: 'advanceWeek' })) {
      const report = store.state.reports.at(-1);
      if (report && store.state.status === 'playing') showReport(report);
    }
  }

  function showReport(r: WeeklyReport) {
    const s = store.state;
    const net = r.income - r.expenses;
    const modal = h('div', { class: 'modal' }, h('div', { class: 'modal-card' },
      h('div', { class: 'section-title' }, `Week ${r.week} wrap-up`),
      h('div', { class: 'big-num ' + (net < 0 ? 'bad' : 'good') }, (net >= 0 ? '+' : '') + money(net)),
      h('div', { class: 'row' }, h('span', {}, 'Income'), h('b', {}, money(r.income))),
      h('div', { class: 'row' }, h('span', {}, 'Spending'), h('b', {}, money(r.expenses))),
      h('div', { class: 'row' }, h('span', {}, 'Visitors'), h('b', {}, String(r.visitors))),
      r.sales.length ? h('div', { class: 'row' }, h('span', {}, 'Works sold'), h('b', {}, String(r.sales.length))) : null,
      ...r.events.map((e) => h('div', { class: 'card' },
        h('b', {}, `${EVENT_KIND[e.kind].label}: ${e.attendance} came, catered for ${e.catered}`),
        h('small', {}, e.satisfaction > 0.7 ? 'The wine flowed and the cheese held out. A triumph.' : e.satisfaction > 0.4 ? 'A pleasant evening.' : 'Guests left hungry and sober. People noticed.'),
        h('small', { class: 'muted' }, `Reputation ${e.reputationDelta >= 0 ? '+' : ''}${e.reputationDelta}` +
          Object.entries(e.relationshipDeltas).map(([id, d]) => ` · ${s.artists[id].name.split(' ')[0]} ${d >= 0 ? '+' : ''}${d}`).join('')),
        ...e.notes.map((n) => h('small', { class: 'muted' }, n)),
      )),
      ...r.notes.map((n) => h('p', { class: 'hint' }, n)),
      h('button', { class: 'btn primary wide', onclick: () => modal.remove() }, 'Continue'),
    ));
    screen.append(modal);
  }

  function showGameOver() {
    if (screen.querySelector('.modal.over')) return;
    const s = store.state;
    screen.append(h('div', { class: 'modal over' }, h('div', { class: 'modal-card' },
      h('div', { class: 'section-title' }, 'Closed for good'),
      h('p', {}, `${s.name} ran out of money in week ${s.week}.`),
      h('button', { class: 'btn primary wide', onclick: onQuit }, 'Back to title'),
    )));
  }

  const unsub = store.subscribe(render);
  render();
  return () => {
    unsub();
    renderer.destroy();
  };
}

function confirmQuit() {
  // A real menu comes later. Saves are automatic, so leaving is safe.
  return true;
}

export type { GameState };
