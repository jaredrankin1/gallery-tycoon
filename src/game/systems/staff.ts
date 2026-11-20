import { candidateById, STAFF_CANDIDATES, type StaffCandidate } from '../../data/staff';
import { GUESTS, INCIDENTS, isNight, MERCH, STAFF, STAFF_ROLES, TIME } from '../config';
import type { Rng } from '../rng';
import type { GameState, Hire, MerchKind, StaffRole } from '../types';
import { doorPost } from './assistant';
import { workValue } from './careers';
import { notify } from './feed';
import { unhang } from './floor';
import { post } from './ledger';
import { shopCounter } from './shop';
import { hash01 } from './taste';
import { standSpot } from './visits';

export const STAFF_ROLE_ORDER: StaffRole[] = ['security', 'appraiser', 'curator', 'intern'];

/** Who holds this role, if anyone. */
export function hired(state: GameState, role: StaffRole): (Hire & { who: StaffCandidate }) | undefined {
  const h = state.staff?.hired?.[role];
  const who = h && candidateById(h.candidateId);
  return h && who ? { ...h, who } : undefined;
}

export const candidatesFor = (role: StaffRole) => STAFF_CANDIDATES.filter((c) => c.role === role);

export const salaryOf = (c: StaffCandidate) => Math.round((STAFF_ROLES[c.role].salary * STAFF.salaryBySkill[c.skill]) / 10) * 10;

/** How strongly whoever holds this role does it: 0 when nobody does, else ~0.7 .. 1.3. */
export function staffPower(state: GameState, role: StaffRole): number {
  const h = hired(state, role);
  return h ? STAFF.effectBySkill[h.who.skill] : 0;
}

/** Everyone's weekly wages (not Marisol, who is in the difficulty's base staff cost). */
export const weeklySalaries = (state: GameState) =>
  STAFF_ROLE_ORDER.reduce((t, r) => {
    const h = hired(state, r);
    return t + (h ? salaryOf(h.who) : 0);
  }, 0);

const first = (name: string) => name.split(' ')[0];

// ---- Hiring ------------------------------------------------------------------

export function hire(state: GameState, candidateId: string): string | void {
  const c = candidateById(candidateId);
  if (!c) return 'Nobody by that name applied.';
  state.staff ??= { autoHang: true, seen: [], parked: [], jobs: [] };
  state.staff.hired ??= {};
  const current = hired(state, c.role);
  if (current?.who.id === c.id) return `${c.name} already works here.`;
  if (current) letGo(state, c.role, true);
  state.staff.hired[c.role] = { candidateId: c.id, since: state.day, owed: 0 };
  notify(state, { kind: 'staff', text: `${c.name} starts today as your ${STAFF_ROLES[c.role].label.toLowerCase()}. $${salaryOf(c).toLocaleString('en-US')} a week.` });
}

/** Lets someone go. They're paid what they've earned so far. */
export function letGo(state: GameState, role: StaffRole, quiet = false): string | void {
  const h = hired(state, role);
  if (!h) return 'Nobody holds that job.';
  if (h.owed > 0) post(state, 'staff', -h.owed, `Final pay: ${h.who.name}`);
  delete state.staff!.hired![role];
  if (!quiet) notify(state, { kind: 'staff', text: `${h.who.name} has left. ${first(h.who.name)} wishes you well.` });
}

// ---- What they do -------------------------------------------------------------

/** The appraiser's haggling: share knocked off a dealer's asking price. */
export const appraiserDiscount = (state: GameState) => STAFF.appraiserDiscount * staffPower(state, 'appraiser');

/** Buyers trust an appraised work: multiplier on floor sale chance. */
export const appraiserSaleBoost = (state: GameState) => 1 + STAFF.appraiserSaleBoost * staffPower(state, 'appraiser');

/** The assistant curator's bonus to an exhibition's synergy. */
export const curatorSynergy = (state: GameState) => STAFF.curatorSynergy * staffPower(state, 'curator');

export const curatorEventBonus = (state: GameState) => STAFF.curatorEventSatisfaction * staffPower(state, 'curator');

/** The intern minding the counter: multiplier on gift shop buy chance. */
export const internShopBoost = (state: GameState) => 1 + STAFF.internShopBoost * staffPower(state, 'intern');

/** Daily chance of trouble on the floor, before the guard. */
export function incidentChance(state: GameState, visitors = state.today.visitors): number {
  return Math.min(INCIDENTS.maxChance, INCIDENTS.baseChance + visitors * INCIDENTS.perVisitor);
}

/** Share of incidents the guard stops. */
export const guardStops = (state: GameState) => Math.min(0.95, INCIDENTS.guardStops * staffPower(state, 'security'));

type IncidentKind = 'damage' | 'theft' | 'shoplift';

/** Midnight: wages accrue, the intern posts, and maybe something goes wrong. */
export function staffEndOfDay(state: GameState, rng: Rng): void {
  for (const r of STAFF_ROLE_ORDER) {
    const h = state.staff?.hired?.[r];
    const who = h && candidateById(h.candidateId);
    if (h && who) h.owed += salaryOf(who) / 7;
  }
  const intern = hired(state, 'intern');
  if (intern) state.buzz += STAFF.internDailyBuzz * staffPower(state, 'intern');
  rollIncident(state, rng);
}

/** Bill day: everyone's wages, one line each. */
export function payStaff(state: GameState): number {
  let total = 0;
  for (const r of STAFF_ROLE_ORDER) {
    const h = state.staff?.hired?.[r];
    const who = h && candidateById(h.candidateId);
    if (!h || !who || h.owed <= 0) continue;
    const pay = Math.round(h.owed);
    post(state, 'staff', -pay, `Wages: ${who.name}`);
    total += pay;
    h.owed = 0;
  }
  return total;
}

function rollIncident(state: GameState, rng: Rng): void {
  if (!rng.chance(incidentChance(state))) return;
  const shown = Object.values(state.artworks).filter((w) => w.status === 'display');
  const counter = shopCounter(state);
  const stocked = counter ? (Object.keys(state.shop.lines) as MerchKind[]).filter((k) => state.shop.lines[k].stock > 0) : [];
  const guard = hired(state, 'security');
  const w = INCIDENTS.weights;
  const options: [IncidentKind, number][] = [];
  if (shown.length) options.push(['damage', w.damage], ['theft', w.theft]);
  if (stocked.length) options.push(['shoplift', w.shoplift]);
  if (!options.length) return;
  let roll = rng.next() * options.reduce((s, o) => s + o[1], 0);
  let kind = options[0][0];
  for (const [k, p] of options) {
    if ((roll -= p) <= 0) {
      kind = k;
      break;
    }
  }

  if (guard && (kind === 'theft' || rng.chance(guardStops(state)))) {
    const what = kind === 'theft' ? 'someone trying to walk out with a painting' : kind === 'damage' ? 'a visitor about to lean on a piece' : 'a shoplifter at the gift shop';
    notify(state, { kind: 'staff', text: `${first(guard.who.name)} stopped ${what}. Nothing lost.` });
    return;
  }

  if (kind === 'shoplift') {
    const k = rng.pick(stocked);
    const line = state.shop.lines[k];
    const [lo, hi] = INCIDENTS.shoplift;
    const n = Math.min(line.stock, Math.round(rng.range(lo, hi)));
    line.stock -= n;
    notify(state, {
      kind: 'warn',
      text: `Shoplifters took ${n} ${MERCH[k].plural} from the gift shop.${guard ? '' : ' A guard would have stopped them.'}`,
      at: counter && { x: counter.x, y: counter.y },
    });
    return;
  }

  const work = rng.pick(shown);
  const spot = state.floor.fixtures.find((f) => f.artworkId === work.id);
  const at = spot && { x: spot.x, y: spot.y };
  if (kind === 'damage') {
    const before = work.value;
    work.grade = Math.round(work.grade * (1 - INCIDENTS.damage) * 100) / 100;
    work.value = workValue(state.artists[work.artistId], work);
    notify(state, {
      kind: 'warn',
      text: `A visitor knocked into “${work.title}”. It’s damaged: worth $${(before - work.value).toLocaleString('en-US')} less.${guard ? '' : ' A guard keeps people back.'}`,
      at,
    });
    return;
  }
  // Theft: only ever happens with no guard on.
  unhang(state, work.id);
  work.status = 'sold';
  work.stolen = true;
  work.day = state.day;
  if (state.staff) state.staff.parked = state.staff.parked?.filter((id) => id !== work.id);
  notify(state, { kind: 'warn', text: `“${work.title}” was stolen off the wall overnight. Hire a guard before it happens again.`, at });
}

// ---- On the floor -------------------------------------------------------------

/** What a staff member is doing: an animation name from their sheet. */
export interface StaffPose {
  role: StaffRole;
  sprite: string;
  variant: number;
  x: number;
  y: number;
  anim: string;
  faceLeft: boolean;
  /** Hours into the current action. */
  local: number;
}

type Spot = { x: number; y: number };
type Job = { at: Spot; anim: string; faceLeft: boolean };

/** Hours per job. Each starts with the walk over. */
const SHIFT: Record<StaffRole, number> = { security: 1.8, appraiser: 1.6, curator: 1.5, intern: 1.1 };

function anywhere(state: GameState, key: string): Spot {
  const f = state.floor;
  return { x: 1.2 + hash01(key + 'x') * (f.width - 2.4), y: 1.2 + hash01(key + 'y') * (f.height - 2.4) };
}

/** By the door, on the other side from Marisol. */
function guardPost(state: GameState): Spot {
  const d = state.floor.entrance;
  const m = doorPost(state.floor);
  return { x: Math.min(state.floor.width - 0.6, d.x + 0.5 + (d.x + 0.5 - m.x)), y: Math.max(0.6, m.y) };
}

function nearArt(state: GameState, role: StaffRole, n: number, anims: string[]): Job | null {
  const hung = state.floor.fixtures.filter((f) => f.artworkId);
  if (!hung.length) return null;
  const f = hung[Math.floor(hash01(`${role}-f${n}`) * hung.length)];
  const { at, faceLeft } = standSpot(f, state.floor, `${role}${f.id}${n}`, 0.6);
  return { at, faceLeft, anim: anims[Math.floor(hash01(`${role}-a${n}`) * anims.length)] };
}

function jobFor(state: GameState, role: StaffRole, n: number, hour: number): Job {
  const key = `${role}${n}`;
  const roll = hash01(key);
  const side = hash01(key + 'l') < 0.5;
  if (role === 'security') {
    if (isNight(hour)) {
      // Nights: the Segway round with a flashlight, or a nap in the chair.
      if (roll < 0.35) return { at: guardPost(state), faceLeft: true, anim: 'sleep' };
      return { at: anywhere(state, key), faceLeft: side, anim: roll < 0.7 ? 'flashlight' : 'radio' };
    }
    if (roll < 0.4) return { at: guardPost(state), faceLeft: true, anim: roll < 0.15 ? 'donut' : roll < 0.3 ? 'idle' : 'radio' };
    return { at: anywhere(state, key), faceLeft: side, anim: roll < 0.6 ? 'think' : roll < 0.8 ? 'point' : roll < 0.9 ? 'whistle' : 'idle' };
  }
  if (role === 'appraiser') return nearArt(state, role, n, ['look', 'notes', 'think', 'notes']) ?? { at: anywhere(state, key), faceLeft: side, anim: 'notes' };
  if (role === 'curator') {
    if (roll < 0.25) return { at: anywhere(state, key), faceLeft: side, anim: 'chat' };
    return nearArt(state, role, n, ['look', 'think', 'impressed', 'notes']) ?? { at: anywhere(state, key), faceLeft: side, anim: 'think' };
  }
  // Intern: minds the counter, films the art for the socials, runs errands.
  const counter = shopCounter(state);
  if (counter && roll < 0.4) return { at: { x: counter.x + 0.5, y: counter.y + 1.3 }, faceLeft: true, anim: roll < 0.25 ? 'idle' : 'chat' };
  return nearArt(state, role, n, ['photo', 'photo', 'look']) ?? { at: anywhere(state, key), faceLeft: side, anim: 'idle' };
}

const onShift = (role: StaffRole, hour: number) => role === 'security' || (hour >= STAFF.dayStart && hour < STAFF.dayEnd);

/**
 * Where each hired staff member is at absolute game time `now`: a pure function
 * of the floor and the clock, like Marisol's routine. Staff aren't visitors:
 * they're never counted, never tapped. Daytime staff go home at night.
 */
export function staffPoses(state: GameState, now: number): StaffPose[] {
  const out: StaffPose[] = [];
  const hourOfDay = now - Math.floor(now / TIME.ticksPerDay) * TIME.ticksPerDay;
  const hour = Math.floor(hourOfDay);
  for (const role of STAFF_ROLE_ORDER) {
    const h = hired(state, role);
    if (!h || !onShift(role, hour)) continue;
    const span = SHIFT[role];
    const n = Math.floor(now / span);
    const t = now - n * span;
    const prev = jobFor(state, role, n - 1, Math.floor(((n - 1) * span) % TIME.ticksPerDay));
    const job = jobFor(state, role, n, hour);
    const dist = Math.hypot(job.at.x - prev.at.x, job.at.y - prev.at.y);
    // Duane covers the floor on his Segway, a bit quicker than walking.
    const pace = role === 'security' ? 1.5 : 1;
    const walk = Math.min(span * 0.6, dist / (GUESTS.walkTilesPerHour * pace));
    const base = { role, sprite: h.who.sprite, variant: h.who.variant };
    if (t < walk) {
      const k = t / walk;
      out.push({
        ...base,
        x: prev.at.x + (job.at.x - prev.at.x) * k,
        y: prev.at.y + (job.at.y - prev.at.y) * k,
        anim: role === 'security' ? 'segway' : 'walk',
        faceLeft: job.at.x - prev.at.x - (job.at.y - prev.at.y) < 0,
        local: t,
      });
    } else out.push({ ...base, ...job.at, anim: job.anim, faceLeft: job.faceLeft, local: t - walk });
  }
  return out;
}
