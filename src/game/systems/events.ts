import { CHEESE_PER_GUEST, DIFFICULTY, EVENT_KIND, FIXTURE_EFFECTS, WINE_PER_GUEST } from '../config';
import { countFixtures } from './floor';
import { clamp, Rng } from '../rng';
import type { EventResult, GameState, HospitalityPlan, ScheduledEvent } from '../types';
import { getVenueModel } from '../venues';
import { adjustRelationship } from './artists';
import { notify } from './feed';
import { eventGuests } from './visits';
import { post } from './ledger';

export function hospitalityCost(plan: HospitalityPlan): number {
  return plan.guests * (WINE_PER_GUEST[plan.wine] + CHEESE_PER_GUEST[plan.cheese]);
}

export function eventCost(kind: ScheduledEvent['kind'], plan: HospitalityPlan): { base: number; hospitality: number; total: number } {
  const base = EVENT_KIND[kind].baseCost;
  const hospitality = hospitalityCost(plan);
  return { base, hospitality, total: base + hospitality };
}

/** Rough crowd estimate shown when planning, so the player can size the catering. */
export function expectedAttendance(state: GameState, kind: ScheduledEvent['kind'], featuredArtistIds: string[]): number {
  const cfg = EVENT_KIND[kind];
  const fame = featuredArtistIds.reduce((s, id) => s + (state.artists[id]?.fame ?? 0), 0);
  return Math.round(
    cfg.baseAttendance * DIFFICULTY[state.difficulty].demandMultiplier * (0.5 + state.reputation / 50) * (1 + fame / 100),
  );
}

/** Resolves one event on its evening. Mutates state and returns what happened. */
export function resolveEvent(state: GameState, event: ScheduledEvent, rng: Rng): EventResult {
  const cfg = EVENT_KIND[event.kind];
  const { wine, cheese, guests } = event.hospitality;

  const attendance = Math.max(1, Math.round(expectedAttendance(state, event.kind, event.featuredArtistIds) * rng.range(0.8, 1.2)));
  const coverage = clamp(guests / attendance, 0, 1);
  const quality = (wine + cheese) / 6;
  const barBonus = countFixtures(state.floor, 'bar') * FIXTURE_EFFECTS.barSatisfaction;
  const satisfaction = wine + cheese === 0 ? 0.25 : clamp(coverage * (0.3 + 0.7 * quality) + barBonus, 0, 1);

  const reputationDelta = Math.round(cfg.prestige * (satisfaction - 0.4) * 2 * 10) / 10;
  state.reputation = clamp(state.reputation + reputationDelta, 0, 100);

  const relationshipDeltas: Record<string, number> = {};
  const notes: string[] = [];
  for (const artistId of event.featuredArtistIds) {
    const artist = state.artists[artistId];
    if (!artist) continue;
    let delta = 4 + 6 * satisfaction;
    // Persona hooks. Add new traits here.
    const first = artist.name.split(' ')[0];
    if (artist.traits.includes('loves-wine')) {
      delta += (wine - 1.5) * 2;
      if (wine <= 1) notes.push(`${first} winced at the wine.`);
    }
    if (artist.traits.includes('cheese-snob')) {
      delta += (cheese - 1.5) * 2;
      if (cheese <= 1) notes.push(`${first} has opinions about your cheese.`);
    }
    if (artist.traits.includes('diva') && satisfaction < 0.7) {
      delta -= 8;
      notes.push(`${first} expected a far grander affair.`);
    }
    if (artist.traits.includes('reclusive') && attendance > 100) {
      delta -= 3;
      notes.push(`${first} hid in the back from the crowd.`);
    }
    if (event.kind === 'opening') {
      const hasWorkUp = Object.values(state.artworks).some((w) => w.artistId === artistId && w.status === 'display');
      if (!hasWorkUp) {
        delta -= 10;
        notes.push(`An opening for ${first}, with none of ${first}’s work on the walls?`);
      }
    }
    relationshipDeltas[artistId] = adjustRelationship(state, artistId, delta);
  }

  const venue = getVenueModel(state.venue);
  const { income, soldArtworkIds } = venue.onEvent(state, event, attendance, satisfaction, rng);

  const verdict = satisfaction > 0.7 ? 'A triumph.' : satisfaction > 0.4 ? 'A pleasant evening.' : 'Guests left hungry.';
  notify(state, {
    kind: 'event',
    text: `${EVENT_KIND[event.kind].label}: ${attendance} came, catered for ${guests}. ${verdict}`,
  });
  for (const n of notes) notify(state, { kind: 'artist', text: n });
  eventGuests(state, event, satisfaction, rng);
  state.today.visitors += attendance;

  return {
    eventId: event.id,
    kind: event.kind,
    day: event.day,
    attendance,
    catered: guests,
    satisfaction,
    reputationDelta,
    relationshipDeltas,
    soldArtworkIds,
    income,
    notes,
  };
}

/** Charges the booking. Kept separate so cancellations can refund the same split. */
export function chargeEvent(state: GameState, event: ScheduledEvent): void {
  const cost = eventCost(event.kind, event.hospitality);
  post(state, 'events', -cost.base, `${EVENT_KIND[event.kind].label} booking (day ${event.day})`);
  if (cost.hospitality > 0) post(state, 'hospitality', -cost.hospitality, `Wine & cheese for ${event.hospitality.guests}`);
}
