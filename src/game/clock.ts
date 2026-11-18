import { DIFFICULTY, GUESTS, RULES, TIME, VENUE } from './config';
import type { Rng } from './rng';
import { endOfDayArtists } from './systems/artists';
import { resolveEvent } from './systems/events';
import { notify } from './systems/feed';
import { post } from './systems/ledger';
import { refreshMarket } from './systems/market';
import { closeForTheNight, hourOfGuests } from './systems/visits';
import type { DayReport, GameState } from './types';
import { getVenueModel } from './venues';

export const emptyDay = (day: number): DayReport => ({ day, income: 0, expenses: 0, visitors: 0, sales: 0 });

export const weekday = (day: number) => TIME.weekdays[(day - 1) % 7];

/** "7 PM" for the current tick. */
export function clockLabel(tick: number): string {
  const h = TIME.openHour + tick;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * Advances the simulation by one hour. The UI calls this on a real-time
 * timer (faster or slower with the speed setting); tests call it directly.
 *
 * Order within an hour:
 *  1. Normal trading (sales roll or tickets trickle in)
 *  2. At 7 PM, tonight's event
 *  3. At closing: bills (weekly), artist drift, market refresh, day report
 */
export function stepHour(state: GameState, rng: Rng): void {
  if (state.status !== 'playing') return;
  const venue = getVenueModel(state.venue);

  state.today.visitors += venue.hour(state, rng);
  hourOfGuests(state, rng);

  if (state.tick === TIME.eventTick) {
    const tonight = state.events.filter((e) => e.day === state.day);
    for (const e of tonight) resolveEvent(state, e, rng);
    state.events = state.events.filter((e) => e.day !== state.day);
  }

  if (state.tick === TIME.ticksPerDay - 1) endOfDay(state, rng);
  else state.tick += 1;

  if (state.cash < RULES.overdraftLimit) {
    state.status = 'bankrupt';
    notify(state, { kind: 'warn', text: 'The bank has called in your overdraft. Doors closed.' });
  }
}

function endOfDay(state: GameState, rng: Rng): void {
  if ((state.day - 1) % 7 === TIME.billsWeekday) {
    const diff = DIFFICULTY[state.difficulty];
    const upkeep = VENUE[state.venue].weeklyUpkeep;
    post(state, 'rent', -diff.weeklyRent, 'Rent');
    post(state, 'staff', -diff.weeklyStaff, 'Staff');
    if (upkeep > 0) post(state, 'staff', -upkeep, 'Guards & climate control');
    const total = diff.weeklyRent + diff.weeklyStaff + upkeep;
    notify(state, { kind: 'bills', text: `Weekly bills paid: $${total.toLocaleString('en-US')}`, amount: -total });
  }

  endOfDayArtists(state);
  closeForTheNight(state, rng);
  state.buzz *= GUESTS.buzzDecay;

  state.history.push(state.today);
  if (state.history.length > RULES.historyDays) state.history.shift();

  state.day += 1;
  state.tick = 0;
  state.today = emptyDay(state.day);
  refreshMarket(state, rng);
}
