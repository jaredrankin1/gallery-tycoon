// Background music: a soft, original jazz combo played live by Web Audio.
// A walking bass, a mellow electric piano comping, a ride cymbal and hi-hat,
// and a vibraphone that sometimes noodles a phrase over the changes. The
// form is a 32-bar AABA tune in F, written for this game. Nothing is a
// recording: every note is scheduled a moment ahead, so the bass line, the
// comping rhythm and the vibes phrases vary every time round the loop.

type Quality = 'maj7' | 'm7' | '7';
interface Chord {
  /** MIDI note of the root (any octave). */
  root: number;
  q: Quality;
  /** Length in beats. */
  beats: number;
}

const N = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 } as const;
const c = (root: keyof typeof N, q: Quality, beats = 4): Chord => ({ root: N[root], q, beats });

// Each section is 8 bars; a bar with two chords splits it 2 + 2.
const A1: Chord[] = [
  c('F', 'maj7'), c('D', 'm7'), c('G', 'm7'), c('C', '7'),
  c('F', 'maj7'), c('Bb', '7'), c('A', 'm7', 2), c('D', '7', 2), c('G', 'm7', 2), c('C', '7', 2),
];
const A2: Chord[] = [
  c('F', 'maj7'), c('D', '7'), c('G', 'm7'), c('C', '7'),
  c('A', 'm7', 2), c('D', '7', 2), c('G', 'm7', 2), c('C', '7', 2), c('F', 'maj7', 2), c('D', 'm7', 2), c('G', 'm7', 2), c('C', '7', 2),
];
const B: Chord[] = [
  c('C', 'm7', 2), c('F', '7', 2), c('Bb', 'maj7'), c('Bb', 'm7', 2), c('Eb', '7', 2), c('A', 'm7', 2), c('D', '7', 2),
  c('G', 'm7'), c('C', '7'), c('A', 'm7', 2), c('D', '7', 2), c('G', 'm7', 2), c('C', '7', 2),
];
export const FORM: Chord[] = [...A1, ...A2, ...B, ...A2];

/** Chord tones above the root: 3rd, 5th, 7th, 9th. */
const TONES: Record<Quality, number[]> = {
  maj7: [4, 7, 11, 14],
  m7: [3, 7, 10, 14],
  '7': [4, 7, 10, 14],
};
/** A scale to walk and improvise in, per chord quality. */
const SCALE: Record<Quality, number[]> = {
  maj7: [0, 2, 4, 7, 9, 11],
  m7: [0, 2, 3, 5, 7, 10],
  '7': [0, 2, 4, 7, 9, 10],
};

export const JAZZ = {
  bpm: 92,
  /** Where the swung eighth falls between beats (0.5 straight, 0.67 triplet swing). */
  swing: 0.64,
  /** How far ahead notes are scheduled, seconds. */
  lookahead: 0.6,
  level: 0.5,
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
/** Put a pitch class into the octave starting at `low`. */
const fold = (pc: number, low: number) => low + ((((pc - low) % 12) + 12) % 12);

export class Jazz {
  private bus: GainNode;
  private noise: AudioBuffer;
  private next = 0;
  private bar = 0;
  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastBass = 41;
  private lastLead = 72;
  private rand: () => number;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
    seed = (Math.random() * 2 ** 31) | 0,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = JAZZ.level;
    this.bus.connect(out);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let s = seed || 1;
    this.rand = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 100000) / 100000;
    };
    for (let i = 0; i < len; i++) d[i] = this.rand() * 2 - 1;
  }

  /** Begin playing (live contexts); keeps scheduling until stop(). */
  start() {
    if (this.timer) return;
    this.next = this.ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.pump(this.ctx.currentTime + JAZZ.lookahead), 90);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Schedule every chord that starts before `until` (also used to render offline). */
  pump(until: number) {
    const beat = 60 / JAZZ.bpm;
    while (this.next < until) {
      const ch = FORM[this.index];
      const nextCh = FORM[(this.index + 1) % FORM.length];
      const t = this.next;
      this.bass(ch, nextCh, t, beat);
      this.comp(ch, t, beat);
      this.drums(t, ch.beats, beat);
      if (this.leadThisChord(ch)) this.lead(ch, t, beat);
      this.next += ch.beats * beat;
      this.index = (this.index + 1) % FORM.length;
      this.bar += ch.beats / 4;
    }
  }

  /** Loop length in seconds, for rendering. */
  static loopSeconds() {
    return (FORM.reduce((s, ch) => s + ch.beats, 0) * 60) / JAZZ.bpm;
  }

  private swung(t: number, beatPos: number, beat: number) {
    const whole = Math.floor(beatPos);
    const frac = beatPos - whole;
    return t + (whole + (frac >= 0.5 ? JAZZ.swing : 0)) * beat;
  }

  // ---- walking bass ----------------------------------------------------------

  private bass(ch: Chord, nextCh: Chord, t: number, beat: number) {
    const root = this.near(ch.root, this.lastBass, 33, 48);
    const target = this.near(nextCh.root, root, 33, 48);
    const notes: number[] = [root];
    const tones = TONES[ch.q];
    if (ch.beats === 4) {
      const up = target >= root;
      const third = root + tones[0];
      const fifth = root + tones[1];
      notes.push(this.rand() < 0.5 ? third : root + (up ? 2 : -1));
      notes.push(this.rand() < 0.6 ? fifth : third);
    }
    // Last beat: a half step (or a scale step) into the next root.
    const approach = this.rand() < 0.65 ? target + (this.rand() < 0.5 ? 1 : -1) : target + (target > root ? -2 : 2);
    notes.push(approach);
    notes.forEach((m, i) => this.bassNote(t + i * beat, m, beat * 0.92, i === 0 ? 1 : 0.8));
    this.lastBass = notes[notes.length - 1];
  }

  private near(pc: number, from: number, low: number, high: number) {
    let m = fold(pc, low);
    if (m + 12 <= high && Math.abs(m + 12 - from) < Math.abs(m - from)) m += 12;
    return m;
  }

  private bassNote(t: number, midi: number, dur: number, vel: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(520, t + dur);
    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = hz(midi);
    const o2 = ctx.createOscillator();
    o2.frequency.value = hz(midi);
    const v = 0.32 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(v * 0.35, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.08);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.bus);
    for (const o of [o1, o2]) {
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  // ---- electric piano comping ----------------------------------------------------

  private static RHYTHMS: number[][] = [[0, 1.5], [1.5], [0], [0.5, 2], [2.5], [1.5, 3.5], [0, 2.5], [1, 2.5]];

  private comp(ch: Chord, t: number, beat: number) {
    const [third, , seventh, ninth] = TONES[ch.q];
    // A rootless voicing in the middle of the keyboard: 3rd, 7th, 9th (and 5th sometimes).
    const base = fold(ch.root + third, 53);
    const voicing = [base, fold(ch.root + seventh, base), fold(ch.root + ninth, base + 1)];
    if (this.rand() < 0.4) voicing.push(fold(ch.root + TONES[ch.q][1], voicing[2]));
    const options = ch.beats === 4 ? Jazz.RHYTHMS : [[0], [0.5], [1.5], [0, 1.5]];
    const hits = options[Math.floor(this.rand() * options.length)].filter((b) => b < ch.beats);
    hits.forEach((b, i) => {
      const at = this.swung(t, b, beat);
      const len = (i + 1 < hits.length ? hits[i + 1] - b : ch.beats - b) * beat * 0.85;
      const vel = 0.75 + this.rand() * 0.25;
      voicing.forEach((m, k) => this.epNote(at + k * 0.006, m, Math.max(0.18, len), vel));
    });
  }

  /** A soft tine piano: a sine carrier with a quickly fading FM bell on the attack. */
  private epNote(t: number, midi: number, dur: number, vel: number) {
    const ctx = this.ctx;
    const f = hz(midi);
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(f * 1.4, t);
    depth.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.25);
    mod.connect(depth).connect(car.frequency);
    const g = ctx.createGain();
    const v = 0.11 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(v * 0.4, t + 0.5);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.09);
    car.connect(g).connect(this.bus);
    for (const o of [car, mod]) {
      o.start(t);
      o.stop(t + dur + 0.6);
    }
  }

  // ---- drums: ride, hi-hat on 2 and 4, a feathered kick, brushes ---------------------

  private drums(t: number, beats: number, beat: number) {
    for (let b = 0; b < beats; b++) {
      const on = t + b * beat;
      const absBeat = Math.round(this.bar * 4 + b) % 4;
      this.ride(on, absBeat === 1 || absBeat === 3 ? 1 : 0.75);
      // The skip note: "ding, ding-ga ding".
      if (absBeat === 1 || absBeat === 3) this.ride(this.swung(t, b + 0.5, beat), 0.5);
      if (absBeat === 1 || absBeat === 3) {
        this.hat(on);
        this.brush(on);
      }
      if (absBeat === 0 && this.rand() < 0.6) this.kick(on);
    }
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    src.connect(f).connect(g).connect(this.bus);
    const offset = this.rand() * 0.8;
    src.start(t, offset);
    src.stop(t + decay + 0.02);
  }

  private ride(t: number, vel: number) {
    this.noiseHit(t, 'bandpass', 7600, 2.5, 0.05 * vel, 0.38);
    this.noiseHit(t, 'highpass', 10500, 0.7, 0.015 * vel, 0.8);
  }

  private hat(t: number) {
    this.noiseHit(t, 'highpass', 8000, 0.7, 0.025, 0.05);
  }

  private brush(t: number) {
    this.noiseHit(t, 'bandpass', 2600, 1.2, 0.014, 0.22);
  }

  private kick(t: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.3);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.32);
  }

  // ---- vibraphone: an occasional phrase over the changes ------------------------------

  private phraseLeft = 0;

  private leadThisChord(ch: Chord) {
    if (this.phraseLeft > 0) {
      this.phraseLeft -= ch.beats;
      return true;
    }
    // Start a new phrase now and then: a couple of bars on, a few bars off.
    if (this.rand() < 0.22) {
      this.phraseLeft = 4 + Math.floor(this.rand() * 2) * 4 - ch.beats;
      return true;
    }
    return false;
  }

  private lead(ch: Chord, t: number, beat: number) {
    const scale = SCALE[ch.q];
    const tones = [0, ...TONES[ch.q].slice(0, 3)];
    let pos = this.rand() < 0.4 ? 0.5 : 0;
    while (pos < ch.beats - 0.25) {
      const strong = pos % 1 === 0;
      const pool = strong ? tones : scale;
      // Move by small steps from the last note, staying in a singing range.
      const candidates: number[] = [];
      for (const iv of pool) for (const oct of [60, 72, 84]) candidates.push(fold(ch.root + iv, oct));
      const near = candidates.filter((m) => m >= 64 && m <= 86 && Math.abs(m - this.lastLead) <= 5 && m !== this.lastLead);
      const m = near.length ? near[Math.floor(this.rand() * near.length)] : fold(ch.root + tones[1], 67);
      const len = this.rand() < 0.3 ? 1 : 0.5;
      if (this.rand() > 0.15) this.vibes(this.swung(t, pos, beat), m, len * beat * 1.6, strong ? 1 : 0.8);
      this.lastLead = m;
      pos += len;
    }
  }

  private vibes(t: number, midi: number, dur: number, vel: number) {
    const ctx = this.ctx;
    const f = hz(midi);
    const g = ctx.createGain();
    const v = 0.06 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(v * 0.3, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);
    // Motor tremolo.
    const trem = ctx.createGain();
    trem.gain.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.2;
    lfo.connect(lfoAmt).connect(trem.gain);
    const o = ctx.createOscillator();
    o.frequency.value = f;
    // The bar's bright overtone fades first.
    const o4 = ctx.createOscillator();
    o4.frequency.value = f * 4;
    const g4 = ctx.createGain();
    g4.gain.setValueAtTime(0.25, t);
    g4.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(trem);
    o4.connect(g4).connect(trem);
    trem.connect(g).connect(this.bus);
    for (const x of [o, o4, lfo]) {
      x.start(t);
      x.stop(t + dur + 1);
    }
  }
}
