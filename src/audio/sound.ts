import { babble } from './babble';

/**
 * The gallery's sound: crowd chatter that follows how many people are on the
 * floor, a quiet room tone, and short synthesized effects (door chime, sales,
 * camera clicks, glasses at parties, button taps). Everything is generated in
 * the browser, so nothing has to load.
 *
 * Browsers only allow sound after the player touches the page, so nothing
 * starts until the first tap.
 */

const PREF = 'agt.sound';

export type Sfx = 'door' | 'sale' | 'coin' | 'shutter' | 'clink' | 'tap' | 'event' | 'warn' | 'error' | 'note';

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF) !== 'off';
  } catch {
    return true;
  }
}

class Sound {
  enabled = readPref();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fx: GainNode | null = null;
  private room: ConvolverNode | null = null;
  private few: GainNode | null = null;
  private crowd: GainNode | null = null;
  private hum: GainNode | null = null;
  private listeners = new Set<() => void>();
  private last: Partial<Record<Sfx, number>> = {};
  private nextClink = 0;
  private ambience = { count: 0, party: false, paused: false };

  /** Call once: starts audio on the first touch, pauses with the tab. */
  install() {
    const unlock = () => {
      this.start();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    // A soft tap on every button.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if ((e.target as Element | null)?.closest?.('button')) this.play('tap');
      },
      true,
    );
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.enabled) this.ctx.resume();
    });
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(PREF, on ? 'on' : 'off');
    } catch {
      /* private mode: just don't remember */
    }
    if (on) this.start();
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.08);
      if (on) this.ctx.resume();
    }
    this.listeners.forEach((f) => f());
  }

  private start() {
    if (!this.enabled) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // A gallery: hard floors and bare walls, so a short bright reverb.
    this.room = ctx.createConvolver();
    this.room.buffer = this.impulse(1.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.room.connect(wet).connect(this.master);

    this.fx = ctx.createGain();
    this.fx.gain.value = 0.9;
    this.fx.connect(this.master);
    this.fx.connect(this.room);

    // Room tone: a very low rumble so silence isn't dead air.
    this.hum = ctx.createGain();
    this.hum.gain.value = 0.05;
    const hum = ctx.createBufferSource();
    hum.buffer = this.brown(4);
    hum.loop = true;
    const hl = ctx.createBiquadFilter();
    hl.type = 'lowpass';
    hl.frequency.value = 260;
    hum.connect(hl).connect(this.hum).connect(this.master);
    hum.start();

    // Chatter loops are synthesized a moment later so the first tap stays snappy.
    setTimeout(() => this.buildChatter(), 30);
  }

  private buildChatter() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.room) return;
    // Chatter is muffled anyway, so a low sample rate is plenty and synthesizes fast.
    const sr = 16000;
    const loop = (seconds: number, voices: number, seed: number) => {
      const [l, r] = babble(sr, seconds, voices, seed);
      const buf = ctx.createBuffer(2, l.length, sr);
      buf.getChannelData(0).set(l);
      buf.getChannelData(1).set(r);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(this.master!);
      g.connect(this.room!);
      src.start(0, Math.random() * seconds);
      return g;
    };
    // Two loops, built a frame apart so neither holds up the page for long.
    this.few = loop(11, 3, 7);
    setTimeout(() => {
      this.crowd = loop(15, 11, 23);
      this.applyAmbience();
    }, 50);
  }

  /** How busy the room is right now. Called a few times a second. */
  setAmbience(count: number, party: boolean, paused: boolean) {
    const a = this.ambience;
    const changed = a.count !== count || a.party !== party || a.paused !== paused;
    this.ambience = { count, party, paused };
    if (changed) this.applyAmbience();
    // Glasses at a party, more often the fuller it gets.
    if (party && !paused && count > 0 && this.ctx) {
      const now = this.ctx.currentTime;
      if (now >= this.nextClink) {
        if (this.nextClink) this.play('clink');
        this.nextClink = now + (0.4 + Math.random() * 2.2) * Math.max(0.35, 6 / (count + 4));
      }
    }
  }

  private applyAmbience() {
    const ctx = this.ctx;
    if (!ctx || !this.few) return;
    const { count, party, paused } = this.ambience;
    // Frozen in time: the murmur drops right down.
    const hush = paused ? 0.25 : 1;
    const lift = party ? 1.35 : 1;
    const few = count <= 0 ? 0 : Math.min(1, 0.3 + count * 0.18) * (count > 12 ? 0.6 : 1);
    const crowd = Math.max(0, Math.min(1, (count - 3) / 20));
    const t = ctx.currentTime;
    this.few.gain.setTargetAtTime(few * 0.3 * hush * lift, t, 0.9);
    this.crowd?.gain.setTargetAtTime(crowd * 0.42 * hush * lift, t, 0.9);
  }

  play(kind: Sfx) {
    const ctx = this.ctx;
    if (!ctx || !this.fx || !this.enabled || ctx.state !== 'running') return;
    // Don't machine-gun: each sound has a minimum gap.
    const gap: Record<Sfx, number> = { door: 2.5, sale: 0.4, coin: 1, shutter: 0.35, clink: 0.08, tap: 0.05, event: 1.5, warn: 1.5, error: 0.5, note: 1.2 };
    const now = ctx.currentTime;
    if (now - (this.last[kind] ?? -99) < gap[kind]) return;
    this.last[kind] = now;
    const t = now + 0.01;
    switch (kind) {
      case 'door':
        // Shop-door bell: two soft notes.
        this.bell(1318.5, t, 1.4, 0.07);
        this.bell(1046.5, t + 0.16, 1.6, 0.06);
        break;
      case 'sale':
        // Till drawer, then a bright ring and a jingle of change.
        this.noise(t, 0.05, 1800, 0.12, 'bandpass');
        this.bell(2093, t + 0.05, 0.9, 0.08, 2.76);
        this.bell(2637, t + 0.05, 0.9, 0.05, 2.76);
        for (let i = 0; i < 4; i++) this.bell(3400 + Math.random() * 1600, t + 0.22 + i * 0.055 + Math.random() * 0.02, 0.25, 0.025, 2.2);
        break;
      case 'coin':
        this.bell(2350, t, 0.4, 0.04, 2.4);
        this.bell(3135, t + 0.07, 0.5, 0.035, 2.4);
        break;
      case 'shutter':
        this.noise(t, 0.018, 3200, 0.07, 'highpass');
        this.noise(t + 0.055, 0.025, 2600, 0.06, 'highpass');
        break;
      case 'clink': {
        const f = 2300 + Math.random() * 1500;
        this.bell(f, t, 0.35 + Math.random() * 0.3, 0.018 + Math.random() * 0.025, 2.42, Math.random() * 1.6 - 0.8);
        if (Math.random() < 0.5) this.bell(f * 1.04, t + 0.012, 0.3, 0.012, 2.42, Math.random() * 1.6 - 0.8);
        break;
      }
      case 'tap':
        this.noise(t, 0.012, 1500, 0.035, 'bandpass');
        break;
      case 'event':
        // A warm chord for good news.
        [523.25, 659.25, 783.99].forEach((f, i) => this.bell(f, t + i * 0.07, 1.2, 0.045));
        break;
      case 'warn':
        this.tone(330, t, 0.22, 0.05);
        this.tone(262, t + 0.2, 0.32, 0.05);
        break;
      case 'error':
        this.tone(220, t, 0.14, 0.05);
        break;
      case 'note':
        this.bell(880, t, 0.6, 0.03);
        break;
    }
  }

  // ---- building blocks -----------------------------------------------------

  /** A struck tone: a sine plus an inharmonic partial, dying away. */
  private bell(freq: number, t: number, decay: number, vol: number, partial = 2, pan = 0) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const out = pan ? ctx.createStereoPanner() : null;
    if (out) {
      out.pan.value = pan;
      g.connect(out).connect(this.fx!);
    } else g.connect(this.fx!);
    for (const [mul, amp] of [
      [1, 1],
      [partial, 0.35],
    ]) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.frequency.value = freq * mul;
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  private tone(freq: number, t: number, len: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(this.fx!);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  private noise(t: number, len: number, freq: number, vol: number, type: BiquadFilterType) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.white();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = type === 'bandpass' ? 1.4 : 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.fx!);
    src.start(t);
    src.stop(t + len + 0.02);
  }

  private whiteBuf: AudioBuffer | null = null;
  private white() {
    if (this.whiteBuf) return this.whiteBuf;
    const ctx = this.ctx!;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (this.whiteBuf = b);
  }

  private brown(seconds: number) {
    const ctx = this.ctx!;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = b.getChannelData(0);
    let y = 0;
    for (let i = 0; i < d.length; i++) {
      y = (y + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = y * 3.5;
    }
    return b;
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return b;
  }
}

export const sound = new Sound();
