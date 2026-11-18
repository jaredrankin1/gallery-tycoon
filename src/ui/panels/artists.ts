import { RULES, relationshipLabel } from '../../game';
import { h, meter, money } from '../dom';
import type { PanelCtx } from './types';

export function artistsPanel(ctx: PanelCtx) {
  const { state } = ctx;
  return [
    h('div', { class: 'section-title' }, 'Artists'),
    ...Object.values(state.artists).map((a) => {
      const owned = Object.values(state.artworks).filter((w) => w.artistId === a.id && (w.status === 'storage' || w.status === 'display')).length;
      return h('div', { class: 'card' },
        h('div', { class: 'row' }, h('div', {}, h('b', {}, a.name), h('small', {}, `${a.medium} · ${a.style}`)),
          h('span', { class: `pill rel-${Math.sign(Math.round(a.relationship / 10))}` }, relationshipLabel(a.relationship))),
        h('small', { class: 'muted' }, a.bio),
        h('div', { class: 'stat' }, h('span', {}, 'Relationship'), meter(a.relationship + 100, 200, a.relationship < 0 ? 'bad' : 'good')),
        h('div', { class: 'stat' }, h('span', {}, 'Fame'), meter(a.fame)),
        h('div', { class: 'row' },
          h('div', { class: 'tags' }, ...a.traits.map((t) => h('span', { class: 'tag' }, t)), owned ? h('span', { class: 'tag' }, `${owned} owned`) : null),
          h('button', { class: 'btn tiny', onclick: () => ctx.act({ type: 'studioVisit', artistId: a.id }) }, `Visit ${money(RULES.studioVisitCost)}`),
        ),
      );
    }),
  ];
}
