import { canPlace, getVenueModel, TIME, type Fixture, type FixtureKind, type GameState } from '../game';
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

interface Visitor {
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  speed: number;
  color: string;
  leaving?: boolean;
}

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
 * It only reads GameState; it never changes it. Cosmetic visitors live here.
 */
export class IsoRenderer {
  private ctx: CanvasRenderingContext2D;
  private state: GameState | null = null;
  private visitors: Visitor[] = [];
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
  ) {
    this.ctx = canvas.getContext('2d')!;
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
    this.syncVisitors();
    this.layout();
  }

  setSelected(tile: Pt | null) {
    this.selected = tile;
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

  /** Is tonight's event under way? Drives the party crowd. */
  private partyNow(): boolean {
    const s = this.state;
    if (!s) return false;
    return s.events.some((e) => e.day === s.day) && s.tick >= TIME.eventTick - 2 && s.tick <= TIME.eventTick;
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
    const g = this.gridAt(this.local(e));
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

  // ---- visitors (cosmetic) -------------------------------------------------

  private syncVisitors() {
    const s = this.state!;
    const daily = getVenueModel(s.venue).expectedDailyVisitors(s);
    const hanging = s.floor.fixtures.filter((f) => f.artworkId).length;
    const party = this.partyNow() ? 12 : 0;
    const want = Math.min(26, Math.round(daily / 6) + Math.min(hanging, 2) + party);
    const palette = ['#2f3e46', '#6d597a', '#b56576', '#355070', '#e56b6f', '#283618', '#9c6644'];
    const staying = this.visitors.filter((v) => !v.leaving);
    // Extra people head for the door rather than vanishing.
    for (const v of staying.slice(want)) {
      v.leaving = true;
      v.tx = s.floor.entrance.x + 0.5;
      v.ty = s.floor.entrance.y + 0.5;
    }
    let count = Math.min(staying.length, want);
    while (count++ < want) {
      const { x, y } = s.floor.entrance;
      this.visitors.push({
        x: x + 0.5,
        y: y + 0.5,
        tx: x + 0.5,
        ty: y + 0.5,
        wait: Math.random() * 2,
        speed: 0.6 + Math.random() * 0.5,
        color: palette[this.visitors.length % palette.length],
      });
    }
  }

  private stepVisitors(dt: number) {
    const s = this.state!;
    const art = s.floor.fixtures.filter((f) => f.artworkId);
    for (const v of this.visitors) {
      const dx = v.tx - v.x;
      const dy = v.ty - v.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.05 && v.leaving) {
        v.wait = -1; // reached the door
        continue;
      }
      if (d < 0.05) {
        v.wait -= dt;
        if (v.wait <= 0) {
          // Head for a random artwork (stand in front of it) or wander.
          const f = art.length && Math.random() < 0.7 ? art[Math.floor(Math.random() * art.length)] : null;
          if (f) {
            v.tx = (f.x === 0 ? 1 : f.x) + 0.3 + Math.random() * 0.4;
            v.ty = (f.y === 0 && f.x !== 0 ? 1 : f.y) + 0.3 + Math.random() * 0.4;
          } else {
            v.tx = 1 + Math.random() * (s.floor.width - 2);
            v.ty = 1 + Math.random() * (s.floor.height - 2);
          }
          v.wait = 1.5 + Math.random() * 3;
        }
      } else {
        const step = Math.min(d, v.speed * dt);
        v.x += (dx / d) * step;
        v.y += (dy / d) * step;
      }
    }
    this.visitors = this.visitors.filter((v) => !(v.leaving && v.wait === -1));
  }

  // ---- drawing -------------------------------------------------------------

  private frame = (t: number) => {
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0);
    this.last = t;
    if (this.state) {
      this.stepVisitors(dt);
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
    for (const v of this.visitors) items.push({ depth: v.x + v.y, draw: () => this.drawVisitor(v, t) });
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

  private drawVisitor(v: Visitor, t: number) {
    const ctx = this.ctx;
    const p = toScreen(v.x, v.y);
    const moving = Math.hypot(v.tx - v.x, v.ty - v.y) > 0.05;
    const bob = moving ? Math.sin(t / 90 + v.speed * 10) * 1.2 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = v.color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 11 + bob, 5, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e9c9a8';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 24 + bob, 4, 0, Math.PI * 2);
    ctx.fill();
    if (this.partyNow()) {
      ctx.fillStyle = '#8e1f3a';
      ctx.fillRect(p.x + 5, p.y - 17 + bob, 3, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(p.x + 6, p.y - 13 + bob, 1, 4);
    }
  }
}

