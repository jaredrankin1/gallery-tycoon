import { RULES } from '../config';
import type { GameState, LedgerCategory } from '../types';

export const weekOf = (day: number) => Math.floor((day - 1) / 7);

/**
 * The only place cash should change. Keeps the books honest.
 * With `merge`, adds onto a recent entry from today with the same category and note
 * (used for the steady trickle of ticket money so the ledger stays readable).
 */
export function post(state: GameState, category: LedgerCategory, amount: number, note: string, merge = false): void {
  const rounded = Math.round(amount);
  if (rounded === 0) return;
  state.cash += rounded;
  if (rounded > 0) state.today.income += rounded;
  else state.today.expenses -= rounded;

  if (merge) {
    // Look back over today's last few lines, so two steady trickles (tickets and
    // the gift shop) don't interleave into a line each per hour.
    for (let i = state.ledger.length - 1; i >= Math.max(0, state.ledger.length - 6); i--) {
      const e = state.ledger[i];
      if (e.day !== state.day) break;
      if (e.category === category && e.note === note) {
        e.amount += rounded;
        return;
      }
    }
  }
  state.ledger.push({ day: state.day, category, amount: rounded, note });
  if (state.ledger.length > RULES.maxLedgerEntries) state.ledger.splice(0, state.ledger.length - RULES.maxLedgerEntries);
}

/** Spend in a category during the current week (Mon–Sun). */
export function spentThisWeek(state: GameState, category: LedgerCategory): number {
  const week = weekOf(state.day);
  return -state.ledger
    .filter((e) => weekOf(e.day) === week && e.category === category && e.amount < 0)
    .reduce((sum, e) => sum + e.amount, 0);
}
