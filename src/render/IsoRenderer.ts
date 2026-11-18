import {
  canPlace,
  poseAt,
  shortName,
  TIME,
  visitTimeline,
  type Fixture,
  type FixtureKind,
  type GameState,
  type GuestVisit,
  type Segment,
} from '../game';
import { atlas, preloadSprites, SPRITES } from './sprites';
import { hueOf, roomBounds, TILE_W, toGrid, toScreen, WALL_H, type Pt } from './iso';

export interface Theme {
  floorA: string;
  floorB: string;
  wallLeft: string;
  wallRight: string;
  wallTop: string;
  bg: string;
}

export const THEMES: Record<GameState['venue'], Theme> = {
  gallery: { floorA: '#d9c3a0', floorB: '#cfb790', wallLeft: '#f3efe8', wallRight: '#e4ded4', wallTop: '#bdb5a8', bg: '#1d1a17' },
  museum: { floorA: '#d7d7d2', floorB: '#c9c9c3', wallLeft: '#ece6da', wallRight: '#dcd4c6', wallTop: '#a89f90', bg: '#17191c' },
};

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
}

export interface Highlight {
  x: number;
  y: number;
  ok: boolean;
}

/**
 * Draws the venue floor on a canvas and turns taps into tile coordinates.
 * It only reads GameState; it never changes it. Guests are drawn from their
 * visit timelines, so they stay in step with the clock at any speed.
 */
export class IsoRenderer {
  private ctx: CanvasRenderingContext2D;
  private state: GameState | null = null;
  /** Cached choreography per visit (keyed by guest + start). */
  private timelines = new Map<string, Segment[]>();
  /** Where each guest was drawn last frame, in canvas pixels, for tapping. */
  private guestHits: { id: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  private selectedGuest: string | null = null;
  /** Absolute game time (hours, fractional), supplied by the UI each frame. */
  private clock: () => number = () => 0;
  private highlight: Highlight | null = null;
  private buildKind: FixtureKind | null = null;
  private hover: Pt | null = null;
  private floaters: Floater[] = [];
  private selected: Pt | null = null;
  private pan: Pt = { x: 0, y: 0 };
  private scale = 1;
  private origin: Pt = { x: 0, y: 0 };
  private raf = 0;
  private last = 0;
  private drag: { start: Pt; pan: Pt; moved: boolean } | null = null;
  private ro: ResizeObserver;
  /** Fractions of the canvas height covered by HUD (top) and dock (bottom). */
  private insets = { top: 0.17, bottom: 0.11 };

  constructor(
    private canvas: HTMLCanvasElement,
    private onTileTap: (x: number, y: number) => void,
    private onGuestTap: (guestId: string) => void = () => {},
  ) {
    this.ctx = canvas.getContext('2d')!;
    preloadSprites();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', () => (this.drag = null));
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
  }

  setState(state: GameState) {
    const first = !this.state || this.state.floor.width !== state.floor.width;
    this.state = state;
    if (first) this.pan = { x: 0, y: 0 };
    const live = new Set(state.visits.map((v) => `${v.guestId}@${v.start}`));
    for (const k of this.timelines.keys()) if (!live.has(k)) this.timelines.delete(k);
    this.layout();
  }

  setSelected(tile: Pt | null) {
    this.selected = tile;
  }

  /** Screen fractions kept clear of the room (HUD on top, dock or dialogs below). */
  setInsets(top: number, bottom: number) {
    if (top === this.insets.top && bottom === this.insets.bottom) return;
    this.insets = { top, bottom };
    this.pan = { x: 0, y: 0 };
    this.layout();
  }

  setSelectedGuest(id: string | null) {
    this.selectedGuest = id;
  }

  /** Where the game clock is right now, in absolute hours (see absHour). */
  setClock(fn: () => number) {
    this.clock = fn;
  }

  setHighlight(h: Highlight | null) {
    this.highlight = h;
  }

  /** In build mode, legal tiles are tinted and a ghost follows the pointer. */
  setBuildKind(kind: FixtureKind | null) {
    this.buildKind = kind;
  }

  /** Floating "+$12,400" style label rising from a tile. */
  pop(x: number, y: number, text: string, color = '#f2c14e') {
    this.floaters.push({ x: x + 0.5, y: y + 0.5, text, color, age: 0 });
  }

  /** Is a party on? Event guests are in the building. */
  private partyNow(): boolean {
    return !!this.state?.visits.some((v) => v.event);
  }

  // ---- layout & input ------------------------------------------------------

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout();
  }

  private layout() {
    if (!this.state) return;
    const { width, height } = this.state.floor;
    const b = roomBounds(width, height);
    const cw = this.canvas.clientWidth;
    const fullH = this.canvas.clientHeight;
    const top = fullH * this.insets.top;
    const ch = fullH * (1 - this.insets.top - this.insets.bottom);
    this.scale = Math.min(cw / (b.w + 16), ch / (b.h + 16));
    this.origin = {
      x: cw / 2 - (b.left + b.w / 2) * this.scale,
      y: top + ch / 2 - (b.top + b.h / 2) * this.scale,
    };
  }

  private local(e: PointerEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { start: this.local(e), pan: { ...this.pan }, moved: false };
  };

  private onMove = (e: PointerEvent) => {
    if (this.buildKind) {
      const p = this.local(e);
      const g = this.gridAt(p);
      this.hover = g;
    }
    if (!this.drag) return;
    const p = this.local(e);
    const dx = p.x - this.drag.start.x;
    const dy = p.y - this.drag.start.y;
    if (Math.hypot(dx, dy) > 6) this.drag.moved = true;
    if (this.drag.moved) {
      const lim = 120;
      this.pan = {
        x: Math.max(-lim, Math.min(lim, this.drag.pan.x + dx)),
        y: Math.max(-lim, Math.min(lim, this.drag.pan.y + dy)),
      };
    }
  };

  private onUp = (e: PointerEvent) => {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.moved || !this.state) return;
    const p = this.local(e);
    // People first: front-most (last drawn) wins.
    for (let i = this.guestHits.length - 1; i >= 0; i--) {
      const h = this.guestHits[i];
      if (p.x >= h.x0 && p.x <= h.x1 && p.y >= h.y0 && p.y <= h.y1) return this.onGuestTap(h.id);
    }
    const g = this.gridAt(p);
    if (g) this.onTileTap(g.x, g.y);
  };

  private gridAt(p: Pt): Pt | null {
    if (!this.state) return null;
    const sx = (p.x - this.origin.x - this.pan.x) / this.scale;
    const sy = (p.y - this.origin.y - this.pan.y) / this.scale;
    const g = toGrid(sx, sy);
    const x = Math.floor(g.x);
    const y = Math.floor(g.y);
    const { width, height } = this.state.floor;
    if (x >= 0 && y >= 0 && x < width && y < height) return { x, y };
    // Not on the floor: maybe on a back wall. Tapping a painting selects the tile it hangs over.
    const half = TILE_W / 2;
    if (sx < 0) {
      const gy = -sx / half;
      const floorY = toScreen(0, gy).y;
      if (gy >= 0 && gy < height && sy <= floorY && sy >= floorY - WALL_H) return { x: 0, y: Math.floor(gy) };
    } else {
      const gx = sx / half;
      const floorY = toScreen(gx, 0).y;
      if (gx >= 0 && gx < width && sy <= floorY && sy >= floorY - WALL_H) return { x: Math.floor(gx), y: 0 };
    }
    return null;
  }

  // ---- drawing -------------------------------------------------------------

  private frame = (t: number) => {
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0);
    this.last = t;
    if (this.state) {
      for (const f of this.floaters) f.age += dt;
      this.floaters = this.floaters.filter((f) => f.age < 1.8);
      this.draw(t);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw(t: number) {
    const s = this.state!;
    const ctx = this.ctx;
    const theme = THEMES[s.venue];
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    ctx.save();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.translate(this.origin.x + this.pan.x, this.origin.y + this.pan.y);
    ctx.scale(this.scale, this.scale);

    this.drawWalls(theme);
    this.drawFloor(theme);

    // Wall art sits on the wall plane, behind everything on the floor.
    for (const f of s.floor.fixtures) if (f.kind === 'wallHang') this.drawWallHang(f);

    // Depth-sort floor objects and people by x + y.
    type Drawable = { depth: number; draw: () => void };
    const items: Drawable[] = [];
    for (const f of s.floor.fixtures) {
      if (f.kind !== 'wallHang') items.push({ depth: f.x + f.y + 1, draw: () => this.drawFixture(f) });
    }
    const now = this.clock();
    this.guestHits = [];
    for (const v of s.visits) {
      if (now < v.start || now >= v.end) continue;
      const pose = poseAt(this.timeline(v), now);
      if (pose) items.push({ depth: pose.x + pose.y, draw: () => this.drawGuest(v, pose, t) });
    }
    items.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());

    if (this.buildKind && this.hover) this.drawGhost(this.buildKind, this.hover);

    for (const f of this.floaters) {
      const p = toScreen(f.x, f.y, 50 + f.age * 40);
      ctx.globalAlpha = Math.max(0, 1 - f.age / 1.8);
      ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,16,12,0.85)';
      ctx.strokeText(f.text, p.x, p.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Evening light: warm dim as the day closes, warmer during a party.
    const dusk = Math.max(0, (s.tick - (TIME.ticksPerDay - 5)) / 5);
    if (dusk > 0) {
      ctx.fillStyle = this.partyNow() ? `rgba(70, 30, 60, ${0.22 * dusk})` : `rgba(20, 24, 60, ${0.28 * dusk})`;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  private poly(pts: Pt[], fill: string, stroke?: string) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawWalls(theme: Theme) {
    const { width, height } = this.state!.floor;
    // Left wall along x = 0, right wall along y = 0.
    this.poly([toScreen(0, height), toScreen(0, 0), toScreen(0, 0, WALL_H), toScreen(0, height, WALL_H)], theme.wallLeft);
    this.poly([toScreen(0, 0), toScreen(width, 0), toScreen(width, 0, WALL_H), toScreen(0, 0, WALL_H)], theme.wallRight);
    const ctx = this.ctx;
    ctx.strokeStyle = theme.wallTop;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const a = toScreen(0, height, WALL_H);
    const b = toScreen(0, 0, WALL_H);
    const c = toScreen(width, 0, WALL_H);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }

  private drawFloor(theme: Theme) {
    const { width, height, entrance } = this.state!.floor;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pts = [toScreen(x, y), toScreen(x + 1, y), toScreen(x + 1, y + 1), toScreen(x, y + 1)];
        this.poly(pts, (x + y) % 2 ? theme.floorA : theme.floorB);
        if (x === entrance.x && y === entrance.y) this.poly(pts, 'rgba(160, 40, 40, 0.55)');
        const sel = this.selected;
        if (sel && sel.x === x && sel.y === y) this.poly(pts, 'rgba(255, 210, 80, 0.45)', '#f2b705');
        const h = this.highlight;
        if (h && h.x === x && h.y === y) this.poly(pts, h.ok ? 'rgba(80, 200, 120, 0.45)' : 'rgba(220, 60, 60, 0.45)');
        if (this.buildKind && !canPlace(this.state!.floor, this.buildKind, x, y)) this.poly(pts, 'rgba(90, 200, 140, 0.16)');
      }
    }
  }

  /** A framed picture on the back wall above tile (f.x, f.y). */
  private drawWallHang(f: Fixture) {
    const onLeft = f.x === 0;
    const a = onLeft ? toScreen(0, f.y + 0.18) : toScreen(f.x + 0.18, 0);
    const b = onLeft ? toScreen(0, f.y + 0.82) : toScreen(f.x + 0.82, 0);
    const lo = 22;
    const hi = 66;
    const quad = (inset: number) => [
      { x: a.x + (b.x - a.x) * inset, y: a.y + (b.y - a.y) * inset - lo - inset * 20 },
      { x: b.x - (b.x - a.x) * inset, y: b.y - (b.y - a.y) * inset - lo - inset * 20 },
      { x: b.x - (b.x - a.x) * inset, y: b.y - (b.y - a.y) * inset - hi + inset * 20 },
      { x: a.x + (b.x - a.x) * inset, y: a.y + (b.y - a.y) * inset - hi + inset * 20 },
    ];
    if (!f.artworkId) {
      const ctx = this.ctx;
      ctx.setLineDash([4, 4]);
      this.poly(quad(0), 'rgba(0,0,0,0.03)', 'rgba(0,0,0,0.25)');
      ctx.setLineDash([]);
      return;
    }
    const hue = hueOf(f.artworkId);
    this.poly(quad(0), '#b08d57', '#6e5530');
    this.poly(quad(0.1), `hsl(${hue} 45% 55%)`);
    this.poly(quad(0.3), `hsl(${(hue + 140) % 360} 55% 40%)`);
  }

  private box(x: number, y: number, h: number, top: string, left: string, right: string, inset = 0.15) {
    const x0 = x + inset;
    const y0 = y + inset;
    const x1 = x + 1 - inset;
    const y1 = y + 1 - inset;
    const z = h;
    this.poly([toScreen(x0, y1), toScreen(x1, y1), toScreen(x1, y1, z), toScreen(x0, y1, z)], left);
    this.poly([toScreen(x1, y0), toScreen(x1, y1), toScreen(x1, y1, z), toScreen(x1, y0, z)], right);
    this.poly([toScreen(x0, y0, z), toScreen(x1, y0, z), toScreen(x1, y1, z), toScreen(x0, y1, z)], top);
  }

  private drawFixture(f: Fixture) {
    const ctx = this.ctx;
    switch (f.kind) {
      case 'pedestal': {
        this.box(f.x, f.y, 26, '#ffffff', '#dcdcdc', '#c4c4c4', 0.25);
        if (f.artworkId) {
          const hue = hueOf(f.artworkId);
          const c = toScreen(f.x + 0.5, f.y + 0.5, 26);
          ctx.fillStyle = `hsl(${hue} 50% 45%)`;
          ctx.beginPath();
          ctx.ellipse(c.x, c.y - 12, 7, 13, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `hsl(${(hue + 60) % 360} 60% 60%)`;
          ctx.beginPath();
          ctx.arc(c.x + 2, c.y - 20, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      case 'bar': {
        this.box(f.x, f.y, 22, '#5a3b22', '#7a5233', '#6a4529', 0.08);
        const c = toScreen(f.x + 0.5, f.y + 0.5, 22);
        // Wine bottles and a cheese wedge.
        for (const [dx, col] of [[-10, '#5b1a2a'], [-4, '#2f4a2b'], [2, '#5b1a2a']] as const) {
          ctx.fillStyle = col;
          ctx.fillRect(c.x + dx, c.y - 14, 4, 12);
          ctx.fillRect(c.x + dx + 1, c.y - 18, 2, 4);
        }
        ctx.fillStyle = '#f2c94c';
        ctx.beginPath();
        ctx.moveTo(c.x + 8, c.y - 2);
        ctx.lineTo(c.x + 18, c.y - 2);
        ctx.lineTo(c.x + 8, c.y - 9);
        ctx.fill();
        return;
      }
      case 'bench':
        this.box(f.x, f.y, 9, '#6b4f3a', '#4e392a', '#433024', 0.2);
        return;
      case 'plant': {
        this.box(f.x, f.y, 10, '#8b5e3c', '#a0522d', '#7a3f22', 0.36);
        const c = toScreen(f.x + 0.5, f.y + 0.5, 10);
        ctx.fillStyle = '#3f7d4e';
        for (const [dx, dy, r] of [[0, -12, 9], [-6, -6, 7], [6, -7, 7]]) {
          ctx.beginPath();
          ctx.arc(c.x + dx, c.y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      case 'wallHang':
        return;
    }
  }

  private drawGhost(kind: FixtureKind, at: Pt) {
    const ok = !canPlace(this.state!.floor, kind, at.x, at.y);
    this.ctx.globalAlpha = 0.55;
    if (kind === 'wallHang') this.drawWallHang({ id: 'ghost', kind, x: at.x, y: at.y });
    else this.drawFixture({ id: 'ghost', kind, x: at.x, y: at.y });
    this.ctx.globalAlpha = 1;
    const pts = [toScreen(at.x, at.y), toScreen(at.x + 1, at.y), toScreen(at.x + 1, at.y + 1), toScreen(at.x, at.y + 1)];
    this.poly(pts, ok ? 'rgba(80, 200, 120, 0.35)' : 'rgba(220, 60, 60, 0.35)');
  }

  private timeline(v: GuestVisit): Segment[] {
    const key = `${v.guestId}@${v.start}`;
    let segs = this.timelines.get(key);
    if (!segs) {
      segs = visitTimeline(v, this.state!.floor, v.event ? v.end : undefined);
      this.timelines.set(key, segs);
    }
    return segs;
  }

  /** One guest: sprite frame, shadow, mood bubble, and a name tag when selected. */
  private drawGuest(v: GuestVisit, pose: NonNullable<ReturnType<typeof poseAt>>, t: number) {
    const s = this.state!;
    const g = s.guests[v.guestId];
    const meta = g && SPRITES[g.sprite];
    if (!meta) return;
    const img = atlas(g.sprite);
    const ctx = this.ctx;
    const { seg, local } = pose;
    const [row, frames] = meta.anims[seg.anim];
    const dur = seg.end - seg.start;
    // Loops for walking, idling and chatting; one-shot (hold last frame) for reactions.
    const looping = seg.anim === 'walk' || seg.anim === 'idle' || seg.anim === 'chat';
    const perHour = seg.anim === 'walk' ? 15 : 6;
    const frame = looping ? Math.floor(local * perHour) % frames : Math.min(frames - 1, Math.floor((local / Math.max(0.01, dur)) * frames));

    const [cw, ch] = meta.cell;
    const scale = 68 / ch;
    const p = toScreen(pose.x, pose.y);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (img.complete && img.naturalWidth) {
      ctx.save();
      ctx.translate(p.x, p.y + 2);
      if (seg.faceLeft) ctx.scale(-1, 1);
      ctx.drawImage(img, frame * cw, row * ch, cw, ch, (-cw * scale) / 2, -ch * scale, cw * scale, ch * scale);
      ctx.restore();
    }

    // Hit box in canvas pixels.
    const sx = this.origin.x + this.pan.x;
    const sy = this.origin.y + this.pan.y;
    const k = this.scale;
    this.guestHits.push({
      id: g.id,
      x0: sx + (p.x - (cw * scale) / 2) * k,
      x1: sx + (p.x + (cw * scale) / 2) * k,
      y0: sy + (p.y - ch * scale) * k,
      y1: sy + (p.y + 4) * k,
    });

    // Mood bubble while reacting.
    const top = p.y - ch * scale - 6;
    const bubble =
      seg.anim === 'impressed' ? { text: '♥', color: '#e2557a' } : seg.anim === 'think' ? { text: '…', color: '#8a7f73' } : seg.anim === 'disapprove' ? { text: '✕', color: '#b5483f' } : null;
    if (bubble) {
      const bob = Math.sin(t / 160) * 1.5;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(p.x + 10, top - 4 + bob, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bubble.color;
      ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bubble.text, p.x + 10, top - 3.5 + bob);
      ctx.textBaseline = 'alphabetic';
    }
    if (seg.anim === 'photo' && frame === 2) {
      ctx.fillStyle = 'rgba(255,255,240,0.5)';
      ctx.beginPath();
      ctx.arc(p.x + (seg.faceLeft ? -8 : 8), p.y - ch * scale * 0.8, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.selectedGuest === g.id) {
      const label = shortName(g);
      ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(224,170,69,0.95)';
      ctx.beginPath();
      ctx.roundRect(p.x - w / 2, top - 22, w, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#1d1508';
      ctx.fillText(label, p.x, top - 12);
    }
  }

}

