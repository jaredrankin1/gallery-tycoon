import { describe, expect, it } from 'vitest';
import { FORM, JAZZ, Jazz } from '../src/audio/jazz';

describe('jazz loop', () => {
  it('is a 32-bar tune whose chords fill whole bars', () => {
    const beats = FORM.reduce((s, c) => s + c.beats, 0);
    expect(beats).toBe(32 * 4);
    let pos = 0;
    for (const c of FORM) {
      // a two-beat chord never straddles a bar line
      expect(Math.floor(pos / 4)).toBe(Math.floor((pos + c.beats - 1) / 4));
      pos += c.beats;
    }
    expect(Jazz.loopSeconds()).toBeCloseTo((128 * 60) / JAZZ.bpm);
  });
});
