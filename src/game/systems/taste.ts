import { GUESTS } from '../config';
import { clamp } from '../rng';
import type { Artist, Artwork, Guest, Reaction } from '../types';

/** Stable 0..1 from a string, so a guest always feels the same way about the same work. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** What a work is like: its artist's tags plus its own. */
export function workTags(work: Artwork | undefined, artist: Artist | undefined): string[] {
  const own = work?.tags ?? [];
  return [...(artist?.tags ?? []), ...own.filter((t) => !artist?.tags.includes(t))];
}

/** How much this guest likes this work, 0..1. Pure: no randomness beyond a stable per-pair hash. */
export function tasteScore(guest: Guest, work: Artwork, artist: Artist | undefined): number {
  let s = 0.42;
  for (const t of workTags(work, artist)) {
    if (guest.likes.includes(t)) s += 0.16;
    if (guest.dislikes.includes(t)) s -= 0.2;
  }
  if (guest.traits.includes('fame-chaser')) s += ((artist?.fame ?? 0) - 40) / 200;
  if (guest.traits.includes('hard-to-please')) s -= 0.08;
  s += (hash01(guest.id + work.id) - 0.5) * 0.18;
  return clamp(s, 0, 1);
}

export function reactionFor(score: number): Reaction {
  if (score >= GUESTS.impressedAt) return 'impressed';
  if (score >= GUESTS.thinkAt) return 'think';
  return 'disapprove';
}

export function moodOf(score: number): 'love' | 'meh' | 'hate' {
  return score >= GUESTS.impressedAt ? 'love' : score >= GUESTS.thinkAt ? 'meh' : 'hate';
}

/** Readable names for tags in the UI. */
export const TAG_LABEL: Record<string, string> = {
  painting: 'painting',
  portrait: 'portraits',
  figurative: 'figures',
  moody: 'moody work',
  classic: 'classic craft',
  sculpture: 'sculpture',
  industrial: 'industrial',
  experimental: 'experimental',
  rough: 'raw materials',
  digital: 'digital',
  colorful: 'bold colour',
  pop: 'pop',
  trendy: 'what’s trending',
  landscape: 'landscapes',
  quiet: 'quiet work',
  installation: 'installation',
  minimal: 'minimalism',
  prestige: 'big names',
  geometric: 'geometry',
  retro: 'retro style',
  print: 'prints',
  weird: 'the weird stuff',
  illustration: 'illustration',
  fantasy: 'fantasy',
  organic: 'organic forms',
  ceramic: 'ceramics',
  textile: 'fibre art',
  toy: 'designer toys',
  americana: 'Americana',
};
