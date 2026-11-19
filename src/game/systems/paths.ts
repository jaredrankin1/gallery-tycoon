import type { FloorPlan } from '../types';
import { hash01 } from './taste';

// Walking routes across the floor. People go around furniture rather than
// through it, and don't all follow the same straight line from the door.

export type Pt = { x: number; y: number };

/** Tiles nobody can walk through: everything on the floor except wall art. */
export function blockedTiles(floor: FloorPlan): Set<string> {
  const s = new Set<string>();
  for (const f of floor.fixtures) if (f.kind !== 'wallHang') s.add(`${f.x},${f.y}`);
  return s;
}

const tileOf = (p: Pt) => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

/** True when a person's body (about 0.2 tiles wide) at p overlaps a blocked tile. */
export function hitsFurniture(blocked: Set<string>, p: Pt, r = 0.18): boolean {
  for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    if (blocked.has(`${Math.floor(p.x + dx)},${Math.floor(p.y + dy)}`)) return true;
  }
  return false;
}

/** Can someone walk straight from a to b without touching furniture? Ends are allowed to touch (stand spots hug pedestals). */
function clearLine(blocked: Set<string>, a: Pt, b: Pt, skip: Set<string>): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / 0.1));
  for (let i = 1; i < n; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
    const t = `${Math.floor(p.x)},${Math.floor(p.y)}`;
    if (skip.has(t)) continue;
    if (hitsFurniture(blocked, p)) return false;
  }
  return true;
}

/**
 * Waypoints from `from` to `to` (excluding `from`, ending at `to`) that go
 * around furniture. `key` makes each person's path a little their own.
 */
export function route(floor: FloorPlan, from: Pt, to: Pt, key: string, blocked = blockedTiles(floor)): Pt[] {
  const a = tileOf(from);
  const b = tileOf(to);
  // Whatever tile they start or end on is fair game, even if it hugs a fixture.
  const skip = new Set([`${a.x},${a.y}`, `${b.x},${b.y}`]);
  if (clearLine(blocked, from, to, skip)) return [to];

  // A* over tiles, 8-way, no squeezing diagonally between two blocked tiles.
  const W = floor.width;
  const H = floor.height;
  const id = (x: number, y: number) => y * W + x;
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (!blocked.has(`${x},${y}`) || skip.has(`${x},${y}`));
  const g = new Map<number, number>([[id(a.x, a.y), 0]]);
  const came = new Map<number, number>();
  const open: { n: number; f: number }[] = [{ n: id(a.x, a.y), f: 0 }];
  const done = new Set<number>();
  const goal = id(b.x, b.y);
  while (open.length) {
    open.sort((p, q) => p.f - q.f);
    const cur = open.shift()!.n;
    if (cur === goal) break;
    if (done.has(cur)) continue;
    done.add(cur);
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!free(nx, ny)) continue;
      if (dx && dy && (!free(cx + dx, cy) || !free(cx, cy + dy))) continue;
      const n = id(nx, ny);
      const cost = g.get(cur)! + (dx && dy ? 1.414 : 1);
      if (cost >= (g.get(n) ?? Infinity)) continue;
      g.set(n, cost);
      came.set(n, cur);
      open.push({ n, f: cost + Math.hypot(b.x - nx, b.y - ny) });
    }
  }
  if (!came.has(goal)) return [to]; // boxed in: just go

  const tiles: number[] = [];
  for (let n = came.get(goal)!; n !== id(a.x, a.y); n = came.get(n)!) tiles.unshift(n);
  // Tile centres, nudged so two people don't trace the exact same line.
  const pts = tiles.map((n, i) => {
    const j = (s: string) => (hash01(key + i + s) - 0.5) * 0.36;
    return { x: (n % W) + 0.5 + j('x'), y: Math.floor(n / W) + 0.5 + j('y') };
  });
  pts.push(to);
  // Pull the string tight: skip any corner we can see past.
  const out: Pt[] = [];
  let here = from;
  let i = 0;
  while (i < pts.length) {
    let k = pts.length - 1;
    while (k > i && !clearLine(blocked, here, pts[k], skip)) k--;
    out.push(pts[k]);
    here = pts[k];
    i = k + 1;
  }
  return out;
}

/** A random open spot to drift towards between works, away from walls and furniture. */
export function browseSpot(floor: FloorPlan, key: string, blocked = blockedTiles(floor)): Pt | null {
  for (let tries = 0; tries < 6; tries++) {
    const p = {
      x: 1.3 + hash01(key + 'bx' + tries) * (floor.width - 2.3),
      y: 1.3 + hash01(key + 'by' + tries) * (floor.height - 2.3),
    };
    if (!hitsFurniture(blocked, p, 0.3)) return p;
  }
  return null;
}
