// Isometric math. Everything else in the renderer goes through these.
// Grid (x, y) -> screen: x goes down-right, y goes down-left. 2:1 diamonds.

export const TILE_W = 64;
export const TILE_H = 32;
export const WALL_H = 84;

export interface Pt {
  x: number;
  y: number;
}

/** Screen position of grid corner (gx, gy) at height z, before camera transform. */
export function toScreen(gx: number, gy: number, z = 0): Pt {
  return { x: ((gx - gy) * TILE_W) / 2, y: ((gx + gy) * TILE_H) / 2 - z };
}

/** Inverse of toScreen at z = 0. Returns fractional grid coordinates. */
export function toGrid(sx: number, sy: number): Pt {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

/** Pixel bounds of a width x height room including walls, in unscaled screen space. */
export function roomBounds(width: number, height: number) {
  const left = toScreen(0, height).x;
  const right = toScreen(width, 0).x;
  const top = toScreen(0, 0, WALL_H).y;
  const bottom = toScreen(width, height).y;
  return { left, right, top, bottom, w: right - left, h: bottom - top };
}

/** Stable hue from an id, so each artwork keeps its look. */
export function hueOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) % 360;
}
