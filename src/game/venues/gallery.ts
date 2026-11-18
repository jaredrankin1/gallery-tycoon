import { DIFFICULTY, RULES, TIME } from '../config';
import { clamp } from '../rng';
import { adjustRelationship } from '../systems/artists';
import { notify } from '../systems/feed';
import { unhang } from '../systems/floor';
import { post } from '../systems/ledger';
import type { Artwork, GameState } from '../types';
import type { VenueModel } from './types';

/** Daily chance a displayed work sells, times `boost`. */
function saleChance(state: GameState, work: Artwork, boost: number): number {
  const artist = state.artists[work.artistId];
  const priceFactor = clamp(Math.pow(work.value / Math.max(1, work.price), 2), 0.05, 2);
  return clamp(
    RULES.gallerySaleChance *
      DIFFICULTY[state.difficulty].demandMultiplier *
      (0.5 + state.reputation / 100) *
      (0.6 + (artist?.fame ?? 0) / 100) *
      priceFactor *
      boost,
    0,
    0.9,
  );
}

/** Sells a work off the floor. `guestId` names the buyer when it's one of the regulars. */
export function sellArtwork(state: GameState, work: Artwork, where: string, guestId?: string): void {
  const spot = state.floor.fixtures.find((f) => f.artworkId === work.id);
  work.status = 'sold';
  work.day = state.day;
  unhang(state, work.id);
  post(state, 'sales', work.price, `Sold “${work.title}” ${where}`);
  state.today.sales += 1;
  notify(state, {
    kind: 'sale',
    guestId,
    text: `Sold “${work.title}” ${where.startsWith('to ') ? where + ' ' : ''}for $${work.price.toLocaleString('en-US')}`,
    amount: work.price,
    at: spot ? { x: spot.x, y: spot.y } : undefined,
  });
  // Artists like seeing their work find a home, and like it more when it sells well.
  const premium = work.price / Math.max(1, work.value);
  adjustRelationship(state, work.artistId, premium >= 1 ? 4 : 1);
}

const displayed = (state: GameState) => Object.values(state.artworks).filter((w) => w.status === 'display');

export const galleryModel: VenueModel = {
  canSell: true,

  expectedDailyVisitors(state) {
    return Math.round(
      (5 + displayed(state).length * 1.5) * (0.5 + state.reputation / 50) * DIFFICULTY[state.difficulty].demandMultiplier + state.buzz,
    );
  },

  hour(state, rng) {
    for (const work of displayed(state)) {
      if (rng.chance(saleChance(state, work, 1) / TIME.ticksPerDay)) sellArtwork(state, work, 'off the floor');
    }
    const exp = galleryModel.expectedDailyVisitors(state) / TIME.ticksPerDay;
    return Math.floor(exp + rng.next());
  },

  onEvent(state, event, attendance, satisfaction, rng) {
    // Happy, well-fed crowds buy. Featured artists' works get the spotlight.
    const boost = (attendance / 6) * (0.4 + satisfaction);
    const soldArtworkIds: string[] = [];
    for (const work of displayed(state)) {
      const featured = event.featuredArtistIds.includes(work.artistId);
      if (rng.chance(saleChance(state, work, featured ? boost * 1.5 : boost * 0.5))) {
        sellArtwork(state, work, `at the ${event.kind}`);
        soldArtworkIds.push(work.id);
      }
    }
    return { income: 0, soldArtworkIds };
  },
};
