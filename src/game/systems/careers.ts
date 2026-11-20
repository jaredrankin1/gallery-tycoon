import { CAREER, CAREER_STAGES } from '../config';
import { clamp, type Rng } from '../rng';
import type { Artist, Artwork, GameState, Id } from '../types';
import { notify } from './feed';

// Artist careers. Fame moves with shows, sales and press, and drifts toward each
// artist's hidden potential. Every work's value follows its artist's fame, so a
// piece bought from an unknown can become the most valuable thing you own.

export function stageIndex(fame: number): number {
  let i = 0;
  CAREER_STAGES.forEach((s, k) => {
    if (fame >= s.min) i = k;
  });
  return i;
}

export const careerStage = (fame: number) => CAREER_STAGES[stageIndex(fame)].label;

/** Going rate for an average work by this artist. */
export function baseWorkValue(artist: Pick<Artist, 'fame'>): number {
  return 2_000 + Math.pow(artist.fame, 1.6) * 60;
}

/** What a particular work is worth right now. */
export function workValue(artist: Artist | undefined, work: Pick<Artwork, 'grade'>): number {
  if (!artist) return 0;
  return Math.round((baseWorkValue(artist) * work.grade) / 50) * 50;
}

/** Brings the value of every unsold work by this artist in line with their fame. */
export function revalueWorks(state: GameState, artistId: Id): void {
  const artist = state.artists[artistId];
  for (const w of Object.values(state.artworks)) {
    if (w.artistId === artistId && w.status !== 'sold') w.value = workValue(artist, w);
  }
}

/** Potential as a 1..5 star rating, for the scouting report. */
export const potentialStars = (potential: number) => clamp(Math.round(potential / 20 + 0.5), 1, 5);

export const isScouted = (artist: Artist) => artist.studioVisits >= CAREER.visitsToScout;

/**
 * Changes an artist's fame, revalues their work, and tells the player when they
 * move up or down a career stage. Returns the actual change.
 */
export function addFame(state: GameState, artistId: Id, delta: number, why?: string): number {
  const artist = state.artists[artistId];
  if (!artist || !delta) return 0;
  const before = artist.fame;
  artist.fame = clamp(before + delta, 0, 100);
  const from = stageIndex(before);
  const to = stageIndex(artist.fame);
  revalueWorks(state, artistId);
  if (to !== from) {
    const first = artist.name.split(' ')[0];
    const owned = Object.values(state.artworks).filter((w) => w.artistId === artistId && (w.status === 'storage' || w.status === 'display')).length;
    const label = CAREER_STAGES[to].label;
    const rest = owned ? (to > from ? ` The ${owned} work${owned > 1 ? 's' : ''} you own just went up.` : ` Your ${owned} work${owned > 1 ? 's' : ''} by them lost value.`) : '';
    notify(state, {
      kind: to > from ? 'artist' : 'warn',
      text: `${first} is now ${/^[AEIOU]/.test(label) ? 'an' : 'a'} ${label.toLowerCase()} artist${why ? ` (${why})` : ''}.${rest}`,
    });
  }
  return artist.fame - before;
}

/** Daily career drift: toward potential, with the odd breakout or flop. */
export function endOfDayCareers(state: GameState, rng: Rng): void {
  for (const artist of Object.values(state.artists)) {
    const first = artist.name.split(' ')[0];
    const rate = CAREER.driftToPotential * (artist.patron ? 2 : 1);
    addFame(state, artist.id, (artist.potential - artist.fame) * rate);

    const gap = artist.potential - artist.fame;
    if (gap > CAREER.breakoutGap && rng.chance(CAREER.breakoutChance * (artist.patron ? 2 : 1))) {
      notify(state, { kind: 'artist', text: `Breakout! ${first}’s new series has everyone talking.` });
      addFame(state, artist.id, CAREER.breakoutFame, 'breakout');
    } else if (gap < -10 && rng.chance(CAREER.flopChance)) {
      notify(state, { kind: 'warn', text: `${first}’s latest series flopped. The hype is cooling.` });
      addFame(state, artist.id, -CAREER.flopFame);
    }

    if ((state.day - 1) % 7 === 6) artist.fameLastWeek = artist.fame;
  }
}
