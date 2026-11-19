import { describe, expect, it } from 'vitest';
import { absHour, assistantPose, buildReserve, createNewGame, dispatch, FIXTURE, shownOnFixture, TIME, type Action, type Artwork, type GameState } from '../src/game';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const game = (autoHang = true, venue: 'gallery' | 'museum' = 'gallery') => createNewGame({ name: 'x', difficulty: 'normal', venue, seed: 7, autoHang });

/** A work turns up in storage (as a sponsored artist's delivery does). */
const arriveAt = (...a: Parameters<typeof arrive>) => arrive(...a);
function arrive(s: GameState, id: string, value: number, form?: Artwork['form'], hours = 6): GameState {
  const next = structuredClone(s);
  const artistId = Object.keys(next.artists)[0];
  next.artworks[id] = { id, title: id, artistId, value, grade: value / 1000, acquiredFor: 0, price: value, status: 'storage', day: next.day, ...(form ? { form } : {}) } as Artwork;
  return run(next, { type: 'tick', hours });
}

/** An offer to buy, at a set value and price. */
function offer(s: GameState, id: string, value: number, form?: Artwork['form']): GameState {
  const next = structuredClone(s);
  const artistId = Object.keys(next.artists)[0];
  next.artworks[id] = { id, title: id, artistId, value, grade: value / 1000, acquiredFor: 0, price: value, status: 'offered', day: next.day + 3, ...(form ? { form } : {}) } as Artwork;
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
    const s = arrive(game(), 'w-d', 2000, undefined, 1);
    expect(s.artworks['w-d'].status).toBe('display');
    expect(s.staff!.jobs[0].start).toBe(absHour(s));
  });

  it('builds a new wall spot when the walls are full and there is money for it', () => {
    // A museum, so visitors don't buy the test pieces off the walls.
    let s = game(true, 'museum');
    const n = walls(s).length;
    for (let i = 0; i < n; i++) s = arrive(s, `w-${i}`, 1000 + i);
    expect(walls(s).every((f) => f.artworkId)).toBe(true);
    s = arrive(s, 'w-new', 500);
    expect(walls(s)).toHaveLength(n + 1);
    expect(s.ledger.filter((e) => e.category === 'fit-out').map((e) => e.amount)).toEqual([-FIXTURE.wallHang.cost]);
    expect(fixtureOf(s, 'w-new')!.kind).toBe('wallHang');
    const job = s.staff!.jobs.at(-1)!;
    expect(job.built).toBe(true);
    expect(shownOnFixture(s, fixtureOf(s, 'w-new')!, job.start)).toBe('hidden');
  });

  it('swaps out the weakest piece when it cannot build, and leaves a weaker newcomer in storage', () => {
    // A museum, so nothing on the walls sells while the test runs.
    let s = game(true, 'museum');
    // Nothing to spare on fixtures, however the takings go.
    const arrive = (st: GameState, id: string, value: number) => arriveAt(Object.assign(structuredClone(st), { cash: buildReserve(st) }), id, value, undefined, 1);
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
    let s = game(true, 'museum');
    s = arrive(s, 's-1', 3000, 'sculpture'); // the starter pedestal
    expect(fixtureOf(s, 's-1')!.kind).toBe('pedestal');
    s = arrive(s, 's-2', 3000, 'sculpture');
    const f = fixtureOf(s, 's-2')!;
    expect(f.kind).toBe('pedestal');
    expect(f.x).toBeGreaterThanOrEqual(2);
    expect(f.y).toBeGreaterThanOrEqual(2);

    s.cash = buildReserve(s);
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

  it('can be switched on for a running game, and then clears what was already in storage', () => {
    let s = arrive(game(false), 'w-old', 1000);
    expect(s.artworks['w-old'].status).toBe('storage');
    s = run(s, { type: 'setAutoHang', on: true });
    s = run(s, { type: 'tick', hours: 1 });
    expect(s.artworks['w-old'].status).toBe('display');
  });

  it('builds spots for a storeroom backlog, one piece at a time, without dipping below the reserve', () => {
    let s = game(true, 'museum');
    const nWalls = walls(s).length;
    const nPeds = s.floor.fixtures.filter((f) => f.kind === 'pedestal').length;
    // Twelve paintings and three sculptures were sitting in storage before she was asked to help.
    s = run(s, { type: 'setAutoHang', on: false });
    const next = structuredClone(s);
    const artistId = Object.keys(next.artists)[0];
    const add = (id: string, form?: Artwork['form']) =>
      (next.artworks[id] = { id, title: id, artistId, value: 1000, grade: 1, acquiredFor: 0, price: 1000, status: 'storage', day: next.day, ...(form ? { form } : {}) } as Artwork);
    for (let i = 0; i < nWalls + 4; i++) add(`p-${i}`);
    for (let i = 0; i < nPeds + 3; i++) add(`s-${i}`, 'sculpture');
    next.staff!.seen.push(...Object.keys(next.artworks));
    const waiting = (st: GameState) => Object.values(st.artworks).filter((w) => w.status === 'storage').length;
    const before = waiting(next);
    s = run(next, { type: 'setAutoHang', on: true });

    // An hour in, she's only started on the pile.
    s = run(s, { type: 'tick', hours: 1 });
    expect(waiting(s)).toBeGreaterThan(before - 3);
    expect(waiting(s)).toBeLessThan(before);

    // A couple of days later everything is up, on spots she had built.
    s = run(s, { type: 'tick', hours: TIME.ticksPerDay * 2 });
    expect(waiting(s)).toBe(0);
    expect(walls(s).length).toBeGreaterThanOrEqual(nWalls + 4);
    expect(s.floor.fixtures.filter((f) => f.kind === 'pedestal').length).toBeGreaterThanOrEqual(nPeds + 3);
    expect(s.floor.fixtures.filter((f) => f.kind === 'pedestal' && f.artworkId).every((f) => s.artworks[f.artworkId!].form === 'sculpture')).toBe(true);
  });

  it('stops building when cash is down to the reserve, and carries on once it recovers', () => {
    let s = game(true, 'museum');
    const nWalls = walls(s).length;
    const next = structuredClone(s);
    const artistId = Object.keys(next.artists)[0];
    for (let i = 0; i < nWalls + 3; i++)
      next.artworks[`p-${i}`] = { id: `p-${i}`, title: `p-${i}`, artistId, value: 1000, grade: 1, acquiredFor: 0, price: 1000, status: 'storage', day: next.day } as Artwork;
    next.staff!.seen.push(...Object.keys(next.artworks));
    next.cash = buildReserve(next) + FIXTURE.wallHang.cost - 1;
    next.settings.ticketPrice = 0;
    // Hour by hour: any spot she builds leaves at least the reserve in the bank (a donation may let her build one).
    s = next;
    const said: string[] = [];
    for (let h = 0; h < TIME.ticksPerDay * 2; h++) {
      const had = walls(s).length;
      s = run(s, { type: 'tick', hours: 1 });
      if (walls(s).length > had) expect(s.cash).toBeGreaterThanOrEqual(buildReserve(s));
      said.push(...s.feed.map((f) => f.text));
    }
    expect(walls(s).length).toBeLessThan(nWalls + 3);
    expect(said.some((t) => t.includes('waiting in storage'))).toBe(true);

    s = structuredClone(s);
    s.cash += 50_000;
    s = run(s, { type: 'tick', hours: TIME.ticksPerDay * 2 });
    expect(walls(s).length).toBeGreaterThanOrEqual(nWalls + 3);
    expect(Object.values(s.artworks).filter((w) => w.id.startsWith('p-') && w.status === 'storage')).toHaveLength(0);
  });

  it('never puts back a piece the player took down', () => {
    let s = arrive(game(), 'w-a', 1000);
    s = run(s, { type: 'setDisplay', artworkId: 'w-a', display: false });
    s = run(s, { type: 'tick', hours: TIME.ticksPerDay * 2 });
    expect(s.artworks['w-a'].status).toBe('storage');
    // Hanging it again by hand makes it hers to look after once more.
    s = run(s, { type: 'setDisplay', artworkId: 'w-a', display: true });
    expect(s.staff!.parked).not.toContain('w-a');
  });
});
