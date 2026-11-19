import { MOODS } from '../config';
import { clamp, type Rng } from '../rng';
import type { Artist, Artwork, Guest, GuestVisit, Mood, MoodAxis, VenueType } from '../types';
import type { Segment } from './visits';
import { hash01 } from './taste';

// Every visitor carries five moods, each -1 .. 1 between two poles. They
// start somewhere personal, then each work they see nudges them, and so do
// crowds. Moods are planned with the visit, so they are deterministic and the
// screen can show exactly how someone feels at any moment.

export const MOOD_AXES: MoodAxis[] = ['happy', 'amused', 'inspired', 'enlightened', 'covetous'];

/** [low pole, high pole] for each axis. */
export const MOOD_POLES: Record<MoodAxis, [string, string]> = {
  happy: ['Sad', 'Happy'],
  amused: ['Bored', 'Amused'],
  inspired: ['Blasé', 'Inspired'],
  enlightened: ['Baffled', 'Enlightened'],
  covetous: ['Browsing', 'Covetous'],
};

export const ZERO_MOOD: Mood = { happy: 0, amused: 0, inspired: 0, enlightened: 0, covetous: 0 };

export function addMood(a: Mood, b: Mood | undefined): Mood {
  if (!b) return a;
  const out = { ...a };
  for (const k of MOOD_AXES) out[k] = clamp(a[k] + b[k], -1, 1);
  return out;
}

/** Who someone is, as far as moods care. All 0..1. */
export interface Persona {
  /** Art literacy: how much challenge they can take before they're lost. */
  savvy: number;
  /** How readily they reach for their wallet. */
  wealth: number;
  /** How well they put up with crowds and repetition. */
  patience: number;
}

/** A stranger off the street. */
export function randomPersona(rng: Rng): Persona {
  return { savvy: rng.range(0.1, 0.8), wealth: Math.pow(rng.next(), 1.6), patience: rng.range(0.2, 1) };
}

/** Named guests' personas follow from who they are. */
export function guestPersona(g: Pick<Guest, 'id' | 'role' | 'budget' | 'traits'>): Persona {
  const savvy = { critic: 0.88, collector: 0.68, student: 0.55, influencer: 0.32, regular: 0.42 }[g.role] ?? 0.4;
  const wealth = clamp(g.budget / 60_000, 0, 1);
  const patience = clamp(0.35 + hash01(g.id + 'patience') * 0.5 - (g.traits.includes('hard-to-please') ? 0.2 : 0), 0.1, 1);
  return { savvy, wealth, patience };
}

/** How they feel walking in. */
export function startMood(p: Persona, rng: Rng, event = false): Mood {
  return {
    happy: rng.range(-0.25, 0.4) + (event ? 0.2 : 0),
    amused: rng.range(-0.05, 0.25),
    inspired: rng.range(-0.25, 0.2),
    enlightened: (p.savvy - 0.45) * 0.6,
    covetous: -0.6 + p.wealth * 0.5,
  };
}

// Tags that make a work harder or easier to "get".
const HARD: Record<string, number> = { experimental: 0.25, installation: 0.2, minimal: 0.2, weird: 0.15, geometric: 0.1, rough: 0.12, industrial: 0.1, digital: 0.05 };
const EASY: Record<string, number> = { landscape: 0.15, portrait: 0.12, pop: 0.15, colorful: 0.1, illustration: 0.12, classic: 0.08, fantasy: 0.08, retro: 0.06 };
// Tags that are just fun to look at.
const FUN = ['pop', 'weird', 'colorful', 'fantasy', 'digital', 'retro', 'installation'];

/** How demanding a work is, 0 (anyone gets it) .. 1 (good luck). */
export function challengeOf(work: Pick<Artwork, 'id' | 'tags'>, artist: Pick<Artist, 'tags'> | undefined): number {
  const tags = [...(artist?.tags ?? []), ...(work.tags ?? [])];
  let c = 0.4 + (hash01(work.id + 'challenge') - 0.5) * 0.2;
  for (const t of tags) c += (HARD[t] ?? 0) - (EASY[t] ?? 0);
  return clamp(c, 0, 1);
}

export interface Encounter {
  /** Taste match 0..1 (tasteScore). */
  score: number;
  challenge: number;
  /** Artist fame 0..100. */
  fame: number;
  tags: string[];
  /** Same artist as the work they just saw. */
  repeat: boolean;
  /** Others already at this work. */
  crowd: number;
  /** Floor packed beyond MOODS.packedDensity, 0..1+. */
  packed: number;
  venue: VenueType;
  /** Gallery: could they plausibly afford it? 0..1. */
  affordable: number;
}

/** How one work changes someone's mood. */
export function encounterMood(p: Persona, e: Encounter): Mood {
  const like = e.score - 0.5;
  // Getting it: a little stretch is the sweet spot; far beyond them is baffling.
  const reach = p.savvy + 0.2 - e.challenge;
  const enlightened = clamp(reach * 1.1, -0.45, 0.4) * (0.6 + e.score * 0.6);
  const over = Math.max(0, e.crowd - p.patience * MOODS.crowdTolerance);
  const crowding = over * MOODS.crowdPenalty + Math.max(0, e.packed) * 0.12 * (1.2 - p.patience);
  const fun = e.tags.some((t) => FUN.includes(t)) ? 0.12 : 0;
  const amused = (e.repeat ? -0.16 : 0.07) + fun + (e.score < 0.38 ? -0.12 : 0) - (e.tags.includes('quiet') && p.savvy < 0.4 ? 0.08 : 0) - over * 0.04;
  const inspired = like * 0.9 + (e.fame / 100) * 0.12 + (enlightened > 0.1 ? 0.12 : enlightened < -0.2 ? -0.08 : 0) - crowding * 0.4;
  const want = e.venue === 'gallery' ? (e.score - 0.55) * (0.6 + p.wealth) * 1.1 + (e.affordable - 0.5) * 0.2 : (e.score - 0.55) * 0.5;
  return {
    happy: like * 0.7 - crowding,
    amused,
    inspired,
    enlightened,
    covetous: want,
  };
}

/** How someone feels at absolute time `now`: their mood walking in plus every work they've reacted to so far. */
export function moodAt(v: Pick<GuestVisit, 'mood' | 'steps'>, segs: Segment[], now: number): Mood {
  let m = v.mood ?? ZERO_MOOD;
  v.steps.forEach((s, i) => {
    const react = segs.find((g) => g.step === i && g.anim !== 'look' && g.anim !== 'walk');
    if (react && now >= react.start) m = addMood(m, s.mood);
  });
  return m;
}

/** Their mood on the way out. */
export function finalMood(v: Pick<GuestVisit, 'mood' | 'steps'>): Mood {
  return v.steps.reduce((m, s) => addMood(m, s.mood), v.mood ?? ZERO_MOOD);
}

/** One word for the strongest feeling, e.g. "Baffled". */
export function moodWord(m: Mood): string {
  // Just browsing is the default state of a museum-goer, not worth a headline.
  const strength = (k: MoodAxis) => (k === 'covetous' && m[k] < 0 ? 0 : Math.abs(m[k]));
  let best: MoodAxis = 'happy';
  for (const k of MOOD_AXES) if (strength(k) > strength(best)) best = k;
  if (Math.abs(m[best]) < 0.15) return 'Content';
  return MOOD_POLES[best][m[best] > 0 ? 1 : 0];
}
