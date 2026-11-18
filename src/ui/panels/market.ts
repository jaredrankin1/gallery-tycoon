import { h, money } from '../dom';
import { hue } from './floor';
import type { PanelCtx } from './types';

export function marketPanel(ctx: PanelCtx) {
  const { state } = ctx;
  const offers = Object.values(state.artworks).filter((w) => w.status === 'offered');
  return [
    h('div', { class: 'section-title' }, 'On offer this week'),
    h('p', { class: 'hint' }, 'Artists who like you offer more often and give a discount.'),
    ...offers.map((w) => {
      const a = state.artists[w.artistId];
      const deal = w.price < w.value;
      return h('div', { class: 'card' },
        h('div', { class: 'art-line' }, h('i', { class: 'swatch big', style: `--h:${hue(w.id)}` }),
          h('div', {}, h('b', {}, `“${w.title}”`), h('small', {}, `${a.name} · ${a.medium}`))),
        h('div', { class: 'row' },
          h('small', { class: 'muted' }, `Value ${money(w.value)}${w.week === state.week ? ' · last week' : ''}`),
          h('button', { class: `btn ${deal ? 'primary' : ''}`, onclick: () => ctx.act({ type: 'buyArtwork', artworkId: w.id }) }, `Buy ${money(w.price)}`),
        ),
      );
    }),
  ];
}
