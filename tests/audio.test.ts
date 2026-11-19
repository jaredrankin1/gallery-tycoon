import { describe, expect, it } from 'vitest';
import { babble } from '../src/audio/babble';

describe('crowd chatter', () => {
  it('makes a clean, loopable stereo murmur', () => {
    const sr = 8000;
    const [l, r] = babble(sr, 4, 5, 3);
    expect(l.length).toBe(sr * 4);
    expect(r.length).toBe(l.length);
    let peak = 0;
    let energy = 0;
    for (let i = 0; i < l.length; i++) {
      expect(Number.isFinite(l[i]) && Number.isFinite(r[i])).toBe(true);
      peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
      energy += l[i] * l[i];
    }
    expect(peak).toBeLessThanOrEqual(0.91);
    expect(energy / l.length).toBeGreaterThan(0.002);
    // The loop point doesn't click: end and start are close.
    expect(Math.abs(l[l.length - 1] - l[0])).toBeLessThan(0.2);
  });

  it('is the same every time for a seed', () => {
    expect(babble(8000, 1, 2, 9)[0]).toEqual(babble(8000, 1, 2, 9)[0]);
  });
});
