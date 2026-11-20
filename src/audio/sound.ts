import { Jazz } from './jazz';
import { whisper } from './whisper';

/**
 * The gallery's sound: a soft jazz combo playing in the background (jazz.ts), hushed whispers that follow how many people are on the
 * floor, a quiet room tone, and short synthesized effects (door chime, sales,
 * camera clicks, glasses at parties, button taps). Everything is generated in
 * the browser, so nothing has to load.
 *
 * Browsers only allow sound after the player touches the page, so nothing
 * starts until the first tap.
 */

const PREF = 'agt.sound';

/** Half a second of silent 8-bit mono WAV, built in code so nothing has to load. */
const SILENCE = (() => {
  const n = 4000;
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  const tag = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, 36 + n, true); tag(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  tag(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
  let bin = '';
  b.forEach((x) => (bin += String.fromCharCode(x)));
  return 'data:audio/wav;base64,' + btoa(bin);
})();

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
  private whispers: GainNode | null = null;
  /** Whispered snippets, a different speaker each; a few are swapped for new ones as the game runs. */
  private bank: AudioBuffer[] = [];
  private live = 0;
  private nextSwap = 0;
  private hum: GainNode | null = null;
  private music: GainNode | null = null;
  private jazz: Jazz | null = null;
  private listeners = new Set<() => void>();
  private last: Partial<Record<Sfx, number>> = {};
  private nextClink = 0;
  private ambience = { count: 0, party: false, paused: false };

  /** Call once: starts audio on the first touch, pauses with the tab. */
  install() {
    // iPhone Safari only lets audio start from touchend/click (not pointerdown),
    // so listen on every gesture until the context is actually running.
    const gestures = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    const unlock = () => {
      this.start();
      this.unlockMedia();
      if (this.ctx?.state === 'running') gestures.forEach((g) => window.removeEventListener(g, unlock, true));
    };
    gestures.forEach((g) => window.addEventListener(g, unlock, true));
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

  private media: HTMLAudioElement | null = null;

  /**
   * iOS plays Web Audio on the ringer channel, so the silent switch mutes it.
   * Asking for the "playback" session (Safari 16.4+), and on older iOS looping a
   * silent <audio> element, moves the game onto the media channel like a video.
   */
  private unlockMedia() {
    if (!this.enabled) return;
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session && session.type !== 'playback') session.type = 'playback';
    } catch {
      /* not supported */
    }
    if (this.media) return;
    const el = new Audio(SILENCE);
    el.loop = true;
    el.setAttribute('playsinline', '');
    el.volume = 0;
    this.media = el;
    el.play().catch(() => {
      this.media = null; // try again on the next tap
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
    if (on) {
      this.start();
      this.unlockMedia();
    } else {
      this.media?.pause();
      this.media = null;
    }
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

    // Whispers all share one gain, so pausing or muting hushes them together.
    this.whispers = ctx.createGain();
    this.whispers.gain.value = 1;
    this.whispers.connect(this.master);
    this.whispers.connect(this.room);
    // Snippets are synthesized a few at a time so the first tap stays snappy.
    this.fillBank(0);

    // Background music: fades in over a few seconds, with a touch of the room's reverb.
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.gain.setTargetAtTime(Sound.MUSIC, ctx.currentTime + 0.3, 1.5);
    this.music.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.25;
    this.music.connect(send).connect(this.room);
    this.jazz = new Jazz(ctx, this.music);
    this.jazz.start();
  }

  /** Music level against the effects and whispers. */
  private static MUSIC = 0.55;

  private static BANK = 36;
  private static SR = 22050;

  private makeWhisper(seed: number) {
    const ctx = this.ctx!;
    const d = whisper(Sound.SR, seed);
    const buf = ctx.createBuffer(1, d.length, Sound.SR);
    buf.getChannelData(0).set(d);
    return buf;
  }

  private fillBank(from: number) {
    if (!this.ctx) return;
    for (let i = from; i < Math.min(Sound.BANK, from + 6); i++) this.bank.push(this.makeWhisper((Math.random() * 2 ** 31) | 0));
    if (this.bank.length < Sound.BANK) setTimeout(() => this.fillBank(this.bank.length), 40);
  }

  /** How busy the room is right now. Called a few times a second. */
  setAmbience(count: number, party: boolean, paused: boolean) {
    const a = this.ambience;
    const changed = a.count !== count || a.party !== party || a.paused !== paused;
    this.ambience = { count, party, paused };
    if (changed) this.applyAmbience();
    this.murmur(0.25);
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
    if (!ctx || !this.whispers) return;
    // Frozen in time: the room goes almost silent.
    const { paused } = this.ambience;
    this.whispers.gain.setTargetAtTime(paused ? 0.35 : 1, ctx.currentTime, 0.6);
    // The band plays on, a little softer.
    this.music?.gain.setTargetAtTime(Sound.MUSIC * (paused ? 0.6 : 1), ctx.currentTime, 0.8);
  }

  /**
   * Scatter whispers around the room for the next `span` seconds. Each person
   * leans in to say something every ten seconds or so, so more people means
   * more whispers overlapping, but each one stays quiet.
   */
  private murmur(span: number) {
    const ctx = this.ctx;
    if (!ctx || !this.whispers || !this.enabled || ctx.state !== 'running' || this.bank.length < 4) return;
    const { count, party, paused } = this.ambience;
    if (count <= 0) return;
    const now = ctx.currentTime;
    // Keep the bank fresh so the room never settles into a pattern.
    if (now >= this.nextSwap) {
      if (this.nextSwap && this.bank.length >= Sound.BANK) this.bank[Math.floor(Math.random() * this.bank.length)] = this.makeWhisper((Math.random() * 2 ** 31) | 0);
      this.nextSwap = now + 4 + Math.random() * 6;
    }
    const perPerson = party ? 1 / 5 : 1 / 7;
    // Even one or two visitors keep up a quiet back-and-forth.
    const rate = Math.min(party ? 3 : 2.2, Math.max(0.35, count * perPerson)) * (paused ? 0.25 : 1);
    const cap = Math.min(party ? 8 : 6, 2 + Math.ceil(count / 3));
    // Poisson arrivals: a random number of whispers, at random moments.
    let n = 0;
    const expect = rate * span;
    let p = Math.exp(-expect);
    let acc = p;
    const u = Math.random();
    while (u > acc && n < 6) {
      n++;
      p *= expect / n;
      acc += p;
    }
    // Busier rooms: each whisper a touch quieter, so the total stays hushed.
    const crowdTrim = 1 / Math.sqrt(1 + count / 16);
    for (let i = 0; i < n && this.live < cap; i++) {
      this.speak(now + 0.02 + Math.random() * span, crowdTrim * (party ? 1.15 : 1));
    }
  }

  private speak(t: number, level: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.bank[Math.floor(Math.random() * this.bank.length)];
    // Different voices: playback speed shifts mouth size and pace together.
    src.playbackRate.value = 0.84 + Math.random() * 0.34;
    // Distance: far whispers are quieter and duller.
    const near = Math.random();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200 + near * 4200;
    tone.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = (0.12 + near * 0.2) * level;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.7 - 0.85;
    src.connect(tone).connect(g).connect(pan).connect(this.whispers!);
    this.live++;
    src.onended = () => {
      this.live--;
      pan.disconnect();
    };
    src.start(t);
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
