/**
 * Gallery voices, synthesized: no recordings, so nothing to download.
 *
 * Visitors whisper politely and now and then laugh softly. A whisper has no
 * voice pitch: it is breath shaped by the mouth, so each snippet is noise run
 * through vowel formants, broken into syllables with soft "s", "sh", "f" and
 * "h" sounds between them. The low end of the breath is thinned out, because
 * a strong low resonance on noise is what makes synthetic whispers croak.
 *
 * Five voice personas (mouth size, pace, breathiness, sibilance, laugh) keep
 * the room from sounding one-note. The player (sound.ts) scatters snippets
 * around the room and has people answer each other.
 */

export type Persona = {
  name: string;
  /** Scales every formant: bigger is a smaller, brighter mouth. */
  mouth: number;
  /** Syllables per second, relative. */
  pace: number;
  /** Extra unshaped breath in the vowels. */
  breath: number;
  /** How crisp the s and sh sounds are. */
  sibilance: number;
  /** Chance a remark is a short aside rather than a sentence. */
  short: number;
  /** Laugh pitch in Hz and how much voice is in it (0 = all breath). */
  laughPitch: number;
  laughVoice: number;
  /** Laugh style: light "ha-ha" or a closed-mouth "hm-hm" chuckle. */
  chuckle: boolean;
  /** Chance an utterance is a laugh instead of a whisper. */
  laughy: number;
  /** Relative loudness. */
  level: number;
};

export const PERSONAS: Persona[] = [
  // A brisk, bright woman: quick asides, crisp s, a light giggle.
  { name: 'bright', mouth: 1.16, pace: 1.25, breath: 0.25, sibilance: 1.1, short: 0.6, laughPitch: 290, laughVoice: 0.35, chuckle: false, laughy: 0.14, level: 0.95 },
  // An older gentleman: slow, airy, a low closed-mouth chuckle.
  { name: 'gentleman', mouth: 0.9, pace: 0.8, breath: 0.45, sibilance: 0.7, short: 0.35, laughPitch: 125, laughVoice: 0.3, chuckle: true, laughy: 0.1, level: 1 },
  // A student: fast, chatty, long run-on whispers.
  { name: 'student', mouth: 1.06, pace: 1.35, breath: 0.2, sibilance: 0.9, short: 0.25, laughPitch: 230, laughVoice: 0.4, chuckle: false, laughy: 0.16, level: 0.9 },
  // A critic: measured and precise, rarely laughs.
  { name: 'critic', mouth: 0.97, pace: 0.95, breath: 0.15, sibilance: 1.2, short: 0.45, laughPitch: 150, laughVoice: 0.25, chuckle: true, laughy: 0.05, level: 0.9 },
  // A warm friend: soft, breathy, laughs most easily.
  { name: 'friend', mouth: 1.1, pace: 1.05, breath: 0.4, sibilance: 0.8, short: 0.5, laughPitch: 245, laughVoice: 0.3, chuckle: false, laughy: 0.22, level: 1 },
];

/** Whispered vowel formants F1, F2, F3 in Hz (F1 sits a little higher than in speech). */
const VOWELS: [number, number, number][] = [
  [780, 1150, 2550], // ah
  [380, 2250, 2950], // ee
  [580, 1850, 2600], // eh
  [700, 1750, 2500], // a
  [620, 900, 2450], // aw
  [600, 1250, 2500], // uh
  [400, 950, 2300], // oo
  [460, 1950, 2650], // ih
  [530, 1000, 2400], // oh
  [520, 1450, 2450], // er
];

type Consonant = 's' | 'sh' | 'f' | 'h' | 't' | 'none';
const ONSETS: [Consonant, number][] = [
  ['s', 0.22],
  ['sh', 0.1],
  ['f', 0.08],
  ['h', 0.18],
  ['t', 0.12],
  ['none', 0.3],
];

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Two-pole band-pass (RBJ), run by hand so this works without Web Audio and in tests. */
class Band {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private b0 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  constructor(private sr: number) {}
  set(freq: number, q: number) {
    const w = (2 * Math.PI * Math.min(freq, this.sr * 0.45)) / this.sr;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Breath: white noise with the low end thinned (one-pole high-pass). */
class Breath {
  private x = 0;
  private y = 0;
  private k: number;
  constructor(sr: number, private r: () => number, cut = 650) {
    this.k = Math.exp((-2 * Math.PI * cut) / sr);
  }
  next() {
    const n = this.r() * 2 - 1;
    this.y = this.k * (this.y + n - this.x);
    this.x = n;
    return this.y;
  }
}

function pick<T>(r: () => number, table: [T, number][]): T {
  let x = r();
  for (const [v, w] of table) {
    if ((x -= w) < 0) return v;
  }
  return table[table.length - 1][0];
}

/** Soften the top, fade the edges, and set a steady loudness (RMS), never clipping. */
function finish(out: Float32Array, sampleRate: number, rms: number, edgeSec = 0.02) {
  const lp = Math.exp((-2 * Math.PI * Math.min(6000, sampleRate * 0.4)) / sampleRate);
  let z = 0;
  let sum = 0;
  let peak = 1e-6;
  for (let i = 0; i < out.length; i++) {
    z = out[i] * (1 - lp) + z * lp;
    out[i] = z;
    sum += z * z;
    peak = Math.max(peak, Math.abs(z));
  }
  const now = Math.sqrt(sum / Math.max(1, out.length)) || 1e-6;
  const g = Math.min(rms / now, 0.9 / peak);
  const edge = Math.max(1, Math.min(Math.floor(sampleRate * edgeSec), out.length >> 1));
  for (let i = 0; i < out.length; i++) {
    const e = Math.min(1, i / edge, (out.length - 1 - i) / edge);
    out[i] *= g * Math.max(0, e);
  }
  return out;
}

/**
 * One whispered remark by `persona`, mono, silent at both ends.
 * Same seed and persona, same whisper.
 */
export function whisper(sampleRate: number, seed: number, persona: Persona = PERSONAS[seed % PERSONAS.length]): Float32Array {
  const r = rng(seed);
  const P = persona;
  // Small differences from one remark to the next by the same person.
  const mouth = P.mouth * (0.97 + r() * 0.06);
  const pace = P.pace * (0.9 + r() * 0.2);
  // Short asides ("mm, lovely") or a sentence, now and then just "shh" or "hm".
  const shape = r();
  const syllables = shape < 0.08 ? 1 : shape < P.short ? 2 + Math.floor(r() * 3) : 4 + Math.floor(r() * 7);

  type Syl = { onset: Consonant; cLen: number; vLen: number; gap: number; a: number; b: number; loud: number };
  const plan: Syl[] = [];
  for (let k = 0; k < syllables; k++) {
    const onset = syllables === 1 && r() < 0.5 ? 'sh' : pick(r, ONSETS);
    const cLen = onset === 's' || onset === 'sh' ? 0.07 + r() * 0.09 : onset === 'f' || onset === 'h' ? 0.05 + r() * 0.06 : onset === 't' ? 0.025 + r() * 0.015 : 0;
    const vLen = (syllables === 1 ? 0.22 + r() * 0.3 : 0.1 + r() * 0.15) / pace;
    // Word breaks now and then, a breath mid-sentence rarely.
    const gap = r() < 0.28 ? 0.07 + r() * 0.15 : r() < 0.05 ? 0.25 + r() * 0.3 : r() * 0.025;
    // Gentle stress, trailing off at the end of a remark.
    const tail = 1 - (0.4 * k) / Math.max(1, syllables);
    const loud = (0.65 + r() * 0.35) * (r() < 0.2 ? 1.15 : 1) * tail;
    plan.push({ onset, cLen, vLen, gap, a: Math.floor(r() * VOWELS.length), b: Math.floor(r() * VOWELS.length), loud });
  }
  const lead = Math.floor(sampleRate * 0.03);
  let total = lead * 2;
  for (const s of plan) total += Math.floor(sampleRate * (s.cLen + s.vLen + s.gap));
  const out = new Float32Array(total);

  const breath = new Breath(sampleRate, r);
  const f1 = new Band(sampleRate);
  const f2 = new Band(sampleRate);
  const f3 = new Band(sampleRate);
  const fric = new Band(sampleRate);
  let t = lead;
  for (const s of plan) {
    // ---- consonant
    const cn = Math.floor(sampleRate * s.cLen);
    if (s.onset !== 'none' && cn > 0) {
      const centre = s.onset === 's' ? 5400 + r() * 900 : s.onset === 'sh' ? 2900 + r() * 600 : s.onset === 'f' ? 4200 : s.onset === 't' ? 4300 + r() * 900 : 0;
      const q = s.onset === 's' ? 2 : s.onset === 'sh' ? 1.5 : s.onset === 't' ? 1.4 : 0.6;
      const crisp = P.sibilance;
      const level = s.onset === 's' ? 0.3 * crisp : s.onset === 'sh' ? 0.32 * crisp : s.onset === 'f' ? 0.14 : s.onset === 'h' ? 0.22 : 0.16;
      if (centre) fric.set(centre, q);
      const [ha, hb, hc] = VOWELS[s.a];
      if (s.onset === 'h') {
        // "h" is just the coming vowel, breathed.
        f1.set(ha * mouth, 2);
        f2.set(hb * mouth, 3);
        f3.set(hc * mouth, 3.5);
      }
      for (let i = 0; i < cn; i++) {
        const m = i / cn;
        // Soft-edged: even a "t" is a puff, not a click.
        const env = s.onset === 't' ? Math.sin(Math.PI * Math.min(1, m * 3)) * Math.exp(-m * 3) : Math.sin(Math.PI * m) ** 1.5;
        const n = breath.next();
        const v = s.onset === 'h' ? f1.run(n) * 0.4 + f2.run(n) * 0.9 + f3.run(n) * 0.5 : fric.run(n);
        out[t + i] += v * env * level * s.loud;
      }
      t += cn;
    }
    // ---- vowel: breath through the mouth, gliding between two vowels
    const vn = Math.floor(sampleRate * s.vLen);
    const [a1, a2, a3] = VOWELS[s.a];
    const [b1, b2, b3] = VOWELS[s.b];
    for (let i = 0; i < vn; i++) {
      const m = i / vn;
      if (i % 24 === 0) {
        const g = m * m * (3 - 2 * m);
        // Broad formants: airy rather than resonant.
        f1.set((a1 + (b1 - a1) * g) * mouth, 2.5);
        f2.set((a2 + (b2 - a2) * g) * mouth, 4);
        f3.set((a3 + (b3 - a3) * g) * mouth, 5);
      }
      const env = Math.sin(Math.PI * m) ** 1.2;
      const n = breath.next();
      const v = f1.run(n) * 0.45 + f2.run(n) * 1.0 + f3.run(n) * 0.6 + n * P.breath * 0.12;
      out[t + i] += v * env * s.loud;
    }
    t += vn + Math.floor(sampleRate * s.gap);
  }
  return finish(out, sampleRate, 0.12);
}

/**
 * A soft, polite laugh by `persona`: a few breathy "ha"s (or a closed-mouth
 * "hm-hm" chuckle) that fall in pitch and fade. Mono, silent at both ends.
 */
export function laugh(sampleRate: number, seed: number, persona: Persona = PERSONAS[seed % PERSONAS.length]): Float32Array {
  const r = rng(seed ^ 0x5bd1e995);
  const P = persona;
  const pulses = 2 + Math.floor(r() * 4);
  const pitch0 = P.laughPitch * (0.94 + r() * 0.12);
  const beat = (0.16 + r() * 0.06) / Math.sqrt(P.pace);
  // A breath in or out at the end, sometimes.
  const sigh = r() < 0.45 ? 0.25 + r() * 0.2 : 0;
  const lead = Math.floor(sampleRate * 0.02);
  const total = lead * 2 + Math.floor(sampleRate * (pulses * beat + 0.12 + sigh));
  const out = new Float32Array(total);

  const breath = new Breath(sampleRate, r, P.chuckle ? 200 : 500);
  const f1 = new Band(sampleRate);
  const f2 = new Band(sampleRate);
  const f3 = new Band(sampleRate);
  const [v1, v2, v3] = P.chuckle ? VOWELS[5] : r() < 0.5 ? VOWELS[0] : VOWELS[2];
  // A chuckle goes through the nose: low, soft, no mouth brightness.
  f1.set((P.chuckle ? 300 : v1) * P.mouth, 2.5);
  f2.set((P.chuckle ? 1000 : v2) * P.mouth, 3.5);
  f3.set(v3 * P.mouth, 4);
  let phase = 0;
  let t = lead;
  for (let k = 0; k < pulses; k++) {
    const len = Math.floor(sampleRate * beat * (0.9 + r() * 0.2));
    const fall = 1 - 0.18 * (k / Math.max(1, pulses - 1));
    const amp = (1 - 0.5 * (k / pulses)) * (0.8 + r() * 0.2);
    for (let i = 0; i < len && t + i < total; i++) {
      const m = i / len;
      // Quick onset, soft decay, a little silence before the next "ha".
      const env = Math.min(1, m / 0.08) * Math.exp(-m * 4.5);
      const p = pitch0 * fall * (1 - 0.06 * m);
      phase += p / sampleRate;
      phase -= Math.floor(phase);
      // Mellow voice: a few harmonics falling off fast, nothing buzzy.
      const w = 2 * Math.PI * phase;
      const voice = Math.sin(w) + 0.35 * Math.sin(2 * w) + 0.12 * Math.sin(3 * w) + 0.05 * Math.sin(4 * w);
      const n = breath.next();
      const air = f1.run(n) * 0.5 + f2.run(n) * 0.9 + f3.run(n) * (P.chuckle ? 0.1 : 0.4);
      out[t + i] += (air * (1 - P.laughVoice) + voice * 0.18 * P.laughVoice) * env * amp;
    }
    t += len;
  }
  // The trailing breath.
  const sn = Math.floor(sampleRate * sigh);
  for (let i = 0; i < sn && t + i < total; i++) {
    const m = i / sn;
    const n = breath.next();
    out[t + i] += (f2.run(n) * 0.5 + f1.run(n) * 0.3) * Math.sin(Math.PI * m) * 0.35;
  }
  return finish(out, sampleRate, 0.09);
}
