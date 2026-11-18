import { FIXTURE, GUESTS, TIME } from '../config';
import { clamp, type Rng } from '../rng';
import { GUEST_SEEDS } from '../../data/guests';
import type { Fixture, FloorPlan, GameState, Guest, GuestAnim, GuestVisit, ScheduledEvent, VisitStep } from '../types';
import { sellArtwork } from '../venues/gallery';
import { notify } from './feed';
import { post } from './ledger';
import { hash01, moodOf, reactionFor, tasteScore, workTags } from './taste';

/** Absolute game hour: hours since day 1 opened. */
export const absHour = (state: Pick<GameState, 'day' | 'tick'>) => (state.day - 1) * TIME.ticksPerDay + state.tick;

/**
 * The simulation processes hour H and then moves the clock to H + 1, so the
 * screen shows H + 1 .. H + 2 until the next step. Visits are timed against
 * what is on screen.
 */
const shownHour = (state: GameState) => absHour(state) + 1;

const first = (g: Guest) => g.name.replace(/“.*”\s*/, '').split(' ')[0].replace('Prof.', 'Edmund');
export const shortName = (g: Guest) => (g.name.includes('“') ? g.name.match(/“(.*)”/)![1] : first(g));

// ---------------------------------------------------------------------------
// Where to stand

/** Where someone stands to look at a fixture, and which way they face. */
export function standSpot(f: Fixture, floor: FloorPlan, jitterKey: string, spread = 0) {
  const j = (hash01(jitterKey) - 0.5) * (0.3 + spread * 0.5);
  // Crowds fan out: some people hang back to see over the ones in front.
  const back = hash01(jitterKey + 'b') * spread;
  if (f.kind === 'wallHang') {
    return f.x === 0
      ? { at: { x: Math.min(floor.width - 0.5, 1.45 + back), y: f.y + 0.5 + j }, faceLeft: true }
      : { at: { x: f.x + 0.5 + j, y: Math.min(floor.height - 0.5, 1.45 + back) }, faceLeft: false };
  }
  return f.x + 1 < floor.width
    ? { at: { x: Math.min(floor.width - 0.5, f.x + 1.5 + back * 0.6), y: f.y + 0.5 + j }, faceLeft: true }
    : { at: { x: f.x + 0.5 + j, y: Math.min(floor.height - 0.5, f.y + 1.5 + back * 0.6) }, faceLeft: false };
}

const door = (floor: FloorPlan) => ({ x: floor.entrance.x + 0.5, y: floor.entrance.y + 0.5 });

// ---------------------------------------------------------------------------
// Timeline: the choreography of a visit, shared by the simulation (to know
// when they leave) and the renderer (to know where they are and what they do).

export interface Segment {
  anim: GuestAnim;
  start: number;
  end: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  faceLeft: boolean;
  /** Which planned step this belongs to, for "what are they thinking". */
  step?: number;
}

/** Screen-left in isometric terms: moving +y or -x goes left on screen. */
const leftward = (a: { x: number; y: number }, b: { x: number; y: number }) => b.x - a.x - (b.y - a.y) < 0;

export function visitTimeline(v: Pick<GuestVisit, 'guestId' | 'start' | 'steps' | 'chatWith' | 'event'>, floor: FloorPlan, eventEnd?: number): Segment[] {
  const segs: Segment[] = [];
  let t = v.start;
  let pos = door(floor);
  const walk = (to: { x: number; y: number }) => {
    const d = Math.hypot(to.x - pos.x, to.y - pos.y);
    if (d < 0.01) return;
    const dur = d / GUESTS.walkTilesPerHour;
    segs.push({ anim: 'walk', start: t, end: t + dur, from: pos, to, faceLeft: leftward(pos, to) });
    t += dur;
    pos = to;
  };
  const hold = (anim: GuestAnim, dur: number, faceLeft: boolean, step?: number) => {
    segs.push({ anim, start: t, end: t + dur, from: pos, to: pos, faceLeft, step });
    t += dur;
  };

  if (!v.steps.length) {
    // Nothing on the walls: wander in, look around, leave unimpressed.
    walk({ x: floor.width / 2, y: floor.height / 2 });
    hold('look', GUESTS.lookHours, true);
    hold('disapprove', GUESTS.reactHours, true);
  }
  v.steps.forEach((s, i) => {
    walk(s.at);
    hold('look', GUESTS.lookHours, s.faceLeft, i);
    hold(s.reaction, GUESTS.reactHours, s.faceLeft, i);
    if (s.action) hold(s.action, GUESTS.actionHours, s.faceLeft, i);
  });

  if (v.event && eventEnd !== undefined) {
    // Party: mingle until the evening ends, then head out.
    // Spread the party over the whole floor, not one huddle in the middle.
    const key = v.guestId + String(v.start);
    const spot = { x: 1.2 + hash01(key) * (floor.width - 2.4), y: 1.2 + hash01(key + 'y') * (floor.height - 2.4) };
    walk(spot);
    let flip = false;
    while (t < eventEnd - 0.6) {
      hold(flip ? 'idle' : 'chat', Math.min(0.9, eventEnd - 0.6 - t), flip);
      flip = !flip;
    }
  } else if (v.chatWith) {
    hold('chat', GUESTS.chatHours, false);
  }
  walk(door(floor));
  return segs;
}

/** Where a guest is and what they're doing at absolute time `now`. */
export function poseAt(segs: Segment[], now: number) {
  const seg = segs.find((s) => now < s.end) ?? segs[segs.length - 1];
  if (!seg) return null;
  const k = seg.end > seg.start ? clamp((now - seg.start) / (seg.end - seg.start), 0, 1) : 1;
  return {
    seg,
    x: seg.from.x + (seg.to.x - seg.from.x) * k,
    y: seg.from.y + (seg.to.y - seg.from.y) * k,
    /** Time into this segment, for animation frames. */
    local: now - seg.start,
  };
}

// ---------------------------------------------------------------------------
// Planning a visit

function planSteps(state: GameState, guest: Pick<Guest, 'id' | 'likes' | 'dislikes' | 'traits'>, rng: Rng, max: number, spread = 0): VisitStep[] {
  const spots = state.floor.fixtures.filter((f) => FIXTURE[f.kind].display && f.artworkId);
  // Shuffle, then keep the first few: people wander, they don't follow a list.
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  return spots.slice(0, max).map((f) => {
    const work = state.artworks[f.artworkId!];
    const score = tasteScore(guest as Guest, work, state.artists[work.artistId]);
    const reaction = reactionFor(score);
    const { at, faceLeft } = standSpot(f, state.floor, guest.id + f.id, spread);
    let action: VisitStep['action'];
    if (guest.traits.includes('note-taker')) action = 'notes';
    else if (guest.traits.includes('photographer') && score >= 0.55) action = 'photo';
    return { artworkId: work.id, at, faceLeft, score, reaction, action };
  });
}

function makeVisit(state: GameState, guest: Guest, start: number, rng: Rng): GuestVisit {
  const max = guest.role === 'critic' ? GUESTS.worksPerVisit + 1 : GUESTS.worksPerVisit;
  const steps = planSteps(state, guest, rng, max);
  const others = state.visits.filter((v) => !v.event && v.guestId !== guest.id);
  const chatWith = guest.traits.includes('chatty') && others.length ? others[Math.floor(rng.next() * others.length)].guestId : undefined;
  const v: GuestVisit = { guestId: guest.id, start, end: 0, steps, chatWith };
  const segs = visitTimeline(v, state.floor);
  v.end = segs[segs.length - 1].end;
  return v;
}

// ---------------------------------------------------------------------------
// Hourly: who walks in, who leaves

/** Chance per open hour that this guest drops in. */
function arrivalChance(state: GameState, g: Guest): number {
  if (state.reputation < g.minReputation) return 0;
  if (g.lastVisitDay === state.day) return 0;
  const hasArt = state.floor.fixtures.some((f) => f.artworkId);
  const perDay = (g.visitsPerWeek / 7) * clamp(1 + g.affinity / 80, 0.15, 2.2) * (hasArt ? 1 : 0.35);
  return perDay / (GUESTS.lastArrivalTick + 1);
}

// ---------------------------------------------------------------------------
// The public: everyone the visitor count counts, walking in one by one.

const CROWD_SPRITES = GUEST_SEEDS.map((g) => g.sprite);
/** Recolours per sprite (see render/sprites.ts). 0 is the named character's own look. */
export const CROWD_VARIANTS = 5;
const CROWD_TAGS = ['painting', 'portrait', 'landscape', 'colorful', 'pop', 'classic', 'quiet', 'moody', 'fantasy', 'weird', 'retro', 'digital', 'sculpture', 'figurative'];

/** One ordinary visitor: a stranger with a couple of passing tastes. */
function crowdVisit(state: GameState, start: number, rng: Rng, event = false): GuestVisit {
  const id = `c${state.nextId++}`;
  const look = { sprite: rng.pick(CROWD_SPRITES), variant: 1 + Math.floor(rng.next() * (CROWD_VARIANTS - 1)) };
  const stranger = {
    id,
    likes: [rng.pick(CROWD_TAGS), rng.pick(CROWD_TAGS)],
    dislikes: [rng.pick(CROWD_TAGS)],
    traits: rng.chance(0.15) ? ['photographer'] : [],
  };
  const steps = planSteps(state, stranger, rng, event ? (rng.chance(0.5) ? 1 : 0) : 1 + Math.floor(rng.next() * 3), 1.6);
  const v: GuestVisit = { guestId: id, start, end: 0, steps, look, event: event || undefined };
  if (event) v.end = eventEndHour(state);
  else {
    const segs = visitTimeline(v, state.floor);
    v.end = segs[segs.length - 1].end;
  }
  return v;
}

/** Puts `n` members of the public on the floor, arriving across the coming hour. */
export function crowdArrives(state: GameState, n: number, rng: Rng, event = false): void {
  const now = shownHour(state);
  for (let i = 0; i < n; i++) state.visits.push(crowdVisit(state, now + rng.next() * (event ? 0.6 : 0.95), rng, event));
}

export function hourOfGuests(state: GameState, rng: Rng, publicArrivals = 0): void {
  const now = shownHour(state);
  // Leavers first, so their effects land as they walk out.
  for (const v of state.visits.filter((v) => v.end <= now)) resolveVisit(state, v, rng);
  state.visits = state.visits.filter((v) => v.end > now);

  crowdArrives(state, publicArrivals, rng);
  if (state.tick > GUESTS.lastArrivalTick) return;
  for (const g of Object.values(state.guests)) {
    if (state.visits.some((v) => v.guestId === g.id)) continue;
    if (!rng.chance(arrivalChance(state, g))) continue;
    g.lastVisitDay = state.day;
    state.visits.push(makeVisit(state, g, now + rng.next() * 0.8, rng));
    // Named guests are visitors too: they count, and in a museum they buy a ticket.
    state.today.visitors += 1;
    if (state.venue === 'museum' && state.settings.ticketPrice > 0) post(state, 'tickets', state.settings.ticketPrice, 'Ticket sales', true);
  }
}

/** Doors close: everyone still inside finishes up. */
export function closeForTheNight(state: GameState, rng: Rng): void {
  for (const v of state.visits) if (!v.event) resolveVisit(state, v, rng);
  state.visits = [];
}

// ---------------------------------------------------------------------------
// What a visit does

function learn(state: GameState, g: Guest, steps: VisitStep[]) {
  for (const s of steps) {
    const work = state.artworks[s.artworkId];
    const tags = workTags(work, state.artists[work?.artistId]);
    if (s.reaction === 'impressed') {
      const t = tags.find((t) => g.likes.includes(t) && !g.knownLikes.includes(t));
      if (t) g.knownLikes.push(t);
    } else if (s.reaction === 'disapprove') {
      const t = tags.find((t) => g.dislikes.includes(t) && !g.knownDislikes.includes(t));
      if (t) g.knownDislikes.push(t);
    }
  }
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function resolveVisit(state: GameState, v: GuestVisit, rng: Rng): void {
  const g = state.guests[v.guestId];
  if (!g || v.event) return;
  const name = shortName(g);
  const seen = v.steps.filter((s) => state.artworks[s.artworkId]);
  const avg = seen.length ? seen.reduce((a, s) => a + s.score, 0) / seen.length : 0.2;
  const mood = moodOf(avg);
  const line = rng.pick(g.lines[mood]);

  g.visits += 1;
  g.affinity = clamp(g.affinity + (avg - 0.45) * (g.traits.includes('hard-to-please') ? 18 : 30), -100, 100);
  g.lastWords = line;
  learn(state, g, seen);
  const best = [...seen].sort((a, b) => b.score - a.score)[0];
  if (best && best.score >= GUESTS.impressedAt) g.favoriteArtworkId = best.artworkId;

  let said = false;
  // Buyers
  if (g.traits.includes('buyer') && best && best.score >= GUESTS.impressedAt) {
    const work = state.artworks[best.artworkId];
    if (state.venue === 'gallery') {
      if (work.status === 'display' && work.price <= g.budget && work.price <= work.value * g.priceTolerance) {
        sellArtwork(state, work, `to ${name}`, g.id);
        said = true;
      } else if (work.status === 'display' && work.price > g.budget) {
        notify(state, { kind: 'guest', guestId: g.id, text: `${name} adored “${work.title}”, but not at that price.` });
        said = true;
      }
    } else if (g.role === 'collector' && avg >= 0.55) {
      // Museums don't sell, so collectors who love the place become patrons.
      const gift = Math.round((g.budget * 0.04 * avg) / 50) * 50;
      if (gift >= 250) {
        post(state, 'donations', gift, `Donation from ${name}`);
        notify(state, { kind: 'guest', guestId: g.id, text: `${name} loved the collection and donated $${gift.toLocaleString('en-US')}.`, amount: gift });
        said = true;
      }
    }
  }
  // Critics
  if (g.role === 'critic') {
    const harsh = g.traits.includes('hard-to-please');
    const n = clamp(Math.round(1 + Math.pow(avg, harsh ? 1.4 : 1) * 4.4), 1, 5);
    const delta = (n - 3) * (harsh ? GUESTS.harshReviewWeight : GUESTS.reviewWeight);
    state.reputation = clamp(state.reputation + delta, 0, 100);
    notify(state, { kind: 'review', guestId: g.id, text: `${name}’s review ${stars(n)} “${line}”` });
    said = true;
  }
  // Photos and posts
  if (g.traits.includes('photographer') && avg >= 0.5) {
    const boost = Math.pow(avg, 2) * (g.role === 'influencer' ? GUESTS.influencerBuzz : GUESTS.photographerBuzz);
    state.buzz += boost;
    if (g.role === 'influencer' && best) {
      notify(state, { kind: 'guest', guestId: g.id, text: `${name} posted “${state.artworks[best.artworkId]?.title ?? 'your walls'}”. Expect more visitors.` });
      said = true;
    }
  }
  if (!said && mood !== 'meh') notify(state, { kind: 'guest', guestId: g.id, text: `${name}: “${line}”` });
}

// ---------------------------------------------------------------------------
// Events: regulars come to parties, and the wine and cheese matter to them.

/** Fills the floor for the event: named guests who come, plus enough of the public to match `attendance`. */
export function eventGuests(state: GameState, event: ScheduledEvent, satisfaction: number, rng: Rng, attendance = 0): void {
  let named = 0;
  const now = shownHour(state);
  const dayEnd = (state.day - 1) * TIME.ticksPerDay + TIME.ticksPerDay;
  const { wine, cheese } = event.hospitality;
  const reactions: string[] = [];
  for (const g of Object.values(state.guests)) {
    if (state.reputation + 10 < g.minReputation || g.affinity < -30) continue;
    const p = 0.45 + g.affinity / 200 + (g.traits.includes('freeloader') ? 0.4 : 0) + (event.kind === 'gala' ? 0.2 : 0);
    if (!rng.chance(clamp(p, 0, 0.95))) continue;

    let mood = (satisfaction - 0.5) * 20;
    const name = shortName(g);
    if (g.traits.includes('wine-lover')) {
      mood += (wine - 1.5) * 6;
      if (wine <= 1) reactions.push(`${name} sniffed the wine and put it down.`);
      if (wine === 3) reactions.push(`${name} is on a third glass of the good red.`);
    }
    if (g.traits.includes('cheese-snob')) {
      mood += (cheese - 1.5) * 6;
      if (cheese <= 1) reactions.push(`${name} has opinions about the cheese.`);
    }
    if (g.traits.includes('freeloader') && wine + cheese > 0) mood += 6;
    if (g.traits.includes('fame-chaser')) {
      const fame = event.featuredArtistIds.reduce((s, id) => s + (state.artists[id]?.fame ?? 0), 0);
      mood += (fame - 40) / 8;
    }
    g.affinity = clamp(g.affinity + mood, -100, 100);
    g.lastVisitDay = state.day;
    if (state.visits.some((v) => v.guestId === g.id)) continue;

    const steps = planSteps(state, g, rng, 1);
    // Buyers are in a spending mood at a good party.
    const best = steps[0];
    if (g.traits.includes('buyer') && best && state.venue === 'gallery' && best.score + satisfaction * 0.15 >= GUESTS.impressedAt) {
      const work = state.artworks[best.artworkId];
      if (work.status === 'display' && work.price <= g.budget && work.price <= work.value * g.priceTolerance) sellArtwork(state, work, `to ${name} at the ${event.kind}`, g.id);
    }
    state.visits.push({ guestId: g.id, start: now + rng.next() * 0.5, end: dayEnd, steps, event: true });
    named++;
  }
  crowdArrives(state, Math.max(0, attendance - named), rng, true);
  for (const r of reactions.slice(0, 3)) notify(state, { kind: 'guest', text: r });
}

export function eventEndHour(state: GameState): number {
  return (state.day - 1) * TIME.ticksPerDay + TIME.ticksPerDay;
}

