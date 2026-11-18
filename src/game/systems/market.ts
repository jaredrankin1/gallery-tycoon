import { TITLE_A, TITLE_B } from '../../data/artists';
import { DIFFICULTY, RULES } from '../config';
import { Rng } from '../rng';
import type { GameState } from '../types';
import { baseWorkValue, friendDiscount } from './artists';

/** Drops expired offers and tops the market back up with new works. */
export function refreshMarket(state: GameState, rng: Rng): void {
  for (const [id, work] of Object.entries(state.artworks)) {
    if (work.status === 'offered' && work.week < state.week) delete state.artworks[id];
  }

  // Artists who are angry with you won't sell to you. Friends show up more often.
  const sellers = Object.values(state.artists).filter((a) => a.relationship > -10);
  if (sellers.length === 0) return;
  const weighted = sellers.flatMap((a) => (a.relationship >= RULES.relationshipForOffers ? [a, a, a] : [a]));

  const diff = DIFFICULTY[state.difficulty];
  let open = Object.values(state.artworks).filter((w) => w.status === 'offered').length;
  while (open < RULES.marketSize) {
    const artist = rng.pick(weighted);
    const value = Math.round((baseWorkValue(artist) * rng.range(0.7, 1.4)) / 50) * 50;
    const price = Math.round((value * diff.artPriceMultiplier * (1 - friendDiscount(artist))) / 50) * 50;
    const id = `w-${state.nextId++}`;
    state.artworks[id] = {
      id,
      title: `${rng.pick(TITLE_A)} ${rng.pick(TITLE_B)}`,
      artistId: artist.id,
      value,
      acquiredFor: 0,
      price,
      status: 'offered',
      week: state.week + RULES.offerLifetimeWeeks - 1,
    };
    open++;
  }
}
