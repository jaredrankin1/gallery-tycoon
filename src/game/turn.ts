import { DIFFICULTY, RULES, VENUE } from './config';
import type { Rng } from './rng';
import { tickArtists } from './systems/artists';
import { resolveEvent } from './systems/events';
import { post, totalsForWeek } from './systems/ledger';
import { refreshMarket } from './systems/market';
import type { GameState, WeeklyReport } from './types';
import { getVenueModel } from './venues';

/**
 * The weekly loop. Order matters and is the main thing to tweak when balancing:
 *  1. Normal trading (sales or tickets)
 *  2. Events booked for this week
 *  3. Fixed costs
 *  4. Artist drift
 *  5. Report, roll the week, refresh the market
 */
export function advanceWeek(state: GameState, rng: Rng): WeeklyReport {
  const week = state.week;
  const notes: string[] = [];
  const venue = getVenueModel(state.venue);

  const trading = venue.weekly(state, rng);
  notes.push(...trading.notes);

  const sales = [...trading.soldArtworkIds];
  const events = state.events.filter((e) => e.week === week).map((e) => resolveEvent(state, e, rng));
  for (const r of events) sales.push(...r.soldArtworkIds);
  state.events = state.events.filter((e) => e.week !== week);

  const diff = DIFFICULTY[state.difficulty];
  post(state, 'rent', -diff.weeklyRent, 'Rent');
  post(state, 'staff', -diff.weeklyStaff, 'Staff');
  const upkeep = VENUE[state.venue].weeklyUpkeep;
  if (upkeep > 0) post(state, 'staff', -upkeep, 'Guards & climate control');

  tickArtists(state, notes);

  const { income, expenses } = totalsForWeek(state, week);
  const report: WeeklyReport = {
    week,
    income,
    expenses,
    cashAfter: state.cash,
    visitors: trading.visitors + events.reduce((s, e) => s + e.attendance, 0),
    sales,
    events,
    notes,
  };
  state.reports.push(report);
  if (state.reports.length > RULES.maxReports) state.reports.shift();

  if (state.cash < RULES.overdraftLimit) {
    state.status = 'bankrupt';
    notes.push('The bank has called in your overdraft. Doors closed.');
    return report;
  }

  state.week += 1;
  refreshMarket(state, rng);
  return report;
}
