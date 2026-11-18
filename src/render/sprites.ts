// Character sprite atlases, produced by tools/slice_sprites.py from art/source/.
// Each atlas has one row per animation; every cell is the same size with the
// character's feet on the bottom edge, facing right.
import meta from '../assets/sprites/sprites.json';
import type { GuestAnim } from '../game';

export interface SpriteMeta {
  cell: [number, number];
  anims: Record<GuestAnim, [row: number, frames: number]>;
}

export const SPRITES = meta as unknown as Record<string, SpriteMeta>;

const urls = import.meta.glob('../assets/sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (file: string) => urls[`../assets/sprites/${file}.png`];

const cache = new Map<string, HTMLImageElement>();

/** The atlas image for a character; may still be loading (check .complete). */
export function atlas(name: string): HTMLImageElement {
  let img = cache.get(name);
  if (!img) {
    img = new Image();
    img.src = url(name);
    cache.set(name, img);
  }
  return img;
}

export const portraitUrl = (name: string) => url(`${name}-portrait`);

/** Start loading every atlas up front so guests never pop in blank. */
export function preloadSprites() {
  for (const name of Object.keys(SPRITES)) atlas(name);
}
