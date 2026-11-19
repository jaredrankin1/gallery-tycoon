import { ARTIST_SEEDS } from '../data/artists';
import { CAREER } from './config';
import { clamp, Rng } from './rng';
import { baseWorkValue } from './systems/careers';
import { newArtist } from './state';
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
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Brings an older save up to date, or returns null if it's too old to read. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate(s: any): GameState | null {
  if (s?.version === 4) {
    // v5: artist careers, patronage and exhibitions.
    const rng = new Rng((s.rng ?? 1) ^ 0x5eed);
    for (const a of Object.values(s.artists) as any[]) {
      const [lo, hi] = CAREER.potentialRoll;
      a.potential ??= Math.round(clamp(a.fame + rng.range(lo, hi), 5, 98));
      a.studioVisits ??= 0;
      a.form ??= 50;
      a.fameLastWeek ??= a.fame;
    }
    for (const w of Object.values(s.artworks) as any[]) {
      const a = s.artists[w.artistId];
      w.grade ??= a ? Math.round((w.value / baseWorkValue(a)) * 100) / 100 : 1;
    }
    s.exhibition ??= null;
    s.exhibitionHistory ??= [];
    s.version = 5;
  }
  if (s?.version !== 5) return null;
  // Artists added since this save was made join the scene as strangers.
  const rng = new Rng((s.rng ?? 1) ^ 0xa27);
  for (const seed of ARTIST_SEEDS) s.artists[seed.id] ??= { ...newArtist(seed, rng), lastContactDay: s.day };
  // Saves from before auto-hang: Marisol takes it on, leaving what's already there alone.
  s.staff ??= {
    autoHang: true,
    seen: Object.values(s.artworks as GameState['artworks']).filter((w) => w.status === 'storage' || w.status === 'display').map((w) => w.id),
    parked: [],
    jobs: [],
  };
  s.staff.parked ??= [];
  return s as GameState;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
