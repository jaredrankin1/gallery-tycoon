import { describe, expect, it } from 'vitest';
import { absHour, AUTO_HANG, assistantPose, createNewGame, dispatch, FIXTURE, shownOnFixture, TIME, type Action, type Artwork, type GameState } from '../src/game';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const game = (autoHang = true) => createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 7, autoHang });

/** A work turns up in storage (as a sponsored artist's delivery does). */
function arrive(s: GameState, id: string, value: number, form?: Artwork['form'], hours = 6): GameState {
  const next = structuredClone(s);
  const artistId = Object.keys(next.artists)[0];
  next.artworks[id] = { id, title: id, artistId, value, acquiredFor: 0, price: value, status: 'storage', day: next.day, ...(form ? { form } : {}) };
  return run(next, { type: 'tick', hours });
}

/** An offer to buy, at a set value and price. */
function offer(s: GameState, id: string, value: number, form?: Artwork['form']): GameState {
  const next = structuredClone(s);
  const artistId = Object.keys(next.artists)[0];
  next.artworks[id] = { id, title: id, artistId, value, acquiredFor: 0, price: value, status: 'offered', day: next.day + 3, ...(form ? { form } : {}) };
  return next;
}

const walls = (s: GameState) => s.floor.fixtures.filter((f) => f.kind === 'wallHang');
const fixtureOf = (s: GameState, id: string) => s.floor.fixtures.find((f) => f.artworkId === id);

describe('auto-hang', () => {
  it('is off unless asked for, and then a purchase waits in storage', () => {
    let s = game(false);
    s = offer(s, 'w-a', 1000);
    s = run(s, { type: 'buyArtwork', artworkId: 'w-a' });
    expect(s.artworks['w-a'].status).toBe('storage');
    expect(s.staff!.jobs).toHaveLength(0);
  });

  it('hangs a purchase in a free wall spot and books Marisol to carry it over', () => {
    let s = offer(game(), 'w-a', 1000);
    s = run(s, { type: 'buyArtwork', artworkId: 'w-a' });
    const f = fixtureOf(s, 'w-a')!;
    expect(s.artworks['w-a'].status).toBe('display');
    expect(f.kind).toBe('wallHang');
    const [job] = s.staff!.jobs;
    expect(job.fixtureId).toBe(f.id);
    expect(job.start).toBe(absHour(s) + 1);

    // On screen: the spot looks empty until she hangs it, and she carries it over first.
    expect(shownOnFixture(s, f, job.start)).toBeNull();
    expect(shownOnFixture(s, f, job.hangAt)).toBe('w-a');
    const carrying = assistantPose(s, (job.carryAt + job.arriveAt) / 2);
    expect(carrying.anim).toBe('walk');
    expect(carrying.carrying).toBe('w-a');
    expect(assistantPose(s, (job.pickupAt + job.carryAt) / 2).anim).toBe('clipboard');
    expect(assistantPose(s, (job.arriveAt + job.hangAt) / 2)).toMatchObject({ x: job.at.x, y: job.at.y });
  });

  it('picks up deliveries that arrive on their own', () => {
    const s = arrive(game(), 'w-d', 2000);
    expect(s.artworks['w-d'].status).toBe('display');
    expect(s.staff!.jobs[0].start).toBe(absHour(s));
  });

  it('builds a new wall spot when the walls are full and there is money for it', () => {
    let s = game();
    const n = walls(s).length;
    for (let i = 0; i < n; i++) s = arrive(s, `w-${i}`, 1000 + i);
    expect(walls(s).every((f) => f.artworkId)).toBe(true);
    const cash = s.cash;
    s = arrive(s, 'w-new', 500);
    expect(walls(s)).toHaveLength(n + 1);
    expect(s.cash).toBe(cash - FIXTURE.wallHang.cost);
    expect(fixtureOf(s, 'w-new')!.kind).toBe('wallHang');
    const job = s.staff!.jobs.at(-1)!;
    expect(job.built).toBe(true);
    expect(shownOnFixture(s, fixtureOf(s, 'w-new')!, job.start)).toBe('hidden');
  });

  it('swaps out the weakest piece when it cannot build, and leaves a weaker newcomer in storage', () => {
    let s = game();
    s.cash = AUTO_HANG.cashReserve; // nothing to spare on fixtures
    const n = walls(s).length;
    for (let i = 0; i < n; i++) s = arrive(s, `w-${i}`, 1000 * (i + 1));
    s = arrive(s, 'w-big', 50_000);
    expect(s.artworks['w-big'].status).toBe('display');
    expect(s.artworks['w-0'].status).toBe('storage');
    const job = s.staff!.jobs.at(-1)!;
    expect(job.evictedId).toBe('w-0');
    // Until she gets there, the old piece is still up.
    expect(shownOnFixture(s, fixtureOf(s, 'w-big')!, job.start)).toBe('w-0');

    s = arrive(s, 'w-small', 10);
    expect(s.artworks['w-small'].status).toBe('storage');
    expect(s.feed.at(-1)!.text).toContain('no room');
  });

  it('puts sculpture on a pedestal, building one if needed, and never swaps it for a painting', () => {
    let s = game();
    s = arrive(s, 's-1', 3000, 'sculpture'); // the starter pedestal
    expect(fixtureOf(s, 's-1')!.kind).toBe('pedestal');
    s = arrive(s, 's-2', 3000, 'sculpture');
    const f = fixtureOf(s, 's-2')!;
    expect(f.kind).toBe('pedestal');
    expect(f.x).toBeGreaterThanOrEqual(2);
    expect(f.y).toBeGreaterThanOrEqual(2);

    s.cash = AUTO_HANG.cashReserve;
    for (const w of walls(s)) if (!w.artworkId) s = arrive(s, `fill-${w.id}`, 99_000);
    s = arrive(s, 'p-huge', 1_000_000);
    expect(s.artworks['s-1'].status).toBe('display');
    expect(s.artworks['s-2'].status).toBe('display');
    expect(fixtureOf(s, 'p-huge')!.kind).toBe('wallHang');
  });

  it('leaves alone a piece the player takes down', () => {
    let s = arrive(game(), 'w-a', 1000);
    s = run(s, { type: 'setDisplay', artworkId: 'w-a', display: false });
    s = run(s, { type: 'tick', hours: 3 });
    expect(s.artworks['w-a'].status).toBe('storage');
  });

  it('queues several pieces one after another and clears finished jobs', () => {
    let s = game();
    s = offer(offer(s, 'w-a', 1000), 'w-b', 1200);
    s = run(s, { type: 'buyArtwork', artworkId: 'w-a' });
    s = run(s, { type: 'buyArtwork', artworkId: 'w-b' });
    const [a, b] = s.staff!.jobs;
    expect(b.start).toBe(a.end);
    expect(b.from).toEqual(a.at);
    s = run(s, { type: 'tick', hours: TIME.ticksPerDay });
    expect(s.staff!.jobs).toHaveLength(0);
  });

  it('can be switched on for a running game, and only handles what comes in afterwards', () => {
    let s = arrive(game(false), 'w-old', 1000);
    expect(s.artworks['w-old'].status).toBe('storage');
    s = run(s, { type: 'setAutoHang', on: true });
    s = arrive(s, 'w-new', 1000);
    expect(s.artworks['w-old'].status).toBe('storage');
    expect(s.artworks['w-new'].status).toBe('display');
  });
});
