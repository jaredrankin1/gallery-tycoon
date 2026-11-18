import { DIFFICULTY, FIXTURE_EFFECTS, RULES } from '../config';
import { countFixtures } from '../systems/floor';
import { clamp } from '../rng';
import { post } from '../systems/ledger';
import type { GameState } from '../types';
import type { VenueModel } from './types';

/** How much people want to see what's on the walls. 0 with an empty museum. */
export function collectionAppeal(state: GameState): number {
  return Object.values(state.artworks)
    .filter((w) => w.status === 'display')
    .reduce((sum, w) => sum + 0.2 + (state.artists[w.artistId]?.fame ?? 0) / 100, 0);
}

/** Ticket price elasticity: ~1.0 at $15, falls off as price climbs. */
export function priceDemand(ticketPrice: number): number {
  return clamp(1.6 - ticketPrice / 25, 0.05, 1.6);
}

export const museumModel: VenueModel = {
  canSell: false,

  weekly(state, rng) {
    const appeal = collectionAppeal(state);
    const visitors = Math.round(
      RULES.museumBaseVisitors *
        DIFFICULTY[state.difficulty].demandMultiplier *
        (0.3 + state.reputation / 50) *
        appeal *
        priceDemand(state.settings.ticketPrice) *
        (1 + countFixtures(state.floor, 'bench') * FIXTURE_EFFECTS.benchVisitorBonus) *
        rng.range(0.85, 1.15),
    );
    if (visitors > 0 && state.settings.ticketPrice > 0) {
      post(state, 'tickets', visitors * state.settings.ticketPrice, `${visitors} visitors`);
    }
    // A strong permanent collection slowly builds prestige.
    state.reputation = clamp(state.reputation + Math.min(appeal, 6) * 0.1, 0, 100);
    const notes = appeal === 0 ? ['Nobody buys a ticket to look at empty walls. Hang some art.'] : [];
    return { visitors, soldArtworkIds: [], notes };
  },

  onEvent(state, event, attendance) {
    // Event guests pay at the door, galas at a premium.
    const perHead = event.kind === 'gala' ? state.settings.ticketPrice * 4 : state.settings.ticketPrice;
    const income = attendance * perHead;
    if (income > 0) post(state, 'tickets', income, `Door at the ${event.kind}`);
    return { income, soldArtworkIds: [] };
  },
};
