import { AUCTION, bidIncrement, HOSTED_AUCTION, RULES } from '../config';
import { clamp, Rng } from '../rng';
import type { Artist, AuctionLot, AuctionSale, GameState } from '../types';
import { adjustRelationship } from './artists';
import { addFame, workValue } from './careers';
import { notify } from './feed';
import { post } from './ledger';
import { freshPainting, rollGrade } from './market';

// Auctions, both sides of the paddle.
//
// Buying: an auction house holds a sale every week. Its lots are on view for
// the days before, and on sale day you bid against the room one increment at
// a time. The room has a hidden ceiling per lot, and the auctioneer bids on
// the consignor's behalf up to the reserve. Over a run, the hammer comes in
// below what a dealer asks, but nothing is certain and the buyer's premium is
// added on top.
//
// Hosting: an "auction night" event. Collectors consign work, you sell it to
// the evening's crowd and keep a commission on every lot that sells.

const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const round50 = (n: number) => Math.round(n / 50) * 50;

/**
 * A private stream for auction rolls, so a sale doesn't shift the game's main
 * RNG (and every seeded run stays the same as before auctions existed).
 */
const saleRng = (state: GameState, salt: number) => new Rng(((state.rng ^ Math.imul(state.day + 1, 0x9e3779b1) ^ salt) >>> 0) || 1);

/** The first sale day on or after `fromDay`. */
export function nextSaleDay(fromDay: number): number {
  let d = fromDay;
  while ((d - 1) % 7 !== AUCTION.weekday) d++;
  return d;
}

const pickConsigned = (artists: Artist[], rng: Rng): Artist => {
  // Auction houses want names: weight by fame.
  const total = artists.reduce((s, a) => s + a.fame, 0);
  let r = rng.next() * total;
  for (const a of artists) if ((r -= a.fame) <= 0) return a;
  return artists[artists.length - 1];
};

/** Catalogues the sale on `day`: creates its lots as works with status 'lot'. */
export function createSale(state: GameState, day: number, rng: Rng = saleRng(state, day)): AuctionSale {
  const sale: AuctionSale = { id: `sale-${day}`, house: AUCTION.houses[Math.floor(day / 7) % AUCTION.houses.length], day, lots: [] };
  const pool = Object.values(state.artists).filter((a) => a.fame >= AUCTION.minFame);
  const artists = pool.length ? pool : Object.values(state.artists);
  for (let tries = 0; sale.lots.length < AUCTION.lots && tries < AUCTION.lots * 4; tries++) {
    const artist = pickConsigned(artists, rng);
    const { painting } = freshPainting(state, artist, rng);
    if (!painting) continue;
    const grade = rollGrade(artist, rng);
    const value = workValue(artist, { grade });
    const id = `w-${state.nextId++}`;
    state.artworks[id] = {
      id,
      title: painting.title,
      artistId: artist.id,
      value,
      grade,
      acquiredFor: 0,
      price: 0,
      status: 'lot',
      day,
      image: painting.image,
      tags: painting.tags,
      ...(painting.form && { form: painting.form }),
    };
    const low = round50(value * AUCTION.estimate[0]);
    const high = round50(value * AUCTION.estimate[1]);
    sale.lots.push({
      artworkId: id,
      low,
      high,
      reserve: round50(low * AUCTION.reserve),
      bid: 0,
      leader: null,
      roomMax: round50(value * rng.range(AUCTION.room[0], AUCTION.room[1])),
      state: 'open',
    });
  }
  return sale;
}

/** The next amount the auctioneer will take from you. */
export function askingBid(lot: AuctionLot): number {
  return lot.bid === 0 ? round50(lot.low * AUCTION.opening) : lot.bid + bidIncrement(lot.bid);
}

/** What winning at `hammer` actually costs, premium included. */
export const withPremium = (hammer: number) => Math.round(hammer * (1 + AUCTION.buyersPremium));

export const saleIsLive = (state: GameState) => !!state.auction && state.auction.day === state.day;

const BIDDERS = ['a phone bidder', 'the room', 'someone online', 'a dealer in the front row', 'paddle 88', 'a bidder at the back'];

/** You raise your paddle on a lot. The room answers, or it's yours. */
export function placeBid(state: GameState, lotIndex: number): string | void {
  const sale = state.auction;
  if (!sale) return 'There’s no sale on.';
  if (sale.day > state.day) return 'Bidding hasn’t opened yet. The lots are on view until sale day.';
  const lot = sale.lots[lotIndex];
  if (!lot || lot.state !== 'open') return 'That lot has closed.';
  const ask = askingBid(lot);
  if (state.cash - withPremium(ask) < RULES.overdraftLimit) return 'You can’t cover that bid and the buyer’s premium.';
  const work = state.artworks[lot.artworkId];

  lot.bid = ask;
  lot.leader = 'you';
  const counter = ask + bidIncrement(ask);
  // The room goes on while someone's ceiling allows; the auctioneer bids up to the reserve for the consignor.
  if (counter <= lot.roomMax || ask < lot.reserve) {
    const rng = new Rng((lot.roomMax ^ Math.imul(ask, 2654435761)) >>> 0 || 1);
    const who = counter <= lot.roomMax ? rng.pick(BIDDERS) : 'the auctioneer, on the book,';
    lot.bid = counter;
    lot.leader = 'room';
    lot.call = `${$(ask)} from you… ${who} comes back at ${$(counter)}.`;
    return;
  }

  // Nobody else. Going once, going twice…
  lot.state = 'won';
  lot.hammer = ask;
  lot.call = `${$(ask)}… going once, going twice… sold, to you.`;
  const cost = withPremium(ask);
  post(state, 'art', -cost, `Won "${work.title}" at ${sale.house}`);
  work.acquiredFor = cost;
  work.price = round50(work.value * state.settings.defaultMarkup);
  work.status = 'storage';
  work.day = state.day;
  work.source = 'auction';
  adjustRelationship(state, work.artistId, 2);
  notify(state, { kind: 'market', text: `Won “${work.title}” for ${$(ask)} (${$(cost)} with premium).`, amount: -cost });
}

/** You drop out of a lot: it goes to the room if they're on, or it's bought in. */
export function passLot(state: GameState, lotIndex: number): string | void {
  const sale = state.auction;
  if (!sale || sale.day > state.day) return 'Bidding hasn’t opened yet.';
  const lot = sale.lots[lotIndex];
  if (!lot || lot.state !== 'open') return 'That lot has closed.';
  settleWithoutYou(lot);
}

function settleWithoutYou(lot: AuctionLot): void {
  // A room lead above anyone's real ceiling is just the auctioneer on the book: bought in.
  if (lot.bid > 0 && lot.bid <= lot.roomMax) {
    lot.state = 'lost';
    lot.hammer = lot.bid;
  } else if (lot.bid === 0 && lot.roomMax >= lot.reserve) {
    lot.state = 'lost';
    lot.hammer = Math.max(lot.reserve, round50(lot.roomMax * 0.92));
  } else {
    lot.state = 'passed';
  }
  lot.call = lot.state === 'lost' ? `Sold to ${lot.bid > 0 ? 'the room' : 'a phone bidder'} for ${$(lot.hammer!)}.` : 'No sale: bought in below the reserve.';
}

/**
 * At midnight. On the morning a sale opens, says so; when a sale day ends,
 * settles every open lot and catalogues next week's sale.
 */
export function auctionEndOfDay(state: GameState): void {
  const sale = state.auction;
  if (!sale) return;
  if (sale.day === state.day) {
    for (const lot of sale.lots) if (lot.state === 'open') settleWithoutYou(lot);
    // Lots that left with someone else go back into the world; they may turn up again.
    for (const lot of sale.lots) if (lot.state !== 'won') delete state.artworks[lot.artworkId];
    const won = sale.lots.filter((l) => l.state === 'won').length;
    notify(state, {
      kind: 'market',
      text: `${sale.house}’s sale closed. ${won ? `You won ${won} lot${won > 1 ? 's' : ''}.` : 'You didn’t win anything this time.'}`,
    });
    state.auction = createSale(state, nextSaleDay(sale.day + 1));
  } else if (sale.day === state.day + 1) {
    notify(state, { kind: 'market', text: `${sale.house} sells ${sale.lots.length} lots tomorrow. Bidding runs all day.` });
  }
}

// ---- Hosting -----------------------------------------------------------------

export interface HostedAuctionResult {
  lots: number;
  sold: number;
  total: number;
  commission: number;
}

/** Lots collectors will consign to you, by reputation. */
export const hostedLots = (state: GameState) => Math.min(HOSTED_AUCTION.maxLots, HOSTED_AUCTION.baseLots + Math.floor(state.reputation / HOSTED_AUCTION.repPerLot));

/** Runs the sale at your own auction night. A full, happy room bids higher. */
export function hostAuction(state: GameState, attendance: number, satisfaction: number, rng: Rng): HostedAuctionResult {
  const artists = Object.values(state.artists);
  const lots = hostedLots(state);
  const room = (0.75 + 0.5 * satisfaction) * clamp(0.7 + attendance / 150, 0.7, 1.3);
  let sold = 0;
  let total = 0;
  let best: { title: string; hammer: number } | null = null;
  for (let i = 0; i < lots; i++) {
    const artist = pickConsigned(artists, rng);
    const value = workValue(artist, { grade: rollGrade(artist, rng) });
    const share = rng.range(HOSTED_AUCTION.hammer[0], HOSTED_AUCTION.hammer[1]) * room;
    if (share < HOSTED_AUCTION.reserve) continue;
    const hammer = round50(value * share);
    sold++;
    total += hammer;
    // A strong price is good for the artist's market.
    if (share >= 1) addFame(state, artist.id, 0.3);
    if (!best || hammer > best.hammer) best = { title: `a ${artist.name.split(' ').pop()}`, hammer };
  }
  const commission = Math.round(total * HOSTED_AUCTION.commission);
  if (commission > 0) post(state, 'auctions', commission, `Auction night commission (${sold} of ${lots} lots sold)`);
  notify(state, {
    kind: 'sale',
    text: sold
      ? `Auction night: ${sold} of ${lots} lots sold for ${$(total)}. Your commission: ${$(commission)}.${best ? ` Top lot, ${best.title}, made ${$(best.hammer)}.` : ''}`
      : `Auction night: the room sat on its hands. None of the ${lots} lots met its reserve.`,
    amount: commission || undefined,
  });
  return { lots, sold, total, commission };
}

/** Consignors need time: no two auction nights within a week of each other. */
export function hostedAuctionTooSoon(state: GameState, day: number): boolean {
  const days = [...state.events.filter((e) => e.kind === 'auction').map((e) => e.day), ...(state.hostedAuctionDay ? [state.hostedAuctionDay] : [])];
  return days.some((d) => Math.abs(d - day) < HOSTED_AUCTION.minDaysBetween);
}
