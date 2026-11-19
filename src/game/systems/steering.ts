import type { FloorPlan } from '../types';
import { blockedTiles, hitsFurniture } from './paths';

// Personal space. Visits are planned as routes; this keeps people from
// walking through each other on the way. Each person follows their planned
// spot on a short leash, while nearby people push them apart, and anyone
// walking sidesteps to pass on their right instead of shoving through.
// Purely visual: it never changes the game state, so saves and tests don't
// depend on frame rate.

export interface Walker {
  key: string;
  /** Where the plan says they are now. */
  x: number;
  y: number;
  /** Walking (true) or standing at something. */
  moving: boolean;
}

export const STEER = {
  /** Comfortable distance between two people, in tiles. */
  space: 0.62,
  /** How hard they're pulled back to their plan, per game hour. */
  follow: 4,
  /** How fast personal space pushes them apart, tiles per game hour. */
  push: 6,
  /** Further than this from the plan (a jump in time, a reload) and they just appear there. */
  snap: 2,
};

export class Steering {
  private pos = new Map<string, { x: number; y: number }>();
  /** Last frame's planned spot, so people keep moving with their plan rather than lagging behind it. */
  private plan = new Map<string, { x: number; y: number }>();
  private blocked = new Set<string>();
  private floorRef: FloorPlan | null = null;

  /** Where each person is drawn, after making room for each other. `dt` is game hours since the last call. */
  step(walkers: Walker[], dt: number, floor: FloorPlan): Map<string, { x: number; y: number }> {
    if (floor !== this.floorRef) {
      this.floorRef = floor;
      this.blocked = blockedTiles(floor);
    }
    dt = Math.min(dt, 0.08);
    const live = new Set(walkers.map((w) => w.key));
    for (const k of this.pos.keys()) if (!live.has(k)) this.pos.delete(k);
    for (const k of this.plan.keys()) if (!live.has(k)) this.plan.delete(k);

    const cur = walkers.map((w) => {
      let p = this.pos.get(w.key);
      if (!p || Math.hypot(p.x - w.x, p.y - w.y) > STEER.snap) p = { x: w.x, y: w.y };
      return p;
    });
    // How far the plan moved them since last frame, and so which way they're heading.
    const vel = walkers.map((w) => {
      const before = this.plan.get(w.key) ?? w;
      return { x: w.x - before.x, y: w.y - before.y };
    });
    const head = vel.map((v) => {
      const d = Math.hypot(v.x, v.y);
      return d > 1e-6 ? { x: v.x / d, y: v.y / d } : null;
    });

    const push = walkers.map(() => ({ x: 0, y: 0 }));
    const R = STEER.space;
    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) {
        let dx = cur[i].x - cur[j].x;
        let dy = cur[i].y - cur[j].y;
        let d = Math.hypot(dx, dy);
        if (d >= R) continue;
        if (d < 1e-3) {
          // Exactly on top of each other: split along a stable direction.
          const a = (hash(walkers[i].key) - hash(walkers[j].key)) * Math.PI;
          dx = Math.cos(a);
          dy = Math.sin(a);
          d = 1e-3;
        }
        const k = (R - d) / R;
        const nx = dx / d;
        const ny = dy / d;
        // Standing people hold their ground more; walkers do most of the giving way.
        const wi = walkers[i].moving ? 1 : 0.35;
        const wj = walkers[j].moving ? 1 : 0.35;
        const share = wi / (wi + wj);
        push[i].x += nx * k * share * 2;
        push[i].y += ny * k * share * 2;
        push[j].x -= nx * k * (1 - share) * 2;
        push[j].y -= ny * k * (1 - share) * 2;
        // Walking into someone: step to your right and go round.
        for (const [a, b, s] of [[i, j, share], [j, i, 1 - share]] as const) {
          const h = head[a];
          if (!walkers[a].moving || !h) continue;
          const toOther = { x: cur[b].x - cur[a].x, y: cur[b].y - cur[a].y };
          if (toOther.x * h.x + toOther.y * h.y <= 0) continue; // they're behind us
          push[a].x += -h.y * k * s * 1.6;
          push[a].y += h.x * k * s * 1.6;
        }
      }
    }

    const out = new Map<string, { x: number; y: number }>();
    const pull = Math.min(1, dt * STEER.follow);
    walkers.forEach((w, i) => {
      const p = cur[i];
      this.plan.set(w.key, { x: w.x, y: w.y });
      const bx = p.x + vel[i].x;
      const by = p.y + vel[i].y;
      let nx = bx + (w.x - bx) * pull + push[i].x * STEER.push * dt;
      let ny = by + (w.y - by) * pull + push[i].y * STEER.push * dt;
      // Don't get shoved into furniture or through walls.
      if (hitsFurniture(this.blocked, { x: nx, y: ny }) && !hitsFurniture(this.blocked, w)) {
        if (!hitsFurniture(this.blocked, { x: nx, y: p.y })) ny = p.y;
        else if (!hitsFurniture(this.blocked, { x: p.x, y: ny })) nx = p.x;
        else {
          nx = bx + (w.x - bx) * pull;
          ny = by + (w.y - by) * pull;
        }
      }
      nx = Math.max(0.25, Math.min(floor.width - 0.25, nx));
      ny = Math.max(0.25, Math.min(floor.height - 0.25, ny));
      const q = { x: nx, y: ny };
      this.pos.set(w.key, q);
      out.set(w.key, q);
    });
    return out;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
