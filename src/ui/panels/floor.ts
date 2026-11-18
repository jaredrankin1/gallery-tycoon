import { FIXTURE, fixtureAt, getVenueModel, type FixtureKind } from '../../game';
import { h, money } from '../dom';
import type { PanelCtx } from './types';
import { hueOf as hue } from '../../render/iso';

export { hue };

export function floorPanel(ctx: PanelCtx) {
  const { state, ui } = ctx;
  const sell = getVenueModel(state.venue).canSell;
  const storage = Object.values(state.artworks).filter((w) => w.status === 'storage');
  const out: Node[] = [];

  // Build toolbar
  out.push(
    h('div', { class: 'section-title' }, 'Build'),
    h('div', { class: 'chips' },
      ...(Object.keys(FIXTURE) as FixtureKind[]).map((k) =>
        h('button', {
          class: `chip ${ui.build === k ? 'on' : ''}`,
          onclick: () => { ui.build = ui.build === k ? null : k; ctx.refresh(); },
        }, FIXTURE[k].label, h('small', {}, money(FIXTURE[k].cost))),
      ),
    ),
  );
  if (ui.build) {
    out.push(h('p', { class: 'hint' }, FIXTURE[ui.build].wallOnly
      ? 'Tap a tile along a back wall to build. Tap the chip again to stop.'
      : 'Tap an empty tile to build. Tap the chip again to stop.'));
  }

  // Selected tile
  if (ui.selected && !ui.build) {
    const f = fixtureAt(state.floor, ui.selected.x, ui.selected.y);
    const card = h('div', { class: 'card' });
    if (!f) {
      const isDoor = state.floor.entrance.x === ui.selected.x && state.floor.entrance.y === ui.selected.y;
      card.append(h('b', {}, isDoor ? 'Entrance' : 'Empty floor'), h('small', { class: 'muted' }, isDoor ? 'Where the public comes in.' : 'Pick something under Build, then tap here.'));
    } else {
      card.append(h('div', { class: 'row' }, h('b', {}, FIXTURE[f.kind].label),
        h('button', { class: 'btn tiny ghost', onclick: () => { if (ctx.act({ type: 'removeFixture', fixtureId: f.id })) ui.selected = null; } }, 'Remove')));
      if (FIXTURE[f.kind].display) {
        const w = f.artworkId ? state.artworks[f.artworkId] : null;
        if (w) {
          const a = state.artists[w.artistId];
          card.append(
            h('div', { class: 'art-line' }, h('i', { class: 'swatch', style: `--h:${hue(w.id)}` }), h('div', {}, h('b', {}, `“${w.title}”`), h('small', {}, a.name))),
            h('small', { class: 'muted' }, `Value ${money(w.value)} · Paid ${money(w.acquiredFor)}`),
            sell ? h('div', { class: 'row' },
              h('span', {}, 'Price ', h('b', {}, money(w.price))),
              h('span', { class: 'row gap' },
                h('button', { class: 'btn tiny', onclick: () => ctx.act({ type: 'setPrice', artworkId: w.id, price: Math.max(50, Math.round((w.price * 0.9) / 50) * 50) }) }, '−10%'),
                h('button', { class: 'btn tiny', onclick: () => ctx.act({ type: 'setPrice', artworkId: w.id, price: Math.round((w.price * 1.1) / 50) * 50 }) }, '+10%'),
              ),
            ) : '',
            h('button', { class: 'btn ghost', onclick: () => ctx.act({ type: 'setDisplay', artworkId: w.id, display: false }) }, 'Take down'),
          );
        } else if (storage.length) {
          card.append(h('small', { class: 'muted' }, 'Empty. Hang something from storage:'),
            ...storage.map((s) => h('button', { class: 'btn ghost', onclick: () => ctx.act({ type: 'setDisplay', artworkId: s.id, display: true, fixtureId: f.id }) }, `Hang “${s.title}”`)));
        } else {
          card.append(h('small', { class: 'muted' }, 'Empty. Buy art in the Market tab.'));
        }
      }
    }
    out.push(card);
  } else if (!ui.build) {
    out.push(h('p', { class: 'hint' }, 'Tap a tile to inspect it. Drag to pan.'));
  }

  // Storage
  out.push(h('div', { class: 'section-title' }, `Storage (${storage.length})`));
  if (!storage.length) out.push(h('p', { class: 'hint' }, 'Nothing in storage.'));
  for (const w of storage) {
    out.push(h('div', { class: 'card row' },
      h('div', { class: 'art-line' }, h('i', { class: 'swatch', style: `--h:${hue(w.id)}` }), h('div', {}, h('b', {}, `“${w.title}”`), h('small', {}, state.artists[w.artistId].name))),
      h('button', { class: 'btn tiny', onclick: () => ctx.act({ type: 'setDisplay', artworkId: w.id, display: true }) }, 'Hang'),
    ));
  }
  return out;
}

