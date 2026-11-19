import { AUTO_HANG, FIXTURE, GUESTS } from '../config';
import { newId } from '../state';
import type { Artwork, Fixture, FixtureKind, GameState, HangJob, Id, StaffState } from '../types';
import { ASSISTANT, doorPost, routinePose } from './assistant';
import { notify } from './feed';
import { canPlace, displayFixtures, fitsOn, unhang } from './floor';
import { post } from './ledger';
import { standSpot } from './visits';

// Auto-hang: with it on, Marisol deals with every new piece that comes in
// (bought, or delivered by an artist). She hangs it in a free spot that suits
// it, or has a new wall spot or pedestal built if the floor has room and the
// money is there, or else takes down a weaker piece of the same kind to make
// room. The placement happens in the floor plan straight away; the job only
// times how the renderer shows her fetch it from the door and put it up.

const owned = (w: Artwork) => w.status === 'storage' || w.status === 'display';

/** Staff state, created on first use. Older saves start with everything they own already "seen". */
export function ensureStaff(state: GameState): StaffState {
  state.staff ??= {
    autoHang: false,
    seen: Object.values(state.artworks).filter(owned).map((w) => w.id),
    jobs: [],
  };
  return state.staff;
}

/** How good a piece is, for deciding what comes down to make room. */
const strength = (w: Artwork) => w.value;

/** Sculpture stands on pedestals; paintings and fibre pieces go on walls. */
const homeKind = (w: Artwork): FixtureKind => (w.form === 'sculpture' ? 'pedestal' : 'wallHang');

export type Placement =
  | { kind: 'free'; fixture: Fixture }
  | { kind: 'build'; fixtureKind: FixtureKind; x: number; y: number }
  | { kind: 'swap'; fixture: Fixture; evict: Artwork };

/** A legal tile for a new fixture of this kind that won't crowd the room, or null. */
export function buildSpot(state: GameState, kind: FixtureKind): { x: number; y: number } | null {
  const floor = state.floor;
  const { width, height, entrance } = floor;
  const tiles: { x: number; y: number; rank: number }[] = [];
  if (kind === 'wallHang') {
    // Along the back walls, filling from the corner outwards. The corner itself is left bare.
    for (let i = 1; i < Math.max(width, height); i++) {
      if (i < height) tiles.push({ x: 0, y: i, rank: i });
      if (i < width) tiles.push({ x: i, y: 0, rank: i + 0.5 });
    }
  } else {
    // Out on the floor, clear of the wall lanes (row and column 1, where people stand to look at
    // the walls), the door, and other furniture, with room in front to stand and look.
    const blocked = (x: number, y: number) =>
      floor.fixtures.some((f) => f.kind !== 'wallHang' && Math.abs(f.x - x) <= 1 && Math.abs(f.y - y) <= 1);
    for (let y = 2; y < height - 1; y++)
      for (let x = 2; x < width - 1; x++) {
        if (Math.abs(x - entrance.x) <= 1 && Math.abs(y - entrance.y) <= 1) continue;
        if (blocked(x, y)) continue;
        tiles.push({ x, y, rank: Math.abs(x - width / 2) + Math.abs(y - height / 2) });
      }
  }
  tiles.sort((a, b) => a.rank - b.rank);
  const t = tiles.find((t) => !canPlace(floor, kind, t.x, t.y));
  return t ? { x: t.x, y: t.y } : null;
}

/** Where a new work should go, or null if there's no room for it. `now` in absolute hours. Pure: changes nothing. */
export function planPlacement(state: GameState, work: Artwork, now = Infinity): Placement | null {
  const staff = ensureStaff(state);
  // Spots she hasn't finished filling yet are off limits.
  const busy = new Set(staff.jobs.filter((j) => j.hangAt > now).map((j) => j.fixtureId));
  // Wall pieces go on walls and sculpture on pedestals: she leaves easels to the player.
  const home = homeKind(work);
  const spots = displayFixtures(state.floor).filter((f) => f.kind === home && fitsOn(work, f.kind) && !busy.has(f.id));

  const free = spots.find((f) => !f.artworkId);
  if (free) return { kind: 'free', fixture: free };

  const cost = FIXTURE[home].cost;
  if (state.cash - cost >= AUTO_HANG.cashReserve) {
    const at = buildSpot(state, home);
    if (at) return { kind: 'build', fixtureKind: home, ...at };
  }

  // Rotate out the weakest piece of the same kind, if the new one is better.
  let best: { fixture: Fixture; evict: Artwork } | null = null;
  for (const f of spots) {
    const there = f.artworkId ? state.artworks[f.artworkId] : undefined;
    if (!there || homeKind(there) !== home) continue;
    if (strength(there) >= strength(work)) continue;
    if (!best || strength(there) < strength(best.evict)) best = { fixture: f, evict: there };
  }
  return best ? { kind: 'swap', ...best } : null;
}

/** Places one new work and books Marisol to go and put it up. */
function hangOne(state: GameState, work: Artwork, earliest: number): void {
  const staff = ensureStaff(state);
  const plan = planPlacement(state, work, earliest);
  const who = ASSISTANT.name;
  if (!plan) {
    notify(state, { kind: 'staff', text: `${who}: no room for “${work.title}” and nothing weaker to swap out. It’s in storage.` });
    return;
  }

  let fixture: Fixture;
  let note: string;
  let built = false;
  let evictedId: Id | undefined;
  if (plan.kind === 'build') {
    const cfg = FIXTURE[plan.fixtureKind];
    post(state, 'fit-out', -cfg.cost, `Built ${cfg.label.toLowerCase()} for "${work.title}"`);
    fixture = { id: newId(state, 'f'), kind: plan.fixtureKind, x: plan.x, y: plan.y };
    state.floor.fixtures.push(fixture);
    built = true;
    note = `${who} had a new ${cfg.label.toLowerCase()} put in ($${cfg.cost.toLocaleString('en-US')}) for “${work.title}”.`;
  } else if (plan.kind === 'swap') {
    fixture = plan.fixture;
    evictedId = plan.evict.id;
    unhang(state, plan.evict.id);
    plan.evict.status = 'storage';
    note = `${who} is swapping “${plan.evict.title}” into storage to make room for “${work.title}”.`;
  } else {
    fixture = plan.fixture;
    note = `${who} is putting up “${work.title}”.`;
  }
  unhang(state, work.id);
  fixture.artworkId = work.id;
  work.status = 'display';

  // When she gets to it: after the piece before it, fetched from the door, carried over.
  const last = staff.jobs[staff.jobs.length - 1];
  const start = Math.max(earliest, last?.end ?? -Infinity);
  const from = last && last.end >= start ? last.at : (({ x, y }) => ({ x, y }))(routinePose(state, start));
  const door = doorPost(state.floor);
  const { at, faceLeft } = standSpot(fixture, state.floor, `marisol-hang${fixture.id}`);
  const walk = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y) / GUESTS.walkTilesPerHour;
  const pickupAt = start + walk(from, door);
  const carryAt = pickupAt + AUTO_HANG.pickupHours;
  const arriveAt = carryAt + walk(door, at);
  const hangAt = arriveAt + AUTO_HANG.hangHours;
  const job: HangJob = {
    artworkId: work.id,
    fixtureId: fixture.id,
    start,
    pickupAt,
    carryAt,
    arriveAt,
    hangAt,
    end: hangAt + AUTO_HANG.admireHours,
    from,
    door,
    at,
    faceLeft,
  };
  if (built) job.built = true;
  if (evictedId) job.evictedId = evictedId;
  staff.jobs.push(job);
  notify(state, { kind: 'staff', text: note, at: { x: fixture.x, y: fixture.y } });
}

/**
 * Runs after every action. Notices works that have just come in and, with
 * auto-hang on, has Marisol place them, best first (so if space runs out it's
 * the weakest new piece that waits in storage). `now` is the earliest she can
 * start, in absolute hours. Also clears finished jobs.
 */
export function staffUpdate(state: GameState, now: number): void {
  const staff = ensureStaff(state);
  staff.jobs = staff.jobs.filter((j) => j.end + AUTO_HANG.returnHours * 3 > now - 1);

  const seen = new Set(staff.seen);
  const fresh = Object.values(state.artworks).filter((w) => owned(w) && !seen.has(w.id));
  if (!fresh.length) return;
  // Only works still owned stay on the list, so it doesn't grow forever.
  staff.seen = Object.values(state.artworks)
    .filter(owned)
    .map((w) => w.id);
  if (!staff.autoHang) return;
  fresh.sort((a, b) => strength(b) - strength(a));
  for (const w of fresh) if (w.status === 'storage') hangOne(state, w, now);
}

/**
 * What the floor should look like at time `now` while jobs are under way:
 * a spot she's on her way to still shows what was there before (or nothing),
 * and a fixture built for the piece appears when she gets there.
 * Returns the artwork to draw (null = empty), or 'hidden' for the whole fixture.
 */
export function shownOnFixture(state: GameState, f: Fixture, now: number): Id | null | 'hidden' {
  const job = state.staff?.jobs.find((j) => j.fixtureId === f.id && f.artworkId === j.artworkId && now < j.hangAt);
  if (!job) return f.artworkId ?? null;
  if (job.built && now < job.arriveAt) return 'hidden';
  const old = job.evictedId ? state.artworks[job.evictedId] : undefined;
  return old?.status === 'storage' ? old.id : null;
}
