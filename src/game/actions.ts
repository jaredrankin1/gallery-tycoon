import { EVENT_KIND, FIXTURE, RULES } from './config';
import { Rng } from './rng';
import { newId } from './state';
import { adjustRelationship } from './systems/artists';
import { chargeEvent, eventCost } from './systems/events';
import { canPlace, fitsOn, freeDisplayFixture, noSpotFor, unhang } from './systems/floor';
import { post } from './systems/ledger';
import { stepHour } from './clock';
import type { BudgetPlan, EventKind, FixtureKind, GameState, HospitalityPlan, Id } from './types';
import { getVenueModel } from './venues';

/** Every player decision is one of these. The UI never mutates state directly. */
export type Action =
  | { type: 'buyArtwork'; artworkId: Id }
  /** Hang a work on a display fixture (first free one if fixtureId is omitted), or take it down. */
  | { type: 'setDisplay'; artworkId: Id; display: boolean; fixtureId?: Id }
  | { type: 'placeFixture'; kind: FixtureKind; x: number; y: number }
  | { type: 'removeFixture'; fixtureId: Id }
  | { type: 'setPrice'; artworkId: Id; price: number }
  | { type: 'setTicketPrice'; price: number }
  | { type: 'studioVisit'; artistId: Id }
  | { type: 'scheduleEvent'; kind: EventKind; day: number; featuredArtistIds: Id[]; hospitality: HospitalityPlan }
  | { type: 'cancelEvent'; eventId: Id }
  | { type: 'setBudget'; budget: BudgetPlan }
  /** Advance the clock by some hours. The real-time loop sends this. */
  | { type: 'tick'; hours: number };

export type ActionResult = { ok: true; state: GameState } | { ok: false; state: GameState; error: string };

/**
 * Pure from the caller's view: takes a state, returns a new one. Internally it
 * clones and mutates the clone, which keeps systems simple to write.
 */
export function dispatch(prev: GameState, action: Action): ActionResult {
  if (prev.status !== 'playing') return { ok: false, state: prev, error: 'The game is over.' };
  const state = structuredClone(prev);
  const error = apply(state, action);
  return error ? { ok: false, state: prev, error } : { ok: true, state };
}

function apply(state: GameState, action: Action): string | void {
  switch (action.type) {
    case 'buyArtwork': {
      const work = state.artworks[action.artworkId];
      if (!work || work.status !== 'offered') return 'That work is no longer available.';
      if (state.cash - work.price < RULES.overdraftLimit) return 'You can’t afford that.';
      post(state, 'art', -work.price, `Bought "${work.title}"`);
      work.acquiredFor = work.price;
      work.price = Math.round((work.value * state.settings.defaultMarkup) / 50) * 50;
      work.status = 'storage';
      work.day = state.day;
      adjustRelationship(state, work.artistId, 5);
      return;
    }
    case 'setDisplay': {
      const work = state.artworks[action.artworkId];
      if (!work || (work.status !== 'storage' && work.status !== 'display')) return 'You don’t own that work.';
      if (!action.display) {
        unhang(state, work.id);
        work.status = 'storage';
        return;
      }
      const target = action.fixtureId
        ? state.floor.fixtures.find((f) => f.id === action.fixtureId)
        : freeDisplayFixture(state.floor, work);
      if (!target) return noSpotFor(work);
      if (!FIXTURE[target.kind].display) return 'You can’t hang art on that.';
      if (!fitsOn(work, target.kind)) return work.form === 'sculpture' ? 'Sculpture goes on a pedestal.' : 'That piece needs a wall.';
      // Swapping: whatever was there goes back to storage.
      if (target.artworkId && target.artworkId !== work.id) state.artworks[target.artworkId].status = 'storage';
      unhang(state, work.id);
      target.artworkId = work.id;
      work.status = 'display';
      return;
    }
    case 'placeFixture': {
      const cfg = FIXTURE[action.kind];
      const err = canPlace(state.floor, action.kind, action.x, action.y);
      if (err) return err;
      if (state.cash - cfg.cost < RULES.overdraftLimit) return 'You can’t afford that.';
      post(state, 'fit-out', -cfg.cost, `Built ${cfg.label.toLowerCase()}`);
      state.floor.fixtures.push({ id: newId(state, 'f'), kind: action.kind, x: action.x, y: action.y });
      return;
    }
    case 'removeFixture': {
      const idx = state.floor.fixtures.findIndex((f) => f.id === action.fixtureId);
      if (idx < 0) return 'Nothing there.';
      const [f] = state.floor.fixtures.splice(idx, 1);
      if (f.artworkId) state.artworks[f.artworkId].status = 'storage';
      return;
    }
    case 'setPrice': {
      if (!getVenueModel(state.venue).canSell) return 'Museums don’t sell their collection.';
      const work = state.artworks[action.artworkId];
      if (!work || work.status === 'offered' || work.status === 'sold') return 'You don’t own that work.';
      if (!(action.price > 0)) return 'Price must be above zero.';
      work.price = Math.round(action.price);
      return;
    }
    case 'setTicketPrice': {
      if (state.venue !== 'museum') return 'Galleries don’t charge entry.';
      if (action.price < 0 || action.price > 200) return 'Pick a price between $0 and $200.';
      state.settings.ticketPrice = Math.round(action.price);
      return;
    }
    case 'studioVisit': {
      const artist = state.artists[action.artistId];
      if (!artist) return 'Unknown artist.';
      if (artist.lastVisitDay === state.day) return `You’ve already visited ${artist.name} today.`;
      post(state, 'artist-care', -RULES.studioVisitCost, `Studio visit: ${artist.name}`);
      adjustRelationship(state, artist.id, RULES.studioVisitGain);
      artist.lastVisitDay = state.day;
      return;
    }
    case 'scheduleEvent': {
      const cfg = EVENT_KIND[action.kind];
      if (action.day < state.day + cfg.minDaysAhead) return `Book a ${cfg.label.toLowerCase()} at least ${cfg.minDaysAhead} day(s) ahead.`;
      if (state.events.some((e) => e.day === action.day)) return 'You already have an event that night.';
      const n = action.featuredArtistIds.length;
      if (n < cfg.minFeatured || n > cfg.maxFeatured) {
        return cfg.minFeatured === cfg.maxFeatured
          ? `A ${cfg.label.toLowerCase()} features exactly ${cfg.minFeatured} artist(s).`
          : `A ${cfg.label.toLowerCase()} features ${cfg.minFeatured}–${cfg.maxFeatured} artists.`;
      }
      for (const id of action.featuredArtistIds) {
        const a = state.artists[id];
        if (!a) return 'Unknown artist.';
        if (a.relationship < 0) return `${a.name} won’t appear at your events right now.`;
      }
      if (action.hospitality.guests < 0) return 'Guest count can’t be negative.';
      const cost = eventCost(action.kind, action.hospitality);
      if (state.cash - cost.total < RULES.overdraftLimit) return 'You can’t afford that event.';
      const event = {
        id: newId(state, 'e'),
        kind: action.kind,
        day: action.day,
        featuredArtistIds: [...action.featuredArtistIds],
        hospitality: { ...action.hospitality },
        cost: cost.total,
      };
      chargeEvent(state, event);
      state.events.push(event);
      state.events.sort((a, b) => a.day - b.day);
      return;
    }
    case 'cancelEvent': {
      const idx = state.events.findIndex((e) => e.id === action.eventId);
      if (idx < 0) return 'No such event.';
      const [event] = state.events.splice(idx, 1);
      post(state, 'events', event.cost * 0.5, `Cancelled ${EVENT_KIND[event.kind].label.toLowerCase()} (50% refund)`);
      for (const id of event.featuredArtistIds) adjustRelationship(state, id, -5);
      return;
    }
    case 'setBudget': {
      state.budget = { art: Math.max(0, action.budget.art), hospitality: Math.max(0, action.budget.hospitality) };
      return;
    }
    case 'tick': {
      const rng = new Rng(state.rng);
      for (let i = 0; i < action.hours && state.status === 'playing'; i++) stepHour(state, rng);
      state.rng = rng.state;
      return;
    }
  }
}
