/**
 * Gallery whispers, synthesized: no recordings, so nothing to download.
 *
 * A whisper has no voice pitch at all: it is breath (noise) shaped by the
 * mouth. So each snippet is noise run through three vowel formants, broken
 * into syllables with soft "s", "sh", "f", "h" and "t/k" sounds between them.
 * Every snippet is a different speaker (mouth size, pace, breathiness) saying
 * a different number of syllables, from a single "hm" to a short sentence.
 * The player (sound.ts) scatters them around the room at random.
 */

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

type Consonant = 's' | 'sh' | 'f' | 'h' | 'stop' | 'none';
const ONSETS: [Consonant, number][] = [
  ['s', 0.2],
  ['sh', 0.1],
  ['f', 0.08],
  ['h', 0.14],
  ['stop', 0.22],
  ['none', 0.26],
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

function pick<T>(r: () => number, table: [T, number][]): T {
  let x = r();
  for (const [v, w] of table) {
    if ((x -= w) < 0) return v;
  }
  return table[table.length - 1][0];
}

/**
 * One whispered snippet, mono, peak about 0.9, silent at both ends.
 * Same seed, same whisper.
 */
export function whisper(sampleRate: number, seed: number): Float32Array {
  const r = rng(seed);
  // The speaker: mouth size moves every formant, pace and breath vary.
  const mouth = 0.86 + r() * 0.34;
  const pace = 0.75 + r() * 0.6;
  const breath = 0.15 + r() * 0.35;
  // Mostly short asides, sometimes a longer remark, now and then just "hm" or "shh".
  const shape = r();
  const syllables = shape < 0.12 ? 1 : shape < 0.55 ? 2 + Math.floor(r() * 4) : 5 + Math.floor(r() * 7);

  // Plan first, so the buffer is the right length.
  type Syl = { onset: Consonant; cLen: number; vLen: number; gap: number; a: number; b: number; loud: number };
  const plan: Syl[] = [];
  for (let k = 0; k < syllables; k++) {
    const onset = syllables === 1 && r() < 0.4 ? 'sh' : pick(r, ONSETS);
    const cLen = onset === 's' || onset === 'sh' ? 0.06 + r() * 0.1 : onset === 'f' || onset === 'h' ? 0.04 + r() * 0.06 : onset === 'stop' ? 0.012 + r() * 0.012 : 0;
    const vLen = (syllables === 1 ? 0.18 + r() * 0.3 : 0.07 + r() * 0.16) / pace;
    // Word breaks now and then, a breath mid-sentence rarely.
    const gap = r() < 0.3 ? 0.06 + r() * 0.14 : r() < 0.05 ? 0.25 + r() * 0.3 : r() * 0.03;
    // Stress on some syllables, trailing off at the end of a remark.
    const tail = 1 - (0.45 * k) / Math.max(1, syllables);
    const loud = (0.5 + r() * 0.5) * (r() < 0.25 ? 1.25 : 1) * tail;
    plan.push({ onset, cLen, vLen, gap, a: Math.floor(r() * VOWELS.length), b: Math.floor(r() * VOWELS.length), loud });
  }
  const lead = Math.floor(sampleRate * 0.02);
  let total = lead * 2;
  for (const s of plan) total += Math.floor(sampleRate * (s.cLen + s.vLen + s.gap));
  const out = new Float32Array(total);

  const f1 = new Band(sampleRate);
  const f2 = new Band(sampleRate);
  const f3 = new Band(sampleRate);
  const fric = new Band(sampleRate);
  let t = lead;
  for (const s of plan) {
    // ---- consonant
    const cn = Math.floor(sampleRate * s.cLen);
    if (s.onset !== 'none' && cn > 0) {
      const centre = s.onset === 's' ? 5200 + r() * 1200 : s.onset === 'sh' ? 2600 + r() * 700 : s.onset === 'f' ? 4000 : s.onset === 'stop' ? 1800 + r() * 2500 : 0;
      const q = s.onset === 's' ? 2.2 : s.onset === 'sh' ? 1.6 : s.onset === 'stop' ? 1.2 : 0.6;
      const level = s.onset === 's' ? 0.32 : s.onset === 'sh' ? 0.38 : s.onset === 'f' ? 0.16 : s.onset === 'h' ? 0.2 : 0.4;
      if (centre) fric.set(centre, q);
      const [ha, hb, hc] = VOWELS[s.a];
      if (s.onset === 'h') {
        // "h" is just the coming vowel, breathed.
        f1.set(ha * mouth, 2.5);
        f2.set(hb * mouth, 3.5);
        f3.set(hc * mouth, 4);
      }
      for (let i = 0; i < cn; i++) {
        const m = i / cn;
        const env = s.onset === 'stop' ? Math.exp(-m * 5) : Math.sin(Math.PI * m) ** 1.5;
        const n = r() * 2 - 1;
        const v = s.onset === 'h' ? f1.run(n) + f2.run(n) * 0.7 + f3.run(n) * 0.3 : fric.run(n);
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
        f1.set((a1 + (b1 - a1) * g) * mouth, 4);
        f2.set((a2 + (b2 - a2) * g) * mouth, 7);
        f3.set((a3 + (b3 - a3) * g) * mouth, 9);
      }
      const env = Math.min(1, m / 0.25) * Math.min(1, (1 - m) / 0.35);
      const n = r() * 2 - 1;
      const v = f1.run(n) * 1.0 + f2.run(n) * 0.8 + f3.run(n) * 0.35 + n * breath * 0.08;
      out[t + i] += v * env * env * s.loud;
    }
    t += vn + Math.floor(sampleRate * s.gap);
  }

  // Take the edge off: whispers across a room are soft, not hissy.
  const lp = Math.exp((-2 * Math.PI * Math.min(6500, sampleRate * 0.4)) / sampleRate);
  let z = 0;
  let peak = 1e-6;
  for (let i = 0; i < total; i++) {
    z = out[i] * (1 - lp) + z * lp;
    out[i] = z;
    peak = Math.max(peak, Math.abs(z));
  }
  const g = 0.9 / peak;
  const edge = Math.min(lead, total >> 1);
  for (let i = 0; i < total; i++) {
    const e = Math.min(1, i / edge, (total - 1 - i) / edge);
    out[i] *= g * Math.max(0, e);
  }
  return out;
}
