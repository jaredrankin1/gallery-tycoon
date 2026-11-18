import { TITLE_A, TITLE_B } from '../../data/artists';
import { DIFFICULTY, RULES } from '../config';
import { Rng } from '../rng';
import type { GameState } from '../types';
import { baseWorkValue, friendDiscount } from './artists';
import { notify } from './feed';

/** Drops expired offers and adds up to `count` new ones (never above marketSize). */
export function refreshMarket(state: GameState, rng: Rng, count: number = RULES.newOffersPerDay): void {
  for (const [id, work] of Object.entries(state.artworks)) {
    if (work.status === 'offered' && work.day < state.day) delete state.artworks[id];
  }

  // Artists who are angry with you won't sell to you. Friends show up more often.
  const sellers = Object.values(state.artists).filter((a) => a.relationship > -10);
  if (sellers.length === 0) return;
  const weighted = sellers.flatMap((a) => (a.relationship >= RULES.relationshipForOffers ? [a, a, a] : [a]));

  const diff = DIFFICULTY[state.difficulty];
  let open = Object.values(state.artworks).filter((w) => w.status === 'offered').length;
  for (let i = 0; i < count && open < RULES.marketSize; i++, open++) {
    const artist = rng.pick(weighted);
    const value = Math.round((baseWorkValue(artist) * rng.range(0.7, 1.4)) / 50) * 50;
    const price = Math.round((value * diff.artPriceMultiplier * (1 - friendDiscount(artist))) / 50) * 50;
    const id = `w-${state.nextId++}`;
    const title = `${rng.pick(TITLE_A)} ${rng.pick(TITLE_B)}`;
    state.artworks[id] = { id, title, artistId: artist.id, value, acquiredFor: 0, price, status: 'offered', day: state.day + RULES.offerLifetimeDays - 1 };
    if (artist.relationship >= RULES.relationshipForOffers) {
      notify(state, { kind: 'market', text: `${artist.name.split(' ')[0]} offered you “${title}”.` });
    }
  }
}
