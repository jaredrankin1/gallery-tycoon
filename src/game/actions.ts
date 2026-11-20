import { EVENT_KIND, FIXTURE, MERCH, RULES, SHOP } from './config';
import { Rng } from './rng';
import { newId } from './state';
import { adjustRelationship } from './systems/artists';
import { ensureStaff, park, staffUpdate, unpark } from './systems/autohang';
import { closeExhibition, mountExhibition } from './systems/exhibitions';
import { beginTalk, chooseTalk, leaveTalk } from './systems/artistCalls';
import { endPatronage, setStipend, signPatron, wardOffRival } from './systems/patronage';
import { chargeEvent, eventCost } from './systems/events';
import { canPlace, fitsOn, freeDisplayFixture, noSpotFor, unhang } from './systems/floor';
import { post } from './systems/ledger';
import { openingStock, orderStock, shelfSpace } from './systems/shop';
import { stepHour } from './clock';
import type { BudgetPlan, EventKind, ExhibitionTheme, FixtureKind, GameState, HospitalityPlan, Id, MerchKind, StipendTier } from './types';
import { getVenueModel } from './venues';
import { absHour } from './systems/visits';

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
  /** Marisol places new art herself (makes room, builds a spot if affordable, hangs it). */
  | { type: 'setAutoHang'; on: boolean }
  /** Patronage: put an artist on a weekly stipend, change it, or end it. */
  | { type: 'signPatron'; artistId: Id; tier: StipendTier }
  | { type: 'setStipend'; artistId: Id; tier: StipendTier }
  | { type: 'endPatronage'; artistId: Id }
  /** Open a themed show built from what's on the walls, or close it early. */
  | { type: 'mountExhibition'; theme: ExhibitionTheme }
  | { type: 'closeExhibition' }
  /** Gift shop: order wholesale batches of one line, set its price, or toggle overnight restocking. */
  | { type: 'restockMerch'; kind: MerchKind; batches: number }
  | { type: 'setMerchPrice'; kind: MerchKind; price: number }
  | { type: 'setAutoRestock'; on: boolean }
  /** Artist visits: walk over and talk, pick a line, or walk off. */
  | { type: 'talkToArtist' }
  | { type: 'talkChoose'; optionId: string }
  | { type: 'leaveTalk' }
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
  if (error) return { ok: false, state: prev, error };
  // New arrivals: Marisol picks them up. After a tick the screen is at the new hour;
  // otherwise it's partway through the current one, so she starts at the next.
  staffUpdate(state, absHour(state) + (action.type === 'tick' ? 0 : 1));
  return { ok: true, state };
}

function apply(state: GameState, action: Action): string | void {
  switch (action.type) {
    case 'buyArtwork': {
      const work = state.artworks[action.artworkId];
      if (!work || work.status !== 'offered' || work.withArtist) return 'That work is no longer available.';
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
        park(state, work.id);
        return;
      }
      const target = action.fixtureId
        ? state.floor.fixtures.find((f) => f.id === action.fixtureId)
        : freeDisplayFixture(state.floor, work);
      if (!target) return noSpotFor(work);
      if (!FIXTURE[target.kind].display) return 'You can’t hang art on that.';
      if (!fitsOn(work, target.kind)) return work.form === 'sculpture' ? 'Sculpture goes on a pedestal.' : 'That piece needs a wall.';
      // Swapping: whatever was there goes back to storage.
      if (target.artworkId && target.artworkId !== work.id) {
        state.artworks[target.artworkId].status = 'storage';
        park(state, target.artworkId);
      }
      unpark(state, work.id);
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
      if (action.kind === 'shop') openingStock(state);
      return;
    }
    case 'removeFixture': {
      const idx = state.floor.fixtures.findIndex((f) => f.id === action.fixtureId);
      if (idx < 0) return 'Nothing there.';
      const [f] = state.floor.fixtures.splice(idx, 1);
      if (f.artworkId) {
        state.artworks[f.artworkId].status = 'storage';
        park(state, f.artworkId);
      }
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
      artist.studioVisits += 1;
      wardOffRival(state, artist);
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
    case 'setAutoHang': {
      ensureStaff(state).autoHang = action.on;
      return;
    }
    case 'signPatron':
      return signPatron(state, action.artistId, action.tier);
    case 'setStipend':
      return setStipend(state, action.artistId, action.tier);
    case 'endPatronage':
      return endPatronage(state, action.artistId);
    case 'mountExhibition': {
      const rng = new Rng(state.rng);
      const err = mountExhibition(state, action.theme, rng);
      state.rng = rng.state;
      return err;
    }
    case 'closeExhibition':
      return closeExhibition(state, true);
    case 'restockMerch': {
      const cfg = MERCH[action.kind];
      if (!cfg) return 'Unknown item.';
      if (!(action.batches >= 1)) return 'Order at least one batch.';
      const qty = Math.min(Math.floor(action.batches) * cfg.batch, shelfSpace(state, action.kind));
      if (qty > 0 && state.cash - qty * cfg.unitCost < RULES.overdraftLimit) return 'You can’t afford that.';
      return orderStock(state, action.kind, qty);
    }
    case 'setMerchPrice': {
      const cfg = MERCH[action.kind];
      if (!cfg) return 'Unknown item.';
      const max = cfg.fairPrice * SHOP.maxPriceMultiple;
      if (!(action.price >= 1) || action.price > max) return `Pick a price between $1 and $${max}.`;
      state.shop.lines[action.kind].price = Math.round(action.price);
      return;
    }
    case 'setAutoRestock': {
      state.shop.autoRestock = action.on;
      return;
    }
    case 'talkToArtist': {
      const rng = new Rng(state.rng);
      const err = beginTalk(state, rng);
      state.rng = rng.state;
      return err;
    }
    case 'talkChoose': {
      const rng = new Rng(state.rng);
      const err = chooseTalk(state, action.optionId, rng);
      state.rng = rng.state;
      return err;
    }
    case 'leaveTalk':
      return leaveTalk(state);
    case 'tick': {
      const rng = new Rng(state.rng);
      for (let i = 0; i < action.hours && state.status === 'playing'; i++) {
        stepHour(state, rng);
        // Marisol works hour by hour too, so a long skip still sees her clear the storeroom.
        staffUpdate(state, absHour(state));
      }
      state.rng = rng.state;
      return;
    }
  }
}
