import { RULES } from '../config';
import { clamp } from '../rng';
import type { Artist, GameState, Id } from '../types';

/** Applies a relationship change scaled by the artist's temperament. Returns the actual delta. */
export function adjustRelationship(state: GameState, artistId: Id, rawDelta: number): number {
  const artist = state.artists[artistId];
  if (!artist) return 0;
  const before = artist.relationship;
  artist.relationship = clamp(before + rawDelta * artist.temperament, -100, 100);
  artist.lastContactWeek = state.week;
  return Math.round(artist.relationship - before);
}

export function relationshipLabel(r: number): string {
  if (r <= -50) return 'Hostile';
  if (r < -10) return 'Cold';
  if (r < 10) return 'Stranger';
  if (r < 35) return 'Acquaintance';
  if (r < 65) return 'Friend';
  return 'Devoted';
}

/** Discount artists give to people they like, 0..0.15. */
export function friendDiscount(artist: Artist): number {
  return clamp(artist.relationship / 100, 0, 1) * 0.15;
}

/** Fair value for a new work by this artist, before randomness. */
export function baseWorkValue(artist: Artist): number {
  return 2_000 + Math.pow(artist.fame, 1.6) * 60;
}

/** Weekly drift: neglect cools relationships, fame drifts with exposure. */
export function tickArtists(state: GameState, notes: string[]): void {
  for (const artist of Object.values(state.artists)) {
    const quietWeeks = state.week - artist.lastContactWeek;
    if (quietWeeks > RULES.neglectAfterWeeks && artist.relationship > 0) {
      const before = artist.relationship;
      artist.relationship = Math.max(0, artist.relationship - artist.temperament);
      if (Math.floor(before / 10) !== Math.floor(artist.relationship / 10)) {
        notes.push(`${artist.name} feels a little forgotten.`);
      }
    }
    const onDisplay = Object.values(state.artworks).filter(
      (w) => w.artistId === artist.id && w.status === 'display',
    ).length;
    if (onDisplay > 0) artist.fame = clamp(artist.fame + 0.1 * onDisplay * (state.reputation / 50), 0, 100);
  }
}
