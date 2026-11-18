import { describe, expect, it } from 'vitest';
import { createNewGame, dispatch, DIFFICULTY, TIME, type Action, type GameState } from '../src/game';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const days = (s: GameState, n: number) => run(s, { type: 'tick', hours: n * TIME.ticksPerDay });
const offers = (s: GameState) => Object.values(s.artworks).filter((w) => w.status === 'offered');

describe('new game', () => {
  it('starting cash follows difficulty', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      expect(createNewGame({ name: 'x', difficulty: d, venue: 'gallery', seed: 1 }).cash).toBe(DIFFICULTY[d].startingCash);
    }
  });
  it('starts with a full market, a floor and artists', () => {
    const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'museum', seed: 1 });
    expect(offers(s).length).toBe(5);
    expect(s.floor.fixtures.some((f) => f.kind === 'wallHang')).toBe(true);
    expect(Object.keys(s.artists).length).toBeGreaterThan(0);
  });
});

describe('clock', () => {
  it('advances hours, then days', () => {
    let s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 1 });
    s = run(s, { type: 'tick', hours: 3 });
    expect([s.day, s.tick]).toEqual([1, 3]);
    s = days(s, 1);
    expect([s.day, s.tick]).toEqual([2, 3]);
    expect(s.history).toHaveLength(1);
  });

  it('is deterministic for a seed', () => {
    const play = () => days(createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 42 }), 10);
    expect(play()).toEqual(play());
  });

  it('pays weekly bills on Sunday night', () => {
    let s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 5 });
    s = days(s, 6);
    expect(s.ledger.some((e) => e.category === 'rent')).toBe(false);
    s = days(s, 1);
    expect(s.ledger.filter((e) => e.category === 'rent')).toHaveLength(1);
    expect(s.feed.some((f) => f.kind === 'bills')).toBe(true);
  });

  it('goes bankrupt when cash runs out', () => {
    let s = createNewGame({ name: 'x', difficulty: 'hard', venue: 'gallery', seed: 1 });
    for (let i = 0; i < 300 && s.status === 'playing'; i++) s = days(s, 1);
    expect(s.status).toBe('bankrupt');
  });
});

describe('venues', () => {
  it('buying and hanging art', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 7 });
    const w = offers(s)[0];
    const cash = s.cash;
    s = run(s, { type: 'buyArtwork', artworkId: w.id });
    expect(s.cash).toBe(cash - w.price);
    expect(s.artists[w.artistId].relationship).toBeGreaterThan(0);
    s = run(s, { type: 'setDisplay', artworkId: w.id, display: true });
    expect(s.artworks[w.id].status).toBe('display');
    expect(s.floor.fixtures.some((f) => f.artworkId === w.id)).toBe(true);
  });

  it('gallery eventually sells displayed work and reports it', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 11 });
    for (const w of offers(s).slice(0, 4)) {
      s = run(s, { type: 'buyArtwork', artworkId: w.id });
      s = run(s, { type: 'setPrice', artworkId: w.id, price: Math.round(s.artworks[w.id].value * 0.9) });
      s = run(s, { type: 'setDisplay', artworkId: w.id, display: true });
    }
    s = days(s, 30);
    expect(Object.values(s.artworks).some((w) => w.status === 'sold')).toBe(true);
    expect(s.ledger.some((e) => e.category === 'sales')).toBe(true);
  });

  it('museum earns ticket money hour by hour from displayed art', () => {
    let s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'museum', seed: 3 });
    for (const w of offers(s).slice(0, 2)) {
      s = run(s, { type: 'buyArtwork', artworkId: w.id });
      s = run(s, { type: 'setDisplay', artworkId: w.id, display: true });
    }
    const before = s.cash;
    s = run(s, { type: 'tick', hours: 6 });
    expect(s.cash).toBeGreaterThan(before);
    // Ticket income merges into one ledger line per day.
    expect(s.ledger.filter((e) => e.category === 'tickets')).toHaveLength(1);
  });

  it('museums cannot set sale prices', () => {
    const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'museum', seed: 3 });
    expect(dispatch(s, { type: 'setPrice', artworkId: 'nope', price: 10 }).ok).toBe(false);
  });
});

describe('events and hospitality', () => {
  it('books, charges wine & cheese, resolves at 7 PM and moves the relationship', () => {
    let s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 9 });
    const cash = s.cash;
    s = run(s, {
      type: 'scheduleEvent',
      kind: 'talk',
      day: 2,
      featuredArtistIds: ['a-hollis'],
      hospitality: { wine: 2, cheese: 2, guests: 40 },
    });
    expect(s.cash).toBe(cash - 400 - 40 * 18);
    s = run(s, { type: 'tick', hours: TIME.ticksPerDay + TIME.eventTick });
    expect(s.events).toHaveLength(1);
    s = run(s, { type: 'tick', hours: 1 });
    expect(s.events).toHaveLength(0);
    expect(s.feed.some((f) => f.kind === 'event')).toBe(true);
    expect(s.artists['a-hollis'].relationship).toBeGreaterThan(0);
  });

  it('rejects events with the wrong number of artists or too soon', () => {
    const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 9 });
    const plan = { wine: 1, cheese: 1, guests: 10 } as const;
    expect(dispatch(s, { type: 'scheduleEvent', kind: 'opening', day: 3, featuredArtistIds: [], hospitality: plan }).ok).toBe(false);
    expect(dispatch(s, { type: 'scheduleEvent', kind: 'gala', day: 2, featuredArtistIds: ['a-mara', 'a-junie'], hospitality: plan }).ok).toBe(false);
  });
});

describe('floor', () => {
  it('only allows wall spots on back walls', () => {
    const s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 1 });
    expect(dispatch(s, { type: 'placeFixture', kind: 'wallHang', x: 3, y: 3 }).ok).toBe(false);
    expect(dispatch(s, { type: 'placeFixture', kind: 'pedestal', x: 3, y: 3 }).ok).toBe(true);
  });
});
