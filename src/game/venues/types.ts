import type { Rng } from '../rng';
import type { GameState, Id, ScheduledEvent } from '../types';

/**
 * Strategy for how a venue earns money. Gallery and museum each implement it;
 * a new venue type (pop-up, auction house...) is one new file plus a registry entry.
 */
export interface VenueModel {
  /** One hour of normal trading. Posts its own ledger entries. Returns visitors this hour. */
  hour(state: GameState, rng: Rng): number;
  /** Expected visitors for a full day, for the HUD and the renderer's crowd size. */
  expectedDailyVisitors(state: GameState): number;
  /** Extra revenue from an event on top of normal trading. */
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
