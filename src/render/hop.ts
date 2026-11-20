// Paper-cutout motion. People are flat cardboard figures, like an old
// cut-paper cartoon: nobody walks, they hop. Each hop covers a fixed stretch
// of floor, so faster walkers hop more often rather than further, and a
// stretch of walking always ends with both feet on the ground.
// Pure maths (no canvas) so it can be tested.

export const HOP = {
  /** Floor covered by one hop, in tiles. At 1x a game hour is 1.6s, so this is about five hops a second. */
  length: 0.8,
  /** Height of a walking hop, in screen pixels. */
  height: 6,
  /** Sway either side of upright while hopping, in radians. */
  tilt: 0.09,
  /** How much a figure squashes on landing (0 = rigid card). */
  squash: 0.08,
  /** A pose change starts with a little hop of this height... */
  popHeight: 4,
  /** ...lasting this long, in game hours. */
  popTime: 0.1,
  /** Talking: the figure bobs this many pixels... */
  chatBob: 1.2,
  /** ...this many times per game hour. */
  chatRate: 6,
};

export interface HopPose {
  /** Pixels above the floor. */
  lift: number;
  /** Rotation about the feet, radians. */
  tilt: number;
  /** Horizontal and vertical stretch (squash on landing). */
  sx: number;
  sy: number;
}

const still: HopPose = { lift: 0, tilt: 0, sx: 1, sy: 1 };

/** How many hops a walk of `dist` tiles takes: whole hops, at least one. */
export const hopsFor = (dist: number) => Math.max(1, Math.round(dist / HOP.length));

/**
 * One hop at `phase` (0..1 through it): up and down on a half sine, leaning
 * into it, with a quick squash just as the feet hit the floor.
 */
export function hopAt(phase: number, height: number, lean: number): HopPose {
  const p = Math.min(1, Math.max(0, phase));
  const lift = Math.sin(p * Math.PI) * height;
  // Squash in the last and first slivers of the hop, when the card is on the floor.
  const ground = p < 0.12 ? 1 - p / 0.12 : p > 0.88 ? (p - 0.88) / 0.12 : 0;
  const k = HOP.squash * ground * (height / HOP.height);
  return { lift, tilt: lean * Math.sin(p * Math.PI), sx: 1 + k, sy: 1 - k };
}

/**
 * The hop for someone walking `dist` tiles, `k` (0..1) of the way along.
 * Alternate hops lean opposite ways, so the card rocks side to side.
 */
export function walkHop(dist: number, k: number): HopPose {
  const n = hopsFor(dist);
  const t = Math.min(1, Math.max(0, k)) * n;
  const i = Math.min(n - 1, Math.floor(t));
  const lean = i % 2 ? -HOP.tilt : HOP.tilt;
  return hopAt(t - i, HOP.height, lean);
}

/** A small hop as someone strikes a new pose; flat on the floor after it. */
export function popHop(local: number): HopPose {
  if (local >= HOP.popTime || local < 0) return still;
  return hopAt(local / HOP.popTime, HOP.popHeight, 0);
}

/** Talking: a little bounce in place, like a cut-out mouth flapping. */
export function chatBob(local: number): HopPose {
  const lift = Math.abs(Math.sin(local * HOP.chatRate * Math.PI)) * HOP.chatBob;
  return { lift, tilt: 0, sx: 1, sy: 1 };
}
