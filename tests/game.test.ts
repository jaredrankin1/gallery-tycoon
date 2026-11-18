import { describe, expect, it } from 'vitest';
import { createNewGame, dispatch, DIFFICULTY, type GameState, type Action } from '../src/game';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const offers = (s: GameState) => Object.values(s.artworks).filter((w) => w.status === 'offered');

describe('new game', () => {
  it('starting cash follows difficulty', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      expect(createNewGame({ name: 'x', difficulty: d, venue: 'gallery', seed: 1 }).cash).toBe(DIFFICULTY[d].startingCash);
    }
  });
  it('starts with a market, a floor and artists', () => {
    const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'museum', seed: 1 });
    expect(offers(s).length).toBeGreaterThan(0);
    expect(s.floor.fixtures.some((f) => f.kind === 'wallHang')).toBe(true);
    expect(Object.keys(s.artists).length).toBeGreaterThan(0);
  });
});

describe('loop', () => {
  it('is deterministic for a seed', () => {
    const play = () => {
      let s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 42 });
      for (let i = 0; i < 5; i++) s = run(s, { type: 'advanceWeek' });
      return s;
    };
    expect(play()).toEqual(play());
  });

  it('buying and hanging art, then weeks pass', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 7 });
    const w = offers(s)[0];
    const cash = s.cash;
    s = run(s, { type: 'buyArtwork', artworkId: w.id });
    expect(s.cash).toBe(cash - w.price);
    expect(s.artists[w.artistId].relationship).toBeGreaterThan(0);
    s = run(s, { type: 'setDisplay', artworkId: w.id, display: true });
    expect(s.artworks[w.id].status).toBe('display');
    expect(s.floor.fixtures.some((f) => f.artworkId === w.id)).toBe(true);
    for (let i = 0; i < 10; i++) s = run(s, { type: 'advanceWeek' });
    expect(s.week).toBe(11);
  });

  it('museum earns ticket money from displayed art', () => {
    let s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'museum', seed: 3 });
    const w = offers(s)[0];
    s = run(s, { type: 'buyArtwork', artworkId: w.id });
    s = run(s, { type: 'setDisplay', artworkId: w.id, display: true });
    s = run(s, { type: 'advanceWeek' });
    expect(s.reports[0].income).toBeGreaterThan(0);
    expect(s.ledger.some((e) => e.category === 'tickets')).toBe(true);
  });

  it('museums cannot set sale prices', () => {
    const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'museum', seed: 3 });
    expect(dispatch(s, { type: 'setPrice', artworkId: 'nope', price: 10 }).ok).toBe(false);
  });
});

describe('events and hospitality', () => {
  it('books, charges wine & cheese, resolves and moves the relationship', () => {
    let s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 9 });
    const cash = s.cash;
    s = run(s, {
      type: 'scheduleEvent',
      kind: 'talk',
      week: 2,
      featuredArtistIds: ['a-hollis'],
      hospitality: { wine: 2, cheese: 2, guests: 40 },
    });
    expect(s.cash).toBe(cash - 400 - 40 * 18);
    s = run(s, { type: 'advanceWeek' });
    s = run(s, { type: 'advanceWeek' });
    expect(s.reports[1].events).toHaveLength(1);
    expect(s.artists['a-hollis'].relationship).toBeGreaterThan(0);
  });

  it('rejects events with the wrong number of artists', () => {
    const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 9 });
    const r = dispatch(s, { type: 'scheduleEvent', kind: 'opening', week: 2, featuredArtistIds: [], hospitality: { wine: 1, cheese: 1, guests: 10 } });
    expect(r.ok).toBe(false);
  });
});

describe('floor', () => {
  it('only allows wall spots on back walls', () => {
    const s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 1 });
    expect(dispatch(s, { type: 'placeFixture', kind: 'wallHang', x: 3, y: 3 }).ok).toBe(false);
    expect(dispatch(s, { type: 'placeFixture', kind: 'pedestal', x: 3, y: 3 }).ok).toBe(true);
  });
});

it('goes bankrupt when cash runs out', () => {
  let s = createNewGame({ name: 'x', difficulty: 'hard', venue: 'gallery', seed: 1 });
  for (let i = 0; i < 40 && s.status === 'playing'; i++) s = run(s, { type: 'advanceWeek' });
  expect(s.status).toBe('bankrupt');
});
