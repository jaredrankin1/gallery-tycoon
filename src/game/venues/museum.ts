import { DIFFICULTY, FIXTURE_EFFECTS, RULES, TIME } from '../config';
import { clamp } from '../rng';
import { notify } from '../systems/feed';
import { countFixtures } from '../systems/floor';
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

  expectedDailyVisitors(state) {
    return Math.round(
      RULES.museumBaseVisitors *
        DIFFICULTY[state.difficulty].demandMultiplier *
        (0.3 + state.reputation / 50) *
        collectionAppeal(state) *
        priceDemand(state.settings.ticketPrice) *
        (1 + countFixtures(state.floor, 'bench') * FIXTURE_EFFECTS.benchVisitorBonus),
    );
  },

  hour(state, rng) {
    const exp = museumModel.expectedDailyVisitors(state) / TIME.ticksPerDay;
    const visitors = Math.floor(exp * rng.range(0.8, 1.2) + rng.next());
    if (visitors > 0 && state.settings.ticketPrice > 0) {
      post(state, 'tickets', visitors * state.settings.ticketPrice, 'Ticket sales', true);
    }
    // A strong permanent collection slowly builds prestige.
    const gain = (Math.min(collectionAppeal(state), 6) * 0.015) / TIME.ticksPerDay;
    state.reputation = clamp(state.reputation + gain, 0, 100);
    return visitors;
  },

  onEvent(state, event, attendance) {
    // Event guests pay at the door, galas at a premium.
    const perHead = event.kind === 'gala' ? state.settings.ticketPrice * 4 : state.settings.ticketPrice;
    const income = attendance * perHead;
    if (income > 0) {
      post(state, 'tickets', income, `Door at the ${event.kind}`);
      notify(state, { kind: 'tickets', text: `Door takings: $${income.toLocaleString('en-US')}`, amount: income });
    }
    return { income, soldArtworkIds: [] };
  },
};
