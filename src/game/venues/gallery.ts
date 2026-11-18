import { DIFFICULTY, RULES } from '../config';
import { clamp } from '../rng';
import { adjustRelationship } from '../systems/artists';
import { unhang } from '../systems/floor';
import { post } from '../systems/ledger';
import type { Artwork, GameState } from '../types';
import type { VenueModel } from './types';

/** Chance a displayed work sells to one "unit" of interest. */
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

function sell(state: GameState, work: Artwork, where: string): void {
  work.status = 'sold';
  unhang(state, work.id);
  work.week = state.week;
  post(state, 'sales', work.price, `Sold "${work.title}" ${where}`);
  // Artists like seeing their work find a home, and like it more when it sells well.
  const premium = work.price / Math.max(1, work.value);
  adjustRelationship(state, work.artistId, premium >= 1 ? 4 : 1);
}

export const galleryModel: VenueModel = {
  canSell: true,

  weekly(state, rng) {
    const displayed = Object.values(state.artworks).filter((w) => w.status === 'display');
    const visitors = Math.round(
      (30 + displayed.length * 8) * (0.5 + state.reputation / 50) * DIFFICULTY[state.difficulty].demandMultiplier,
    );
    const soldArtworkIds: string[] = [];
    for (const work of displayed) {
      if (rng.chance(saleChance(state, work, 1))) {
        sell(state, work, 'off the floor');
        soldArtworkIds.push(work.id);
      }
    }
    return { visitors, soldArtworkIds, notes: [] };
  },

  onEvent(state, event, attendance, satisfaction, rng) {
    // Happy, well-fed crowds buy. Featured artists' works get the spotlight.
    const boost = (attendance / 40) * (0.4 + satisfaction);
    const soldArtworkIds: string[] = [];
    for (const work of Object.values(state.artworks)) {
      if (work.status !== 'display') continue;
      const featured = event.featuredArtistIds.includes(work.artistId);
      if (rng.chance(saleChance(state, work, featured ? boost * 1.5 : boost * 0.5))) {
        sell(state, work, `at the ${event.kind}`);
        soldArtworkIds.push(work.id);
      }
    }
    return { income: 0, soldArtworkIds };
  },
};
