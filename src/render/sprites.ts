// Character sprite atlases, produced by tools/slice_sprites.py from art/source/.
// Each atlas has one row per animation; every cell is the same size with the
// character's feet on the bottom edge, facing right.
import meta from '../assets/sprites/sprites.json';

export interface SpriteMeta {
  cell: [number, number];
  /**
   * The atlas height drawn at the standard figure height, when it isn't the
   * cell's. Set for sheets whose cell is stretched by a tall pose, so every
   * pose keeps the standing scale.
   */
  ref?: number;
  /** Animation name (a GuestAnim for visitors; the assistant has her own) -> atlas row and frame count. */
  anims: Record<string, [row: number, frames: number]>;
}

export const SPRITES = meta as unknown as Record<string, SpriteMeta>;

const urls = import.meta.glob('../assets/sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (file: string) => urls[`../assets/sprites/${file}.png`];

/** On-screen pixels per atlas pixel: a cell's height (or `ref`) draws 68px tall. */
export const spriteScale = (meta: SpriteMeta) => 68 / (meta.ref ?? meta.cell[1]);

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

/** Clothes and hair hue shifts for the public; skin is left alone. Index 0 = the original. */
const VARIANT_HUE = [0, 75, 150, 215, 290];
const variants = new Map<string, HTMLCanvasElement | HTMLImageElement>();

/**
 * Skin, hair and shadow: every warm tone at any brightness, plus near-black.
 * Only clothes in other colours get recoloured, so darker skin never turns blue or green.
 */
function isSkin(h: number, s: number, v: number) {
  return v < 0.22 || ((h <= 55 || h >= 340) && s >= 0.1);
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max / 255];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * A character sheet recoloured for a member of the public, so the crowd is
 * varied and never mistaken for the named guest. Built once, on first use,
 * after the atlas has loaded.
 */
export function crowdAtlas(name: string, variant: number): HTMLCanvasElement | HTMLImageElement | null {
  const base = atlas(name);
  if (!base.complete || !base.naturalWidth) return null;
  if (!variant) return base;
  const key = `${name}:${variant}`;
  const hit = variants.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = base.naturalWidth;
  c.height = base.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(base, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const shift = VARIANT_HUE[variant % VARIANT_HUE.length];
  const memo = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const rgb = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let out = memo.get(rgb);
    if (out === undefined) {
      const [h, s, v] = rgbToHsv(d[i], d[i + 1], d[i + 2]);
      if (s < 0.12 || isSkin(h, s, v)) out = rgb;
      else {
        const [r, g, b] = hsvToRgb((h + shift) % 360, Math.min(1, s * 1.05), v);
        out = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
      }
      memo.set(rgb, out);
    }
    d[i] = out >> 16;
    d[i + 1] = (out >> 8) & 255;
    d[i + 2] = out & 255;
  }
  ctx.putImageData(img, 0, 0);
  variants.set(key, c);
  return c;
}

export const portraitUrl = (name: string) => url(`${name}-portrait`);

/** Start loading every atlas up front so guests never pop in blank. */
export function preloadSprites() {
  for (const name of Object.keys(SPRITES)) atlas(name);
}
