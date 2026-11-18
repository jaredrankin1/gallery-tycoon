import { RULES } from '../config';
import type { GameState, LedgerCategory } from '../types';

/** The only place cash should change. Keeps the books honest. */
export function post(state: GameState, category: LedgerCategory, amount: number, note: string): void {
  const rounded = Math.round(amount);
  state.cash += rounded;
  state.ledger.push({ week: state.week, category, amount: rounded, note });
  if (state.ledger.length > RULES.maxLedgerEntries) state.ledger.splice(0, state.ledger.length - RULES.maxLedgerEntries);
}

export function spentThisWeek(state: GameState, category: LedgerCategory, week = state.week): number {
  return -state.ledger
    .filter((e) => e.week === week && e.category === category && e.amount < 0)
    .reduce((sum, e) => sum + e.amount, 0);
}

export function totalsForWeek(state: GameState, week: number) {
  let income = 0;
  let expenses = 0;
  for (const e of state.ledger) {
    if (e.week !== week) continue;
    if (e.amount >= 0) income += e.amount;
    else expenses -= e.amount;
  }
  return { income, expenses };
}
