import { describe, expect, it } from 'vitest';
import { AUCTION, COLLECTION, createNewGame, DIFFICULTY, dispatch, EVENT_KIND, TIME, type Action, type GameState } from '../src/game';
import { migrate } from '../src/game/save';
import { askingBid, withPremium } from '../src/game/systems/auctions';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const hours = (s: GameState, n: number) => run(s, { type: 'tick', hours: n });
const game = (opts: Partial<Parameters<typeof createNewGame>[0]> = {}) =>
  createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 5, ...opts });
/** Fast-forward to 10 AM on the sale day. */
const toSaleDay = (s: GameState) => {
  while (s.day < s.auction!.day) s = hours(s, TIME.ticksPerDay - s.tick);
  return s;
};
const owned = (s: GameState) => Object.values(s.artworks).filter((w) => w.status === 'storage' || w.status === 'display');

describe('starting collections', () => {
  it('no collection by default: full cash, nothing owned', () => {
    const s = game();
    expect(owned(s)).toHaveLength(0);
    expect(s.cash).toBe(DIFFICULTY.normal.startingCash);
  });

  it('personal: a couple of pieces by different artists, hung where they fit, all your cash', () => {
    const s = game({ collection: 'personal' });
    expect(owned(s)).toHaveLength(COLLECTION.personal.works);
    expect(owned(s).every((w) => w.source === 'personal')).toBe(true);
    expect(owned(s).some((w) => w.status === 'display')).toBe(true);
    expect(new Set(owned(s).map((w) => w.artistId)).size).toBe(COLLECTION.personal.works);
    expect(s.cash).toBe(DIFFICULTY.normal.startingCash);
  });

  it('family: a bigger inventory with a big name, less cash, overflow in storage', () => {
    const s = game({ collection: 'family', venue: 'museum' });
    const works = owned(s);
    expect(works).toHaveLength(COLLECTION.family.works);
    expect(works.some((w) => w.status === 'storage')).toBe(true);
    const fames = works.map((w) => s.artists[w.artistId].fame);
    expect(Math.max(...fames)).toBeGreaterThanOrEqual(70);
    expect(s.cash).toBeLessThan(DIFFICULTY.normal.startingCash);
    const personal = owned(game({ collection: 'personal', venue: 'museum' }));
    const sum = (ws: typeof works) => ws.reduce((t, w) => t + w.value, 0);
    expect(sum(works)).toBeGreaterThan(sum(personal) * 3);
  });

  it('does not change the rest of the run (market and RNG)', () => {
    const a = game();
    const b = game({ collection: 'family' });
    expect(b.rng).toBe(a.rng);
    const offers = (s: GameState) => Object.values(s.artworks).filter((w) => w.status === 'offered').map((w) => w.title);
    expect(offers(b)).toEqual(offers(a));
  });
});

describe('dealers', () => {
  it('ask more than the work is worth', () => {
    const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 9 });
    for (const w of Object.values(s.artworks).filter((w) => w.status === 'offered')) {
      if (s.artists[w.artistId].relationship <= 0) expect(w.price).toBeGreaterThanOrEqual(w.value * 1.2);
    }
  });
});

describe('auction house', () => {
  it('catalogues a weekly sale of lots on view before sale day', () => {
    const s = game();
    const sale = s.auction!;
    expect((sale.day - 1) % 7).toBe(AUCTION.weekday);
    expect(sale.day).toBeGreaterThan(s.day);
    expect(sale.lots.length).toBe(AUCTION.lots);
    for (const lot of sale.lots) {
      expect(s.artworks[lot.artworkId].status).toBe('lot');
      expect(lot.low).toBeLessThan(lot.high);
    }
    // Not before sale day.
    expect(dispatch(s, { type: 'auctionBid', lot: 0 }).ok).toBe(false);
  });

  it('bidding: the room answers until its ceiling, then the lot is yours with premium', () => {
    let s = toSaleDay(game());
    const i = 0;
    let rounds = 0;
    while (s.auction!.lots[i].state === 'open' && rounds++ < 200) {
      const lot = s.auction!.lots[i];
      const cash = s.cash;
      const ask = askingBid(lot);
      s = run(s, { type: 'auctionBid', lot: i });
      const after = s.auction!.lots[i];
      if (after.state === 'won') {
        expect(after.hammer).toBe(ask);
        expect(after.hammer).toBeGreaterThanOrEqual(after.reserve);
        expect(cash - s.cash).toBe(withPremium(ask));
        const w = s.artworks[after.artworkId];
        expect(['storage', 'display']).toContain(w.status);
        expect(w.source).toBe('auction');
      } else {
        expect(after.leader).toBe('room');
        expect(after.bid).toBeGreaterThan(ask);
      }
    }
    expect(s.auction!.lots[i].state).toBe('won');
  });

  it('letting a lot go, and closing the sale at midnight, settles everything and catalogues next week', () => {
    let s = toSaleDay(game());
    const sale = s.auction!;
    s = run(s, { type: 'auctionBid', lot: 1 });
    if (s.auction!.lots[1].state === 'open') {
      s = run(s, { type: 'auctionPass', lot: 1 });
      expect(['lost', 'passed']).toContain(s.auction!.lots[1].state);
    }
    s = hours(s, TIME.ticksPerDay - s.tick);
    expect(s.auction!.day).toBe(sale.day + 7);
    for (const lot of sale.lots) expect(s.artworks[lot.artworkId]?.status).not.toBe('lot');
    expect(Object.values(s.artworks).filter((w) => w.status === 'lot')).toHaveLength(s.auction!.lots.length);
  });

  it('is cheaper than a dealer on average', () => {
    let paid = 0;
    let worth = 0;
    for (let seed = 1; seed <= 12; seed++) {
      let s = toSaleDay(createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed }));
      for (let i = 0; i < s.auction!.lots.length; i++) {
        for (let n = 0; n < 300 && s.auction!.lots[i].state === 'open'; n++) {
          const r = dispatch(s, { type: 'auctionBid', lot: i });
          if (!r.ok) break;
          s = r.state;
        }
        const lot = s.auction!.lots[i];
        if (lot.state === 'won') {
          paid += withPremium(lot.hammer!);
          worth += s.artworks[lot.artworkId].value;
        }
      }
    }
    expect(worth).toBeGreaterThan(0);
    expect(paid / worth).toBeLessThan(1.25);
  });

  it('older saves get a sale catalogued', () => {
    const s = game() as any;
    delete s.auction;
    const m = migrate(JSON.parse(JSON.stringify(s)))!;
    expect(m.auction!.lots.length).toBeGreaterThan(0);
  });
});

describe('hosting an auction night', () => {
  const book = (s: GameState, day: number) =>
    dispatch(s, { type: 'scheduleEvent', kind: 'auction', day, featuredArtistIds: [], hospitality: { wine: 2, cheese: 2, guests: 60 } });

  for (const venue of ['gallery', 'museum'] as const) {
    it(`earns a commission in a ${venue}`, () => {
      let s = game({ venue, difficulty: 'easy' });
      s = run(s, { type: 'scheduleEvent', kind: 'auction', day: s.day + EVENT_KIND.auction.minDaysAhead, featuredArtistIds: [], hospitality: { wine: 2, cheese: 2, guests: 60 } });
      const day = s.events[0].day;
      while (s.day < day || s.tick <= TIME.eventTick) s = hours(s, 1);
      const commission = s.ledger.filter((e) => e.category === 'auctions').reduce((t, e) => t + e.amount, 0);
      expect(commission).toBeGreaterThan(0);
      expect(s.hostedAuctionDay).toBe(day);
    });
  }

  it('needs a week between auction nights', () => {
    let s = game();
    const day = s.day + EVENT_KIND.auction.minDaysAhead;
    s = book(s, day).state;
    expect(book(s, day + 3).ok).toBe(false);
    expect(book(s, day + 7).ok).toBe(true);
  });
});
