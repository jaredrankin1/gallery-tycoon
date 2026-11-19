import { ARTIST_SEEDS } from '../data/artists';
import type { GameState } from './types';

const KEY = 'agt.save.v4';

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode, preview): play on without saving */
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== 4) return null; // add migrations here when the shape changes
    // Artists added since this save was made join the scene as strangers.
    for (const seed of ARTIST_SEEDS) {
      parsed.artists[seed.id] ??= { ...seed, relationship: seed.relationship ?? 0, lastContactDay: parsed.day };
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
