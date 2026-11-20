// Flat paper-cutout figures. One still pose per action, cut out of the
// character sheet with a white paper edge, and moved by hopping (see hop.ts)
// instead of frame-by-frame animation. Visitors use this. Any character can:
// call drawCutout with their atlas and pose, so artists or staff can be drawn
// the same way if wanted.
import type { GuestAnim } from '../game';
import { chatBob, popHop, walkHop, type HopPose } from './hop';
import { crowdAtlas, spriteScale, SPRITES, type SpriteMeta } from './sprites';

/** Paper edge, in atlas pixels. */
const EDGE = 3;
const PAD = EDGE + 3;

const cards = new Map<string, HTMLCanvasElement>();

/**
 * A single frame of a character sheet as a paper card: the figure with a
 * white cut edge round it and a thin shadow where the card lifts off the
 * page. Built once per pose and colour variant.
 */
export function cutoutCard(sprite: string, variant: number, row: number, frame: number): HTMLCanvasElement | null {
  const meta = SPRITES[sprite];
  const src = meta && crowdAtlas(sprite, variant);
  if (!meta || !src) return null;
  const key = `${sprite}:${variant}:${row}:${frame}`;
  const hit = cards.get(key);
  if (hit) return hit;
  const [cw, ch] = meta.cell;
  const w = cw + PAD * 2;
  const h = ch + PAD * 2;

  // The figure's silhouette, filled flat.
  const sil = document.createElement('canvas');
  sil.width = w;
  sil.height = h;
  const s = sil.getContext('2d')!;
  s.drawImage(src, frame * cw, row * ch, cw, ch, PAD, PAD, cw, ch);
  s.globalCompositeOperation = 'source-in';

  const card = document.createElement('canvas');
  card.width = w;
  card.height = h;
  const c = card.getContext('2d')!;
  // Card thickness: a soft dark edge just below and right of the cut.
  s.fillStyle = 'rgba(40,30,20,0.35)';
  s.fillRect(0, 0, w, h);
  stamp(c, sil, EDGE, 1, 1.5);
  // The white paper margin round the figure.
  s.fillStyle = '#fbf8f1';
  s.fillRect(0, 0, w, h);
  stamp(c, sil, EDGE, 0, 0);
  c.drawImage(src, frame * cw, row * ch, cw, ch, PAD, PAD, cw, ch);
  cards.set(key, card);
  return card;
}

/** Draws `img` around a ring of radius r, which grows its silhouette by r. */
function stamp(c: CanvasRenderingContext2D, img: HTMLCanvasElement, r: number, dx: number, dy: number) {
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    c.drawImage(img, Math.cos(a) * r + dx, Math.sin(a) * r + dy);
  }
}

/** Which still frame of an animation stands in for it as a cutout pose. */
export function posedFrame(anim: string, frames: number): number {
  if (anim === 'walk' || anim === 'idle' || anim === 'chat' || anim === 'look') return 0;
  // The camera raised (and the flash) is frame 2 of the photo sheet.
  if (anim === 'photo') return Math.min(2, frames - 1);
  // Reactions: the held, final pose.
  return frames - 1;
}

/** The atlas row and frame a cutout shows for an action. Walking shows the standing pose. */
export function cutoutPose(meta: SpriteMeta, anim: GuestAnim | string): { row: number; frame: number } {
  const shown = anim === 'walk' ? 'idle' : anim;
  const [row, frames] = meta.anims[shown] ?? meta.anims.idle;
  return { row, frame: posedFrame(shown, frames) };
}

/** How a cutout moves for this action: hopping when walking, a pop into a new pose, a bob when talking. */
export function cutoutMotion(anim: string, local: number, dist: number, k: number): HopPose {
  if (anim === 'walk') return walkHop(dist, k);
  if (anim === 'chat') return chatBob(local);
  return popHop(local);
}

export interface CutoutDraw {
  sprite: string;
  variant: number;
  anim: GuestAnim | string;
  /** Feet position on screen (unscaled room space). */
  at: { x: number; y: number };
  faceLeft: boolean;
  motion: HopPose;
}

/**
 * Draws a cutout figure standing at `at`: its shadow on the floor (smaller
 * while it's in the air), then the card, lifted, leaning and squashed by its
 * hop. Returns the drawn height in pixels, or 0 if the sheet isn't loaded yet.
 */
export function drawCutout(ctx: CanvasRenderingContext2D, d: CutoutDraw): number {
  const meta = SPRITES[d.sprite];
  if (!meta) return 0;
  const { row, frame } = cutoutPose(meta, d.anim);
  const card = cutoutCard(d.sprite, d.variant, row, frame);
  const m = d.motion;
  const air = Math.min(1, m.lift / 10);
  ctx.fillStyle = `rgba(0,0,0,${0.22 - air * 0.08})`;
  ctx.beginPath();
  ctx.ellipse(d.at.x, d.at.y, 11 * (1 - air * 0.3), 5 * (1 - air * 0.3), 0, 0, Math.PI * 2);
  ctx.fill();
  if (!card) return 0;
  const scale = spriteScale(meta);
  const [cw, ch] = meta.cell;
  ctx.save();
  ctx.translate(d.at.x, d.at.y + 2 - m.lift);
  ctx.rotate(d.faceLeft ? -m.tilt : m.tilt);
  ctx.scale((d.faceLeft ? -1 : 1) * m.sx, m.sy);
  ctx.drawImage(card, (-cw * scale) / 2 - PAD * scale, -ch * scale - PAD * scale, card.width * scale, card.height * scale);
  ctx.restore();
  return ch * scale;
}
