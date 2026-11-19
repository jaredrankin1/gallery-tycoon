import { describe, expect, it } from 'vitest';
import { buyChance, createNewGame, dispatch, MERCH, MERCH_KINDS, merchAppeal, SHOP, TIME, type Action, type GameState, type VenueType } from '../src/game';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const days = (s: GameState, n: number) => run(s, { type: 'tick', hours: n * TIME.ticksPerDay });
const offers = (s: GameState) => Object.values(s.artworks).filter((w) => w.status === 'offered');

/** A venue with a few works hanging and a gift shop counter in the middle of the floor. */
function withShop(venue: VenueType, seed = 3): GameState {
  let s = createNewGame({ name: 'x', difficulty: 'easy', venue, seed });
  for (const w of offers(s).slice(0, 3)) {
    s = run(s, { type: 'buyArtwork', artworkId: w.id });
    s = run(s, { type: 'setDisplay', artworkId: w.id, display: true });
  }
  return run(s, { type: 'placeFixture', kind: 'shop', x: 3, y: 4 });
}

const shopIncome = (s: GameState) => s.ledger.filter((e) => e.category === 'shop' && e.amount > 0).reduce((n, e) => n + e.amount, 0);

describe('gift shop', () => {
  it('sells nothing until a counter is built', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'museum', seed: 3 });
    for (const w of offers(s).slice(0, 3)) {
      s = run(s, { type: 'buyArtwork', artworkId: w.id });
      s = run(s, { type: 'setDisplay', artworkId: w.id, display: true });
    }
    s = days(s, 3);
    expect(shopIncome(s)).toBe(0);
  });

  it('a new counter opens with a batch of everything, and only one fits', () => {
    const s = withShop('museum');
    for (const k of MERCH_KINDS) expect(s.shop.lines[k].stock).toBe(MERCH[k].batch);
    const again = dispatch(s, { type: 'placeFixture', kind: 'shop', x: 5, y: 5 });
    expect(again.ok).toBe(false);
  });

  for (const venue of ['museum', 'gallery'] as const) {
    it(`earns money in a ${venue}, and stock goes down by what sold`, () => {
      let s = withShop(venue);
      s = run(s, { type: 'setAutoRestock', on: false });
      const before = structuredClone(s.shop.lines);
      s = days(s, 2);
      const income = shopIncome(s);
      expect(income).toBeGreaterThan(0);
      let fromStock = 0;
      for (const k of MERCH_KINDS) {
        const sold = before[k].stock - s.shop.lines[k].stock;
        expect(sold).toBe(s.shop.lines[k].soldTotal);
        fromStock += sold * s.shop.lines[k].price;
      }
      expect(fromStock).toBe(income);
    });
  }

  it('stops selling a line when it runs out, without reordering', () => {
    let s = withShop('museum');
    s = run(s, { type: 'setAutoRestock', on: false });
    s = days(s, 30);
    expect(s.shop.lines.postcard.stock).toBe(0);
    expect(s.shop.lines.postcard.soldTotal).toBe(MERCH.postcard.batch);
    expect(s.ledger.some((e) => e.category === 'shop' && e.amount < 0)).toBe(false);
  });

  it('auto-restock reorders what sells, and charges for it', () => {
    let s = withShop('museum');
    s = days(s, 14);
    const orders = s.ledger.filter((e) => e.category === 'shop' && e.amount < 0);
    expect(orders.length).toBeGreaterThan(0);
    expect(s.shop.lines.postcard.stock).toBeGreaterThan(0);
  });

  it('ordering stock costs the wholesale price and respects the shelf limit', () => {
    let s = withShop('gallery');
    const cash = s.cash;
    s = run(s, { type: 'restockMerch', kind: 'tshirt', batches: 2 });
    expect(s.shop.lines.tshirt.stock).toBe(MERCH.tshirt.batch * 3);
    expect(s.cash).toBe(cash - MERCH.tshirt.batch * 2 * MERCH.tshirt.unitCost);
    s = run(s, { type: 'restockMerch', kind: 'tshirt', batches: 100 });
    expect(s.shop.lines.tshirt.stock).toBe(SHOP.maxStock);
    expect(dispatch(s, { type: 'restockMerch', kind: 'tshirt', batches: 1 }).ok).toBe(false);
  });

  it('higher prices mean fewer buyers', () => {
    let s = withShop('museum');
    const fair = buyChance(s, 'keychain');
    s = run(s, { type: 'setMerchPrice', kind: 'keychain', price: MERCH.keychain.fairPrice * 2 });
    expect(buyChance(s, 'keychain')).toBeLessThan(fair / 3);
    s = run(s, { type: 'setMerchPrice', kind: 'keychain', price: 4 });
    expect(buyChance(s, 'keychain')).toBeGreaterThan(fair);
    expect(dispatch(s, { type: 'setMerchPrice', kind: 'keychain', price: 0 }).ok).toBe(false);
    expect(dispatch(s, { type: 'setMerchPrice', kind: 'keychain', price: 1000 }).ok).toBe(false);
  });

  it('prints need art on the walls, and famous art sells more', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'museum', seed: 3 });
    s = run(s, { type: 'placeFixture', kind: 'shop', x: 3, y: 4 });
    expect(merchAppeal(s, 'print')).toBe(0);
    expect(buyChance(s, 'print')).toBe(0);
    const w = offers(s)[0];
    s = run(s, { type: 'buyArtwork', artworkId: w.id });
    s = run(s, { type: 'setDisplay', artworkId: w.id, display: true });
    const low = merchAppeal(s, 'print');
    expect(low).toBeGreaterThan(0);
    s.artists[w.artistId].fame = 95;
    expect(merchAppeal(s, 'print')).toBeGreaterThan(low);
  });

  it('event crowds shop too', () => {
    let s = withShop('gallery');
    s = run(s, { type: 'setAutoRestock', on: false });
    const artist = Object.values(s.artists)[0];
    s = run(s, { type: 'scheduleEvent', kind: 'opening', day: s.day + 2, featuredArtistIds: [artist.id], hospitality: { wine: 2, cheese: 2, guests: 60 } });
    const noEvent = run(s, { type: 'cancelEvent', eventId: s.events[0].id });
    // Run both to just after 7 PM on the event night.
    const hours = (2 * TIME.ticksPerDay) + (TIME.eventTick + 1 - s.tick);
    const withIt = run(s, { type: 'tick', hours });
    const without = run(noEvent, { type: 'tick', hours });
    expect(shopIncome(withIt)).toBeGreaterThan(shopIncome(without));
  });

  it('stays deterministic for a seed', () => {
    const play = () => days(withShop('museum', 9), 5);
    expect(play()).toEqual(play());
  });
});
