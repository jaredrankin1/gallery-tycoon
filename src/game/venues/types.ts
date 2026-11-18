import type { Rng } from '../rng';
import type { GameState, Id, ScheduledEvent } from '../types';

export interface WeeklyVenueResult {
  visitors: number;
  soldArtworkIds: Id[];
  notes: string[];
}

/**
 * Strategy for how a venue earns money. Gallery and museum each implement it;
 * a new venue type (pop-up, auction house...) is one new file plus a registry entry.
 */
export interface VenueModel {
  /** Normal week of foot traffic. Posts its own ledger entries. */
  weekly(state: GameState, rng: Rng): WeeklyVenueResult;
  /** Extra revenue from an event on top of the normal week. */
  onEvent(
    state: GameState,
    event: ScheduledEvent,
    attendance: number,
    satisfaction: number,
    rng: Rng,
  ): { income: number; soldArtworkIds: Id[] };
  /** Can the player sell works? Museums can't. */
  canSell: boolean;
}
