import { describe, expect, it } from 'vitest';
import { whisper } from '../src/audio/whisper';

describe('gallery whispers', () => {
  it('makes a clean, quiet-edged snippet', () => {
    const sr = 16000;
    for (let seed = 1; seed <= 20; seed++) {
      const w = whisper(sr, seed);
      let peak = 0;
      let energy = 0;
      let finite = true;
      for (const x of w) {
        finite &&= Number.isFinite(x);
        peak = Math.max(peak, Math.abs(x));
        energy += x * x;
      }
      expect(finite).toBe(true);
      expect(peak).toBeLessThanOrEqual(0.91);
      expect(energy / w.length).toBeGreaterThan(0.001);
      // Starts and ends in silence, so it never clicks.
      expect(Math.abs(w[0])).toBeLessThan(0.01);
      expect(Math.abs(w[w.length - 1])).toBeLessThan(0.01);
      // A breath, not a speech: a few seconds at most.
      expect(w.length / sr).toBeLessThan(5);
    }
  });

  it('varies a lot from snippet to snippet', () => {
    const lengths = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) lengths.add(Math.round((whisper(16000, seed).length / 16000) * 10));
    // Lengths spread across many tenths of a second, from "hm" to a sentence.
    expect(lengths.size).toBeGreaterThan(8);
  });

  it('has no voice pitch (no groaning buzz)', () => {
    // A voiced murmur repeats every pitch period (5 to 12 ms); breath doesn't.
    const sr = 16000;
    const w = whisper(sr, 5);
    let zero = 0;
    for (const x of w) zero += x * x;
    let best = 0;
    for (let lag = Math.floor(sr / 250); lag <= Math.floor(sr / 80); lag++) {
      let c = 0;
      for (let i = 0; i + lag < w.length; i++) c += w[i] * w[i + lag];
      best = Math.max(best, c / zero);
    }
    expect(best).toBeLessThan(0.3);
  });

  it('is the same every time for a seed', () => {
    expect(whisper(8000, 9)).toEqual(whisper(8000, 9));
  });
});
