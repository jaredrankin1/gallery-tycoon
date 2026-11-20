import {
  assistantPose,
  callTimeline,
  shownOnFixture,
  canPlace,
  poseAt,
  shortName,
  staffPoses,
  Steering,
  TIME,
  visitTimeline,
  type AssistantPose,
  type Fixture,
  type FixtureKind,
  type GameState,
  type ArtistCall,
  type GuestVisit,
  type Segment,
  type StaffPose,
} from '../game';
import { crowdAtlas, preloadSprites, spriteScale, SPRITES } from './sprites';
import { cutoutMotion, drawCutout } from './cutout';
import { paintingImage, preloadPaintings } from './paintings';

/** How far past the screen's width the room may be drawn (1 = fits exactly). */
const ROOM_OVERFLOW = 1.14;

/** Sculpture sprites are cut at this many times their size on the floor (for sharp zoom). */
const SCULPTURE_SCALE = 2.8;
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
  gallery: { floorA: '#d9c3a0', floorB: '#cfb790', wallLeft: '#f3efe8', wallRight: '#e4ded4', wallTop: '#bdb5a8', bg: '#1f4e9e' },
  museum: { floorA: '#d7d7d2', floorB: '#c9c9c3', wallLeft: '#ece6da', wallRight: '#dcd4c6', wallTop: '#a89f90', bg: '#1c1c1c' },
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
  /** The visiting artist's walk, rebuilt when their visit changes stage. */
  private callSegs: { key: string; segs: Segment[] } | null = null;
  /** Where each guest was drawn last frame, in canvas pixels, for tapping. */
  private guestHits: { id: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  private selectedGuest: string | null = null;
  /** Absolute game time (hours, fractional), supplied by the UI each frame. */
  private clock: () => number = () => 0;
  /** Tells the HUD how many people are on the floor right now. */
  private onCount: (n: number) => void = () => {};
  private lastCount = -1;
  private onSfx: (kind: 'door' | 'shutter') => void = () => {};
  /** Visits and photo flashes already heard, so each makes its sound once. */
  private heard = new Set<string>();
  private guestCount = 0;
  /** Personal space: where people actually stand after making room for each other. */
  private steering = new Steering();
  private lastNow: number | null = null;
  /** Real-time ms until which the assistant is cheering. */
  private cheerUntil = 0;
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
    preloadPaintings();
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

  setOnCount(fn: (n: number) => void) {
    this.onCount = fn;
  }

  /** Sounds tied to what's on screen: a named guest coming in, a camera flash. */
  setOnSfx(fn: (kind: 'door' | 'shutter') => void) {
    this.onSfx = fn;
  }

  /** How many people are on the floor, and whether a party is on, for the sound. */
  ambience() {
    return { count: Math.max(0, this.lastCount), party: this.partyNow() };
  }

  private once(key: string) {
    if (this.heard.has(key)) return false;
    if (this.heard.size > 600) this.heard.clear();
    this.heard.add(key);
    return true;
  }

  /** Where the game clock is right now, in absolute hours (see absHour). */
  setClock(fn: () => number) {
    this.clock = fn;
  }

  setHighlight(h: Highlight | null) {
    this.highlight = h;
  }

  /**
   * Bauhaus poster behind the room: a flat colour field with a few big primary shapes.
   * Fixed to the screen (it doesn't pan), so the room reads as an object on a poster.
   */
  private drawBackdrop(theme: Theme, cw: number, ch: number) {
    const ctx = this.ctx;
    const u = cw / 100;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.save();
    ctx.globalAlpha = 0.9;
    // big red disc, upper right
    ctx.fillStyle = '#d7301f';
    ctx.beginPath();
    ctx.arc(cw - 8 * u, ch * 0.3, 34 * u, 0, Math.PI * 2);
    ctx.fill();
    // yellow quarter disc, lower left
    ctx.fillStyle = '#f4b400';
    ctx.beginPath();
    ctx.moveTo(0, ch * 0.86);
    ctx.arc(0, ch * 0.86, 44 * u, -Math.PI / 2, 0);
    ctx.closePath();
    ctx.fill();
    // black bars and a thin rule, like a type block on a poster
    ctx.fillStyle = '#121212';
    ctx.fillRect(6 * u, ch * 0.22, 3.2 * u, ch * 0.5);
    ctx.fillRect(6 * u, ch * 0.72, 38 * u, 3.2 * u);
    ctx.fillRect(62 * u, ch * 0.7, 32 * u, 0.9 * u);
    // off-white triangle, far right
    ctx.fillStyle = '#f2ede2';
    ctx.beginPath();
    ctx.moveTo(cw, ch * 0.62);
    ctx.lineTo(cw, ch * 0.84);
    ctx.lineTo(cw - 20 * u, ch * 0.84);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** In build mode, legal tiles are tinted and a ghost follows the pointer. */
  setBuildKind(kind: FixtureKind | null) {
    this.buildKind = kind;
  }

  /** Floating "+$12,400" style label rising from a tile. */
  pop(x: number, y: number, text: string, color = '#f4b400') {
    this.floaters.push({ x: x + 0.5, y: y + 0.5, text, color, age: 0 });
    // Marisol celebrates every sale.
    this.cheerUntil = performance.now() + 1800;
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
    // Fill the screen: the room may run a little past the sides (the far wall
    // ends; drag to see them) rather than float small with empty space above.
    this.scale = Math.min((cw * ROOM_OVERFLOW) / b.w, ch / (b.h + 16));
    // Any spare height goes mostly below the room, not above it.
    const spare = Math.max(0, ch - b.h * this.scale);
    this.origin = {
      x: cw / 2 - (b.left + b.w / 2) * this.scale,
      y: top + spare * 0.3 - b.top * this.scale,
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
    this.drawBackdrop(theme, cw, ch);
    ctx.translate(this.origin.x + this.pan.x, this.origin.y + this.pan.y);
    ctx.scale(this.scale, this.scale);

    this.drawWalls(theme);
    this.drawFloor(theme);

    const now = this.clock();
    // While Marisol is on her way with a new piece, its spot still shows what was there.
    const shown: Fixture[] = [];
    for (const f of s.floor.fixtures) {
      const art = shownOnFixture(s, f, now);
      if (art === 'hidden') continue;
      shown.push(art === (f.artworkId ?? null) ? f : art ? { ...f, artworkId: art } : { id: f.id, kind: f.kind, x: f.x, y: f.y });
    }

    // Wall art sits on the wall plane, behind everything on the floor.
    for (const f of shown) if (f.kind === 'wallHang') this.drawWallHang(f);

    // Depth-sort floor objects and people by x + y.
    type Drawable = { depth: number; draw: () => void };
    const items: Drawable[] = [];
    for (const f of shown) {
      if (f.kind !== 'wallHang') items.push({ depth: f.x + f.y + 1, draw: () => this.drawFixture(f) });
    }
    this.guestHits = [];
    this.guestCount = 0;
    const here: { v: GuestVisit; pose: NonNullable<ReturnType<typeof poseAt>>; key: string }[] = [];
    for (const v of s.visits) {
      if (now < v.start || now >= v.end) continue;
      this.guestCount++;
      // The door bell rings for the regulars and named characters, not every stranger.
      if (!v.look && !v.event && now - v.start < 0.3 && this.once(`in:${v.guestId}@${v.start}`)) this.onSfx('door');
      const pose = poseAt(this.timeline(v), now);
      if (pose) here.push({ v, pose, key: `${v.guestId}@${v.start}` });
    }
    // Make room: nobody walks through anybody.
    const dt = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow);
    this.lastNow = now;
    const placed = this.steering.step(
      here.map(({ pose, key }) => ({ key, x: pose.x, y: pose.y, moving: pose.seg.anim === 'walk' })),
      dt,
      s.floor,
    );
    for (const { v, pose, key } of here) {
      const at = placed.get(key);
      const p = at ? { ...pose, x: at.x, y: at.y } : pose;
      items.push({ depth: p.x + p.y, draw: () => this.drawGuest(v, p, t) });
    }
    // A visiting artist: drawn like a guest but never counted (they're not a visitor), and tappable to talk.
    const caller = this.callerNow(now);
    if (caller) items.push({ depth: caller.pose.x + caller.pose.y, draw: () => this.drawCaller(caller.call, caller.pose, t) });
    const staff = assistantPose(s, now);
    if (performance.now() < this.cheerUntil && staff.anim !== 'walk') staff.anim = 'cheer';
    items.push({ depth: staff.x + staff.y, draw: () => this.drawAssistant(staff) });
    // Hired staff: guard, appraiser, curator, intern. Not visitors, so not counted.
    for (const p of staffPoses(s, now)) items.push({ depth: p.x + p.y, draw: () => this.drawStaff(p) });
    if (this.guestCount !== this.lastCount) {
      this.lastCount = this.guestCount;
      this.onCount(this.guestCount);
    }
    items.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());

    if (this.buildKind && this.hover) this.drawGhost(this.buildKind, this.hover);

    for (const f of this.floaters) {
      const p = toScreen(f.x, f.y, 50 + f.age * 40);
      ctx.globalAlpha = Math.max(0, 1 - f.age / 1.8);
      ctx.font = '700 15px Jost, Futura, "Century Gothic", ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,16,12,0.85)';
      ctx.strokeText(f.text, p.x, p.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Daylight: dims from late afternoon, dark overnight, back up at dawn. A party glows warmer.
    const hour = (((now % TIME.ticksPerDay) + TIME.ticksPerDay) % TIME.ticksPerDay) + TIME.openHour;
    const dusk = hour >= 17 ? Math.min(1, (hour - 17) / 4) : hour < 5 ? 1 : hour < 8 ? 1 - (hour - 5) / 3 : 0;
    if (dusk > 0) {
      ctx.fillStyle = this.partyNow() ? `rgba(70, 30, 60, ${0.22 * dusk})` : `rgba(14, 18, 52, ${0.42 * dusk})`;
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
    const pic = f.artworkId ? this.imageFor(f.artworkId) : null;
    // Landscape canvases get a wider, shorter frame, centred where a tall one would hang.
    const wide = !!pic && pic.width > pic.height;
    const m = wide ? 0.02 : 0.08;
    const a = onLeft ? toScreen(0, f.y + m) : toScreen(f.x + m, 0);
    const b = onLeft ? toScreen(0, f.y + 1 - m) : toScreen(f.x + 1 - m, 0);
    let lo = 18;
    let hi = 72;
    if (wide) {
      const h = Math.min(hi - lo, (Math.hypot(b.x - a.x, b.y - a.y) * pic.height) / pic.width + 4);
      lo = 45 - h / 2;
      hi = 45 + h / 2;
    }
    const lift = (hi - lo) * 0.37; // frame border, scaled with the frame
    const quad = (inset: number) => [
      { x: a.x + (b.x - a.x) * inset, y: a.y + (b.y - a.y) * inset - lo - inset * lift },
      { x: b.x - (b.x - a.x) * inset, y: b.y - (b.y - a.y) * inset - lo - inset * lift },
      { x: b.x - (b.x - a.x) * inset, y: b.y - (b.y - a.y) * inset - hi + inset * lift },
      { x: a.x + (b.x - a.x) * inset, y: a.y + (b.y - a.y) * inset - hi + inset * lift },
    ];
    if (!f.artworkId) {
      const ctx = this.ctx;
      ctx.setLineDash([4, 4]);
      this.poly(quad(0), 'rgba(0,0,0,0.03)', 'rgba(0,0,0,0.25)');
      ctx.setLineDash([]);
      return;
    }
    const work = this.state!.artworks[f.artworkId];
    if (work?.form === 'hanging') {
      const img = this.imageFor(f.artworkId);
      if (img) {
        this.drawHanging(img, a, b, onLeft);
        return;
      }
    }
    this.poly(quad(0), '#b08d57', '#6e5530');
    const img = this.imageFor(f.artworkId);
    if (img) {
      // Map the image onto the wall: u runs along the wall, v straight down.
      const q = quad(0.07);
      const ctx = this.ctx;
      ctx.save();
      ctx.transform((q[2].x - q[3].x) / img.width, (q[2].y - q[3].y) / img.width, (q[0].x - q[3].x) / img.height, (q[0].y - q[3].y) / img.height, q[3].x, q[3].y);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      // A little shade so the far wall reads as further away.
      if (!onLeft) this.poly(q, 'rgba(0,0,0,0.08)');
      return;
    }
    const hue = hueOf(f.artworkId);
    this.poly(quad(0.1), `hsl(${hue} 45% 55%)`);
    this.poly(quad(0.3), `hsl(${(hue + 140) % 360} 55% 40%)`);
  }

  /**
   * Fibre art on the wall: no frame, the piece itself hung flat against the
   * wall between a and b, as big as fits and centred where a painting would be.
   */
  private drawHanging(img: HTMLImageElement, a: Pt, b: Pt, onLeft: boolean) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const k = Math.min((len * 1.4) / img.width, 64 / img.height);
    const w = img.width * k;
    const h = img.height * k;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 45 };
    const ctx = this.ctx;
    ctx.save();
    // Soft shadow on the wall, then the piece. u runs along the wall, v straight down.
    ctx.transform(ux * k, uy * k, 0, k, mid.x - (ux * w) / 2, mid.y - (uy * w) / 2 - h / 2);
    ctx.filter = onLeft ? 'drop-shadow(1px 2px 1px rgba(0,0,0,0.35))' : 'drop-shadow(1px 2px 1px rgba(0,0,0,0.35)) brightness(0.93)';
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  /**
   * A sculpture sprite standing on its tile. The sprite brings its own plinth,
   * so it replaces the plain pedestal block.
   */
  private drawSculpture(img: HTMLImageElement, f: Fixture) {
    const ctx = this.ctx;
    const c = toScreen(f.x + 0.5, f.y + 0.5);
    const k = 1 / SCULPTURE_SCALE;
    const w = img.width * k;
    const h = img.height * k;
    const foot = c.y + 7; // the plinth's front edge, a little in front of the tile centre
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(c.x, foot - 3, w * 0.55, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(img, c.x - w / 2, foot - h, w, h);
  }

  /** The loaded image for a work, or null if it has none or it's still loading. */
  private imageFor(artworkId: string): HTMLImageElement | null {
    const key = this.state?.artworks[artworkId]?.image;
    const img = key ? paintingImage(key) : null;
    return img && img.complete && img.naturalWidth ? img : null;
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
        const img = f.artworkId ? this.imageFor(f.artworkId) : null;
        if (img && this.state!.artworks[f.artworkId!]?.form === 'sculpture') {
          this.drawSculpture(img, f);
          return;
        }
        this.box(f.x, f.y, 26, '#ffffff', '#dcdcdc', '#c4c4c4', 0.25);
        if (img) {
          // A painting on a pedestal sits on a small easel, facing you.
          const c = toScreen(f.x + 0.5, f.y + 0.5, 26);
          const h = 34;
          const w = (h * img.width) / img.height;
          ctx.strokeStyle = '#6e5530';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(c.x - w / 2, c.y);
          ctx.lineTo(c.x - 2, c.y - h - 2);
          ctx.moveTo(c.x + w / 2, c.y);
          ctx.lineTo(c.x + 2, c.y - h - 2);
          ctx.stroke();
          ctx.fillStyle = '#b08d57';
          ctx.fillRect(c.x - w / 2 - 1.5, c.y - h - 5.5, w + 3, h + 3);
          ctx.drawImage(img, c.x - w / 2, c.y - h - 4, w, h);
        } else if (f.artworkId) {
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
      case 'shop': {
        // A teal counter with a postcard rack, a stack of t-shirts and a till.
        this.box(f.x, f.y, 20, '#2f6f73', '#3b8589', '#255a5d', 0.06);
        const c = toScreen(f.x + 0.5, f.y + 0.5, 20);
        // Postcard rack: a little stand with rows of cards.
        ctx.fillStyle = '#5b4a3a';
        ctx.fillRect(c.x - 15, c.y - 24, 2, 22);
        const cards = ['#f3ede4', '#6d8fb8', '#e0aa45', '#9b2c48', '#73c690', '#f3ede4'];
        cards.forEach((col, i) => {
          ctx.fillStyle = col;
          ctx.fillRect(c.x - 20 + (i % 2) * 6, c.y - 24 + Math.floor(i / 2) * 7, 5, 6);
        });
        // Folded t-shirts.
        for (const [dy, col] of [[0, '#9b2c48'], [-3, '#f3ede4'], [-6, '#2b2b2b']] as const) {
          ctx.fillStyle = col;
          ctx.fillRect(c.x - 4, c.y - 5 + dy, 11, 3);
        }
        // Till.
        ctx.fillStyle = '#1d1a17';
        ctx.fillRect(c.x + 10, c.y - 8, 7, 6);
        ctx.fillStyle = '#e0aa45';
        ctx.fillRect(c.x + 11, c.y - 7, 5, 2);
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
      segs = visitTimeline(v, this.state!.floor);
      this.timelines.set(key, segs);
    }
    return segs;
  }

  private callerNow(now: number) {
    const call = this.state!.artistCall;
    if (!call || now < call.arrive) return null;
    const key = `${call.artistId}@${call.arrive}:${call.stage === 'waiting' ? 'w' : 't'}:${call.leftAt ?? ''}`;
    if (this.callSegs?.key !== key) this.callSegs = { key, segs: callTimeline(call, this.state!.floor) };
    const segs = this.callSegs.segs;
    if (!segs.length || now >= segs[segs.length - 1].end) return null;
    const pose = poseAt(segs, now);
    return pose ? { call, pose } : null;
  }

  /** The visiting artist, with a "talk to me" marker while they wait. */
  private drawCaller(call: ArtistCall, pose: NonNullable<ReturnType<typeof poseAt>>, t: number) {
    const v: GuestVisit = { guestId: `artist:${call.artistId}`, start: call.arrive, end: Infinity, steps: [], look: call.look, name: this.state!.artists[call.artistId]?.name };
    this.drawGuest(v, pose, t);
    if (call.stage === 'done') return;
    const meta = SPRITES[call.look.sprite];
    if (!meta) return;
    const p = toScreen(pose.x, pose.y);
    const top = p.y - meta.cell[1] * spriteScale(meta) - 14 + Math.sin(t / 220) * 2;
    const ctx = this.ctx;
    // A little Bauhaus speech mark: yellow square, black rule, a bold "!" (or "…" while you talk).
    ctx.fillStyle = '#f4b400';
    ctx.strokeStyle = '#121212';
    ctx.lineWidth = 1.5;
    ctx.fillRect(p.x - 7, top - 7, 14, 14);
    ctx.strokeRect(p.x - 7, top - 7, 14, 14);
    ctx.beginPath();
    ctx.moveTo(p.x - 3, top + 7);
    ctx.lineTo(p.x, top + 11);
    ctx.lineTo(p.x + 3, top + 7);
    ctx.closePath();
    ctx.fillStyle = '#f4b400';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#121212';
    ctx.font = '800 11px Jost, Futura, "Century Gothic", ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(call.stage === 'waiting' ? '!' : '…', p.x, top + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  /** Marisol, the gallery assistant. Staff: not counted, not tappable. */
  private drawAssistant(p: AssistantPose) {
    const meta = SPRITES.assistant;
    const img = crowdAtlas('assistant', 0);
    if (!meta || !img) return;
    const [row, frames] = meta.anims[p.anim] ?? meta.anims.idle;
    const perHour = p.anim === 'walk' ? 15 : 5;
    // Dusting plays once across the job, ending on her pleased pose, which holds a little longer.
    const frame =
      p.anim === 'dust' && p.span
        ? Math.min(frames - 1, Math.floor((p.local / p.span) * (frames + 1)))
        : Math.floor(p.local * perHour) % frames;
    const [cw, ch] = meta.cell;
    const scale = spriteScale(meta);
    const pt = toScreen(p.x, p.y);
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(pt.x, pt.y + 2);
    if (p.faceLeft) ctx.scale(-1, 1);
    ctx.drawImage(img, frame * cw, row * ch, cw, ch, (-cw * scale) / 2, -ch * scale, cw * scale, ch * scale);
    if (p.carrying) this.drawParcel(p.carrying, frame);
    ctx.restore();
  }

  /** A hired staff member. Loops walking, riding and idling; one-shot poses hold their last frame. */
  private drawStaff(p: StaffPose) {
    const meta = SPRITES[p.sprite];
    const img = meta && crowdAtlas(p.sprite, p.variant);
    if (!meta || !img) return;
    const [row, frames] = meta.anims[p.anim] ?? meta.anims.idle;
    const looping = p.anim === 'walk' || p.anim === 'segway' || p.anim === 'idle' || p.anim === 'chat';
    const perHour = p.anim === 'walk' || p.anim === 'segway' ? 15 : 6;
    const frame = looping ? Math.floor(p.local * perHour) % frames : Math.min(frames - 1, Math.floor(p.local * 4));
    const [cw, ch] = meta.cell;
    const scale = spriteScale(meta);
    const pt = toScreen(p.x, p.y);
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(pt.x, pt.y + 2);
    if (p.faceLeft) ctx.scale(-1, 1);
    ctx.drawImage(img, frame * cw, row * ch, cw, ch, (-cw * scale) / 2, -ch * scale, cw * scale, ch * scale);
    ctx.restore();
  }

  /**
   * What Marisol carries over to hang: a painting wrapped in brown paper and
   * string, or a slatted crate for sculpture. Drawn in her mirrored space, held
   * out in front of her, bobbing with her step.
   */
  private drawParcel(artworkId: string, frame: number) {
    const ctx = this.ctx;
    const bob = frame % 2;
    const sculpture = this.state!.artworks[artworkId]?.form === 'sculpture';
    if (sculpture) {
      const x = 2;
      const y = -30 + bob;
      ctx.fillStyle = '#b98a52';
      ctx.fillRect(x, y, 16, 15);
      ctx.strokeStyle = '#7a5530';
      ctx.lineWidth = 1;
      for (const dy of [4, 9]) {
        ctx.beginPath();
        ctx.moveTo(x, y + dy + 0.5);
        ctx.lineTo(x + 16, y + dy + 0.5);
        ctx.stroke();
      }
      ctx.strokeRect(x + 0.5, y + 0.5, 15, 14);
      return;
    }
    const x = 3;
    const y = -40 + bob;
    ctx.fillStyle = '#c9a26b';
    ctx.fillRect(x, y, 13, 19);
    ctx.strokeStyle = '#8a6a3e';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, 12, 18);
    ctx.strokeStyle = '#f1e6cf';
    ctx.beginPath();
    ctx.moveTo(x + 6.5, y);
    ctx.lineTo(x + 6.5, y + 19);
    ctx.moveTo(x, y + 9.5);
    ctx.lineTo(x + 13, y + 9.5);
    ctx.stroke();
  }

  /** One guest: a hopping paper cutout, mood bubble, and a name tag when selected. */
  private drawGuest(v: GuestVisit, pose: NonNullable<ReturnType<typeof poseAt>>, t: number) {
    const s = this.state!;
    const g = s.guests[v.guestId];
    const sprite = v.look?.sprite ?? g?.sprite;
    const meta = sprite && SPRITES[sprite];
    if (!meta) return;
    const ctx = this.ctx;
    const { seg, local } = pose;
    const dur = seg.end - seg.start;
    // Visitors are flat paper cutouts: one still pose per action, hopping as they go.
    const dist = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y);
    const motion = cutoutMotion(seg.anim, local, dist, dur > 0 ? local / dur : 1);
    const [cw, ch] = meta.cell;
    const scale = spriteScale(meta);
    const p = toScreen(pose.x, pose.y);
    drawCutout(ctx, { sprite, variant: v.look?.variant ?? 0, anim: seg.anim, at: p, faceLeft: seg.faceLeft, motion });

    // Hit box in canvas pixels.
    const sx = this.origin.x + this.pan.x;
    const sy = this.origin.y + this.pan.y;
    const k = this.scale;
    this.guestHits.push({
      id: v.guestId,
      x0: sx + (p.x - (cw * scale) / 2) * k,
      x1: sx + (p.x + (cw * scale) / 2) * k,
      y0: sy + (p.y - ch * scale) * k,
      y1: sy + (p.y + 4) * k,
    });

    // Mood bubble while reacting.
    const top = p.y - ch * scale - 6 - motion.lift;
    const bubble =
      seg.anim === 'impressed' ? { text: '♥', color: '#e2557a' } : seg.anim === 'think' ? { text: '…', color: '#8a7f73' } : seg.anim === 'disapprove' ? { text: '✕', color: '#b5483f' } : null;
    if (bubble) {
      const bob = Math.sin(t / 160) * 1.5;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(p.x + 10, top - 4 + bob, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bubble.color;
      ctx.font = '700 11px Jost, Futura, "Century Gothic", ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bubble.text, p.x + 10, top - 3.5 + bob);
      ctx.textBaseline = 'alphabetic';
    }
    if (seg.anim === 'photo' && local > dur * 0.4 && local < dur * 0.55) {
      if (this.once(`ph:${v.guestId}@${v.start}@${seg.start}`)) this.onSfx('shutter');
      ctx.fillStyle = 'rgba(255,255,240,0.5)';
      ctx.beginPath();
      ctx.arc(p.x + (seg.faceLeft ? -8 : 8), p.y - ch * scale * 0.8, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.selectedGuest === v.guestId) {
      const label = g ? shortName(g) : (v.name?.split(' ')[0] ?? 'Visitor');
      ctx.font = '700 10px Jost, Futura, "Century Gothic", ui-sans-serif, system-ui, sans-serif';
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

