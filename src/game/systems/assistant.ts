import { AUTO_HANG, GUESTS, isNight, TIME } from '../config';
import type { FloorPlan, GameState, HangJob, Id } from '../types';
import { hash01 } from './taste';
import { standSpot } from './visits';

/** Your gallery assistant. Staff, not a visitor: she's never counted and never buys. */
export const ASSISTANT = {
  name: 'Marisol',
  title: 'Your gallery assistant',
  sprite: 'assistant',
};

export type AssistantAnim = 'idle' | 'walk' | 'clipboard' | 'dust' | 'wave' | 'point' | 'cheer' | 'radio' | 'crossed' | 'look';

export interface AssistantPose {
  x: number;
  y: number;
  anim: AssistantAnim;
  faceLeft: boolean;
  /** Hours into the current action, for animation frames. */
  local: number;
  /** How long the current action lasts, in hours, when it has a set end (one-shot animations play across it). */
  span?: number;
  /** The artwork she's carrying over to hang. */
  carrying?: Id;
}

/** Each job takes this long, walking there included. */
const SHIFT = 1.4;

type Job = { at: { x: number; y: number }; anim: AssistantAnim; faceLeft: boolean };

const door = (floor: FloorPlan) => ({ x: floor.entrance.x + 0.5, y: floor.entrance.y + 0.5 });

/** By the door, facing in, ready to say hello or goodbye. */
export function doorPost(floor: FloorPlan): Job['at'] {
  const d = door(floor);
  return { x: Math.max(0.6, d.x - 0.9), y: Math.max(0.6, d.y - 0.9) };
}

/** What she's doing during job slot `n`: a pure function of the floor and the slot, so she's in step at any speed. */
function jobFor(state: GameState, n: number): Job {
  const floor = state.floor;
  const hung = floor.fixtures.filter((f) => f.artworkId);
  const roll = hash01(`marisol${n}`);
  if (hung.length && roll < 0.45) {
    // Dust a piece, or stand by it and talk visitors through it.
    const f = hung[Math.floor(hash01(`marisol-f${n}`) * hung.length)];
    const { at, faceLeft } = standSpot(f, floor, `marisol${f.id}`);
    return { at, faceLeft, anim: roll < 0.28 ? 'dust' : 'point' };
  }
  if (roll < 0.62) return { at: doorPost(floor), faceLeft: false, anim: 'wave' };
  const at = { x: 1.3 + hash01(`marisol-x${n}`) * (floor.width - 2.6), y: 1.3 + hash01(`marisol-y${n}`) * (floor.height - 2.6) };
  return { at, faceLeft: hash01(`marisol-l${n}`) < 0.5, anim: roll < 0.85 ? 'clipboard' : roll < 0.93 ? 'radio' : 'crossed' };
}

const walkHours = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y) / GUESTS.walkTilesPerHour;

function walking(from: { x: number; y: number }, to: { x: number; y: number }, k: number, local: number): AssistantPose {
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    anim: 'walk',
    faceLeft: to.x - from.x - (to.y - from.y) < 0,
    local,
  };
}

/** Where Marisol is and what she's doing at absolute game time `now` (see absHour). */
export function assistantPose(state: GameState, now: number): AssistantPose {
  const jobs = state.staff?.jobs ?? [];
  // The latest hang job that has started: she's on it, or heading back from it.
  let job: HangJob | undefined;
  for (const j of jobs) if (j.start <= now && (!job || j.start >= job.start)) job = j;
  if (job) {
    const p = hangJobPose(job, now);
    if (p) return p;
    // Done: walk back into her routine, unless the next piece is already waiting.
    const back = routinePose(state, now);
    const dur = Math.max(0.2, Math.min(AUTO_HANG.returnHours * 3, walkHours(job.at, back)));
    if (now < job.end + dur) return walking(job.at, back, (now - job.end) / dur, now - job.end);
  }
  return routinePose(state, now);
}

/** Her pose during a hang job, or null once it's over. */
function hangJobPose(j: HangJob, now: number): AssistantPose | null {
  if (now < j.pickupAt) return walking(j.from, j.door, (now - j.start) / Math.max(1e-6, j.pickupAt - j.start), now - j.start);
  if (now < j.carryAt) return { ...j.door, anim: 'clipboard', faceLeft: false, local: now - j.pickupAt };
  if (now < j.arriveAt) return { ...walking(j.door, j.at, (now - j.carryAt) / Math.max(1e-6, j.arriveAt - j.carryAt), now - j.carryAt), carrying: j.artworkId };
  if (now < j.hangAt) return { ...j.at, anim: 'point', faceLeft: j.faceLeft, local: now - j.arriveAt };
  if (now < j.end) return { ...j.at, anim: 'cheer', faceLeft: j.faceLeft, local: now - j.hangAt };
  return null;
}

/** Her everyday routine: dusting, greeting, clipboard rounds, and the night watch. */
export function routinePose(state: GameState, now: number): AssistantPose {
  const floor = state.floor;
  const hourOfDay = now - Math.floor(now / TIME.ticksPerDay) * TIME.ticksPerDay;
  // Night shift: she keeps watch by the door, checking in on the radio now and then.
  if (isNight(Math.floor(hourOfDay))) {
    const at = doorPost(floor);
    return { ...at, anim: hash01(`marisol-n${Math.floor(now)}`) < 0.3 ? 'radio' : 'idle', faceLeft: false, local: now };
  }
  const n = Math.floor(now / SHIFT);
  const prev = jobFor(state, n - 1);
  const job = jobFor(state, n);
  const t = now - n * SHIFT;
  const dist = Math.hypot(job.at.x - prev.at.x, job.at.y - prev.at.y);
  const walk = Math.min(SHIFT * 0.6, dist / GUESTS.walkTilesPerHour);
  if (t < walk) {
    const k = t / walk;
    return {
      x: prev.at.x + (job.at.x - prev.at.x) * k,
      y: prev.at.y + (job.at.y - prev.at.y) * k,
      anim: 'walk',
      faceLeft: job.at.x - prev.at.x - (job.at.y - prev.at.y) < 0,
      local: t,
    };
  }
  // A short pause before getting to work.
  const pause = 0.15;
  if (t - walk < pause) return { ...job.at, anim: 'idle', faceLeft: job.faceLeft, local: t - walk };
  return { ...job.at, anim: job.anim, faceLeft: job.faceLeft, local: t - walk - pause, span: SHIFT - walk - pause };
}
