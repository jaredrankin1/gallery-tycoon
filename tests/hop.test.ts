import { describe, expect, it } from 'vitest';
import { HOP, hopsFor, popHop, walkHop } from '../src/render/hop';

describe('paper-cutout hopping', () => {
  it('takes whole hops, at least one', () => {
    expect(hopsFor(0)).toBe(1);
    expect(hopsFor(HOP.length * 5)).toBe(5);
    expect(hopsFor(HOP.length * 5.3)).toBe(5);
  });

  it('starts and ends a walk on the floor, airborne mid-hop', () => {
    const d = HOP.length * 4;
    expect(walkHop(d, 0).lift).toBeCloseTo(0);
    expect(walkHop(d, 1).lift).toBeCloseTo(0);
    expect(walkHop(d, 0.125).lift).toBeCloseTo(HOP.height);
    // between hops (k = 0.25 is the end of hop 1) the feet touch down
    expect(walkHop(d, 0.25).lift).toBeLessThan(0.5);
  });

  it('rocks side to side on alternate hops', () => {
    const d = HOP.length * 4;
    expect(Math.sign(walkHop(d, 0.125).tilt)).toBe(-Math.sign(walkHop(d, 0.375).tilt));
  });

  it('squashes only near the floor', () => {
    const d = HOP.length * 2;
    expect(walkHop(d, 0.01).sy).toBeLessThan(1);
    expect(walkHop(d, 0.25).sy).toBeCloseTo(1);
  });

  it('pops into a new pose then stands still', () => {
    expect(popHop(HOP.popTime / 2).lift).toBeGreaterThan(0);
    expect(popHop(HOP.popTime * 2)).toEqual({ lift: 0, tilt: 0, sx: 1, sy: 1 });
  });
});
