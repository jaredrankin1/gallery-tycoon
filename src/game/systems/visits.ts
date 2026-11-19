import { FIXTURE, GUESTS, MOODS, TIME, trafficShare } from '../config';
import { clamp, type Rng } from '../rng';
import { GUEST_SEEDS } from '../../data/guests';
import { FIRST_NAMES, LAST_NAMES } from '../../data/names';
import type { Fixture, FloorPlan, GameState, Guest, GuestAnim, GuestVisit, Mood, ScheduledEvent, VisitStep } from '../types';
import { sellArtwork } from '../venues/gallery';
import { notify } from './feed';
import { post } from './ledger';
import { addMood, challengeOf, encounterMood, finalMood, guestPersona, randomPersona, startMood, ZERO_MOOD, type Persona } from './moods';
import { blockedTiles, browseSpot, route } from './paths';
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
/** Somewhere in the doorway: people don't all squeeze through the same point. */
const doorway = (floor: FloorPlan, key: string) => ({
  x: floor.entrance.x + 0.5 + (hash01(key + 'dx') - 0.5) * 0.6,
  y: floor.entrance.y + 0.5 + (hash01(key + 'dy') - 0.5) * 0.6,
});

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

export function visitTimeline(
  v: Pick<GuestVisit, 'guestId' | 'start' | 'steps' | 'chatWith' | 'event'>,
  floor: FloorPlan,
  eventEnd?: number,
): Segment[] {
  // A party runs from the evening's event until PARTY_HOURS later.
  if (v.event && eventEnd === undefined) eventEnd = partyEndFor(v.start);
  return planTimeline(v, floor, eventEnd);
}

/** Parties wind down this many hours after the event starts. */
const PARTY_HOURS = 4;
const partyEndFor = (start: number) => Math.floor(start / TIME.ticksPerDay) * TIME.ticksPerDay + TIME.eventTick + 1 + PARTY_HOURS;

function planTimeline(v: Pick<GuestVisit, 'guestId' | 'start' | 'steps' | 'chatWith' | 'event'>, floor: FloorPlan, eventEnd?: number): Segment[] {
  const segs: Segment[] = [];
  const key = v.guestId + '@' + v.start;
  const blocked = blockedTiles(floor);
  // Everyone walks at their own pace.
  const [slow, fast] = MOODS.paceRange;
  const speed = GUESTS.walkTilesPerHour * (slow + (fast - slow) * hash01(key + 'pace'));
  let t = v.start;
  let pos = doorway(floor, key + 'in');
  let legs = 0;
  const leg = (to: { x: number; y: number }) => {
    const d = Math.hypot(to.x - pos.x, to.y - pos.y);
    if (d < 0.01) return;
    const dur = d / speed;
    segs.push({ anim: 'walk', start: t, end: t + dur, from: pos, to, faceLeft: leftward(pos, to) });
    t += dur;
    pos = to;
  };
  // Around the furniture, not through it.
  const walk = (to: { x: number; y: number }) => {
    for (const p of route(floor, pos, to, key + legs++, blocked)) leg(p);
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
    // Some people drift into the middle of the room for a bit before the next work.
    if (!v.event && hash01(key + 'browse' + i) < MOODS.browseChance) {
      const spot = browseSpot(floor, key + i, blocked);
      if (spot) {
        walk(spot);
        const [lo, hi] = MOODS.browseHours;
        hold('idle', lo + (hi - lo) * hash01(key + 'linger' + i), hash01(key + 'turn' + i) < 0.5);
      }
    }
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
    // Leave time to cross the room before the doors lock.
    const home = door(floor);
    const out = eventEnd - Math.hypot(home.x - spot.x, home.y - spot.y) / GUESTS.walkTilesPerHour - 0.1;
    while (t < out - 0.01) {
      hold(flip ? 'idle' : 'chat', Math.min(0.9, out - t), flip);
      flip = !flip;
    }
  } else if (v.chatWith) {
    hold('chat', GUESTS.chatHours, false);
  }
  walk(doorway(floor, key + 'out'));
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

/**
 * Who is where, and when, among the visits already planned: used to work out
 * how crowded a work will be when someone gets to it.
 */
export interface Occupancy {
  /** Per artwork: when people stand at it. */
  at: Map<string, [number, number][]>;
  /** When each visit is in the building. */
  inside: [number, number][];
  area: number;
}

export function occupancyOf(state: GameState): Occupancy {
  const occ: Occupancy = { at: new Map(), inside: [], area: state.floor.width * state.floor.height };
  for (const v of state.visits) addOccupancy(occ, v, visitTimeline(v, state.floor));
  return occ;
}

function addOccupancy(occ: Occupancy, v: GuestVisit, segs: Segment[]) {
  occ.inside.push([v.start, v.end]);
  v.steps.forEach((s, i) => {
    const mine = segs.filter((g) => g.step === i);
    if (!mine.length) return;
    const list = occ.at.get(s.artworkId) ?? [];
    list.push([mine[0].start, mine[mine.length - 1].end]);
    occ.at.set(s.artworkId, list);
  });
}

const during = (list: [number, number][] | undefined, t: number) => (list ?? []).filter(([a, b]) => a <= t && t < b).length;

interface Plan {
  steps: VisitStep[];
  leftEarly?: GuestVisit['leftEarly'];
}

function planSteps(
  state: GameState,
  guest: Pick<Guest, 'id' | 'likes' | 'dislikes' | 'traits'>,
  rng: Rng,
  max: number,
  spread = 0,
  moods?: { persona: Persona; start: Mood; at: number; occ: Occupancy },
): Plan {
  const spots = state.floor.fixtures.filter((f) => FIXTURE[f.kind].display && f.artworkId);
  // Shuffle, then keep the first few: people wander, they don't follow a list.
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const steps: VisitStep[] = [];
  let mood = moods?.start ?? ZERO_MOOD;
  let lastArtist: string | undefined;
  let leftEarly: Plan['leftEarly'];
  // Rough arrival time at each work, for judging the crowd there.
  let t = (moods?.at ?? 0) + 0.25;
  for (let n = 0; n < spots.length && steps.length < max; n++) {
    const f = spots[n];
    const work = state.artworks[f.artworkId!];
    const artist = state.artists[work.artistId];
    const score = tasteScore(guest as Guest, work, artist);
    const reaction = reactionFor(score);
    const { at, faceLeft } = standSpot(f, state.floor, guest.id + f.id, spread);
    let action: VisitStep['action'];
    const i = steps.length;
    const notes = guest.traits.includes('note-taker');
    const photos = guest.traits.includes('photographer') && score >= 0.55;
    // People who do both alternate: sketch one, photograph the next.
    if (notes && (!photos || i % 2 === 0)) action = 'notes';
    else if (photos) action = 'photo';
    const step: VisitStep = { artworkId: work.id, at, faceLeft, score, reaction, action };

    if (moods) {
      const crowd = during(moods.occ.at.get(work.id), t);
      const left = spots.length - n - 1;
      // Impatient people skip a work with a crowd round it, if there's something else to see.
      if (crowd >= MOODS.skipCrowdAt && moods.persona.patience < 0.5 && left > 0) {
        mood = addMood(mood, { ...ZERO_MOOD, happy: -0.04 });
        continue;
      }
      const packed = during(moods.occ.inside, t) / moods.occ.area / MOODS.packedDensity - 1;
      const delta = encounterMood(moods.persona, {
        score,
        challenge: challengeOf(work, artist),
        fame: artist?.fame ?? 0,
        tags: workTags(work, artist),
        repeat: work.artistId === lastArtist,
        crowd,
        packed,
        venue: state.venue,
        affordable: state.venue === 'gallery' ? clamp((moods.persona.wealth * 40_000) / Math.max(1, work.price), 0, 1) : 0,
      });
      step.mood = delta;
      step.crowd = crowd;
      mood = addMood(mood, delta);
      t += GUESTS.lookHours + GUESTS.reactHours + (action ? GUESTS.actionHours : 0) + 0.35;
    }
    steps.push(step);
    lastArtist = work.artistId;

    // Had enough? Leave before the rest of the plan.
    if (moods && steps.length < max && n < spots.length - 1) {
      if (mood.amused <= MOODS.leaveBoredAt) leftEarly = 'bored';
      else if (mood.happy <= MOODS.leaveUnhappyAt) leftEarly = (step.crowd ?? 0) > 1 ? 'crowded' : 'unhappy';
      if (leftEarly) break;
    }
  }
  return { steps, leftEarly };
}

/** "Ada Okafor": a name for someone off the street. */
export function randomName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

function makeVisit(state: GameState, guest: Guest, start: number, rng: Rng, occ: Occupancy): GuestVisit {
  const max = guest.role === 'critic' ? GUESTS.worksPerVisit + 1 : GUESTS.worksPerVisit;
  const persona = guestPersona(guest);
  const mood = startMood(persona, rng);
  // How they feel about the place colours the day.
  mood.happy = clamp(mood.happy + guest.affinity / 250, -1, 1);
  const { steps, leftEarly } = planSteps(state, guest, rng, max, 0, { persona, start: mood, at: start, occ });
  const others = state.visits.filter((v) => !v.event && v.guestId !== guest.id);
  const chatWith = guest.traits.includes('chatty') && others.length ? others[Math.floor(rng.next() * others.length)].guestId : undefined;
  const v: GuestVisit = { guestId: guest.id, start, end: 0, steps, chatWith, mood, leftEarly };
  const segs = visitTimeline(v, state.floor);
  v.end = segs[segs.length - 1].end;
  addOccupancy(occ, v, segs);
  return v;
}

// ---------------------------------------------------------------------------
// Hourly: who walks in, who leaves

/** Chance this hour that this guest drops in: their visits per day, spread like everyone else's over the day. */
function arrivalChance(state: GameState, g: Guest): number {
  if (state.reputation < g.minReputation) return 0;
  if (g.lastVisitDay === state.day) return 0;
  const hasArt = state.floor.fixtures.some((f) => f.artworkId);
  const perDay = (g.visitsPerWeek / 7) * clamp(1 + g.affinity / 80, 0.15, 2.2) * (hasArt ? 1 : 0.35);
  return perDay * trafficShare(state.tick + 1);
}

// ---------------------------------------------------------------------------
// The public: everyone the visitor count counts, walking in one by one.

// Mostly-black-and-white outfits barely change when recoloured, so those
// characters stay unique rather than having lookalikes in the crowd.
const UNIQUE_LOOKS = ['beatrix', 'hana'];
const CROWD_SPRITES = GUEST_SEEDS.map((g) => g.sprite).filter((s) => !UNIQUE_LOOKS.includes(s));
/** Recolours per sprite (see render/sprites.ts). 0 is the named character's own look. */
export const CROWD_VARIANTS = 5;
const CROWD_TAGS = ['painting', 'portrait', 'landscape', 'colorful', 'pop', 'classic', 'quiet', 'moody', 'fantasy', 'weird', 'retro', 'digital', 'sculpture', 'figurative'];

/** One ordinary visitor: a stranger with a name, a couple of passing tastes and a mood of their own. */
function crowdVisit(state: GameState, start: number, rng: Rng, occ: Occupancy, event = false): GuestVisit {
  const id = `c${state.nextId++}`;
  const look = { sprite: rng.pick(CROWD_SPRITES), variant: 1 + Math.floor(rng.next() * (CROWD_VARIANTS - 1)) };
  const name = randomName(rng);
  const stranger = {
    id,
    likes: [rng.pick(CROWD_TAGS), rng.pick(CROWD_TAGS)],
    dislikes: [rng.pick(CROWD_TAGS)],
    traits: rng.chance(0.15) ? ['photographer'] : [],
  };
  const persona = randomPersona(rng);
  const mood = startMood(persona, rng, event);
  const max = event ? (rng.chance(0.5) ? 1 : 0) : 1 + Math.floor(rng.next() * 3);
  const { steps, leftEarly } = planSteps(state, stranger, rng, max, 1.6, { persona, start: mood, at: start, occ });
  const v: GuestVisit = { guestId: id, start, end: 0, steps, look, name, mood, leftEarly, event: event || undefined };
  const segs = visitTimeline(v, state.floor);
  v.end = segs[segs.length - 1].end;
  addOccupancy(occ, v, segs);
  return v;
}

/** Puts `n` members of the public on the floor, arriving across the coming hour. */
export function crowdArrives(state: GameState, n: number, rng: Rng, event = false, occ = occupancyOf(state)): void {
  const now = shownHour(state);
  for (let i = 0; i < n; i++) state.visits.push(crowdVisit(state, now + rng.next() * (event ? 0.6 : 0.95), rng, occ, event));
}

export function hourOfGuests(state: GameState, rng: Rng, publicArrivals = 0): void {
  const now = shownHour(state);
  // Leavers first, so their effects land as they walk out.
  for (const v of state.visits.filter((v) => v.end <= now)) resolveVisit(state, v, rng);
  state.visits = state.visits.filter((v) => v.end > now);

  const occ = occupancyOf(state);
  crowdArrives(state, publicArrivals, rng, false, occ);
  for (const g of Object.values(state.guests)) {
    if (state.visits.some((v) => v.guestId === g.id)) continue;
    if (!rng.chance(arrivalChance(state, g))) continue;
    g.lastVisitDay = state.day;
    state.visits.push(makeVisit(state, g, now + rng.next() * 0.8, rng, occ));
    // Named guests are visitors too: they count, and in a museum they buy a ticket.
    state.today.visitors += 1;
    if (state.venue === 'museum' && state.settings.ticketPrice > 0) post(state, 'tickets', state.settings.ticketPrice, 'Ticket sales', true);
  }
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

/**
 * A member of the public on their way out. Delighted people tell their
 * friends; miserable ones tell everyone. In a gallery, someone who fell for a
 * work may come back to the desk and buy it.
 */
function resolvePublic(state: GameState, v: GuestVisit, rng: Rng): void {
  if (!v.mood) return; // planned before moods existed (old save)
  const m = finalMood(v);
  const glow = (m.happy + m.inspired + m.amused) / 3;
  if (glow > 0.35) state.buzz += MOODS.wordOfMouth;
  else if (glow < -0.3) state.buzz = Math.max(0, state.buzz - MOODS.wordOfMouth);

  if (state.venue !== 'gallery' || v.event || m.covetous < MOODS.buyAt) return;
  // The work they wanted most: the one that pushed covetousness up furthest.
  const wanted = [...v.steps].sort((a, b) => (b.mood?.covetous ?? 0) - (a.mood?.covetous ?? 0))[0];
  const work = wanted && state.artworks[wanted.artworkId];
  if (!work || work.status !== 'display' || work.price > work.value * 1.6) return;
  if (rng.chance(MOODS.buyChance + (m.covetous - MOODS.buyAt))) sellArtwork(state, work, `to ${v.name ?? 'a visitor'}`);
}

export function resolveVisit(state: GameState, v: GuestVisit, rng: Rng): void {
  const g = state.guests[v.guestId];
  if (!g) return resolvePublic(state, v, rng);
  if (v.event) return;
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
  const occ = occupancyOf(state);
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

    const persona = guestPersona(g);
    const start = now + rng.next() * 0.5;
    const moodIn = startMood(persona, rng, true);
    moodIn.happy = clamp(moodIn.happy + mood / 40, -1, 1);
    const { steps } = planSteps(state, g, rng, 1, 0, { persona, start: moodIn, at: start, occ });
    // Buyers are in a spending mood at a good party.
    const best = steps[0];
    if (g.traits.includes('buyer') && best && state.venue === 'gallery' && best.score + satisfaction * 0.15 >= GUESTS.impressedAt) {
      const work = state.artworks[best.artworkId];
      if (work.status === 'display' && work.price <= g.budget && work.price <= work.value * g.priceTolerance) sellArtwork(state, work, `to ${name} at the ${event.kind}`, g.id);
    }
    const v: GuestVisit = { guestId: g.id, start, end: 0, steps, event: true, mood: moodIn };
    const segs = visitTimeline(v, state.floor);
    v.end = segs[segs.length - 1].end;
    addOccupancy(occ, v, segs);
    state.visits.push(v);
    named++;
  }
  crowdArrives(state, Math.max(0, attendance - named), rng, true, occ);
  for (const r of reactions.slice(0, 3)) notify(state, { kind: 'guest', text: r });
}

