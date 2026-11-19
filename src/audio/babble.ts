/**
 * Crowd chatter, synthesized: no recordings, so nothing to download.
 *
 * Each voice is a buzzing pitch (a vocal-cord stand-in) run through two
 * resonant filters set to vowel formants, cut into syllables and phrases with
 * pauses. A few voices sound like a couple of people talking; ten sound like
 * a room. The room's reverb is added later by the player (see sound.ts).
 */

/** Vowel formants F1, F2 in Hz: ah, ee, eh, a, aw, uh, oo, ih, oh. */
const VOWELS: [number, number][] = [
  [730, 1090],
  [300, 2250],
  [530, 1840],
  [660, 1720],
  [570, 840],
  [520, 1190],
  [320, 900],
  [400, 1950],
  [480, 1000],
];

function rng(seed: number) {
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
    const w = (2 * Math.PI * freq) / this.sr;
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

/**
 * A loop of chatter: `voices` people talking for `seconds`, as stereo channels.
 * The tail is folded back onto the start, so it loops without a click.
 */
export function babble(sampleRate: number, seconds: number, voices: number, seed: number): [Float32Array, Float32Array] {
  const fade = Math.floor(sampleRate * 0.8);
  const n = Math.floor(sampleRate * seconds);
  const total = n + fade;
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  const r = rng(seed);

  for (let v = 0; v < voices; v++) {
    const low = r() < 0.5;
    const base = low ? 95 + r() * 45 : 175 + r() * 60;
    const pan = 0.15 + r() * 0.7;
    // Further away voices are quieter and duller.
    const near = 0.45 + r() * 0.55;
    const f1 = new Band(sampleRate);
    const f2 = new Band(sampleRate);
    let phase = r();
    let t = Math.floor(r() * sampleRate * 1.5);
    while (t < total) {
      // A phrase: a run of syllables with falling intonation, then a pause.
      const syllables = 2 + Math.floor(r() * 9);
      const rise = 1.08 + r() * 0.12;
      for (let k = 0; k < syllables && t < total; k++) {
        const len = Math.floor(sampleRate * (0.09 + r() * 0.15));
        const [a, b] = VOWELS[Math.floor(r() * VOWELS.length)];
        const [c, d] = VOWELS[Math.floor(r() * VOWELS.length)];
        const loud = (0.55 + r() * 0.45) * near;
        const pitch = base * (rise - (0.16 * k) / syllables) * (0.96 + r() * 0.08);
        const att = Math.floor(sampleRate * 0.018);
        const rel = Math.floor(sampleRate * 0.045);
        const burst = r() < 0.6 ? Math.floor(sampleRate * (0.01 + r() * 0.025)) : 0;
        for (let i = 0; i < len && t + i < total; i++) {
          if (i % 32 === 0) {
            // glide between two vowels across the syllable
            const m = i / len;
            f1.set(a + (c - a) * m, 5);
            f2.set(b + (d - b) * m, 9);
          }
          const env = Math.min(1, i / att, (len - i) / rel) * loud;
          const p = pitch * (1 + 0.012 * Math.sin((t + i) * 0.0009 * (v + 1)));
          phase += p / sampleRate;
          phase -= Math.floor(phase);
          const buzz = 1 - 2 * phase;
          const hiss = i < burst ? (r() * 2 - 1) * 0.6 : 0;
          const src = buzz * 0.5 + hiss;
          const s = (f1.run(src) * 1.0 + f2.run(src) * 0.55) * env;
          left[t + i] += s * (1 - pan);
          right[t + i] += s * pan;
        }
        t += len + Math.floor(sampleRate * r() * 0.05);
      }
      t += Math.floor(sampleRate * (0.25 + r() * (low ? 1.6 : 1.2)));
    }
  }

  // Fold the tail onto the start, then normalise.
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    left[i] = left[i] * k + left[n + i] * (1 - k);
    right[i] = right[i] * k + right[n + i] * (1 - k);
  }
  const outL = left.subarray(0, n);
  const outR = right.subarray(0, n);
  // Soften: a gentle one-pole low-pass, like hearing it across a room.
  const lp = Math.exp((-2 * Math.PI * 2600) / sampleRate);
  let zl = 0;
  let zr = 0;
  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    zl = outL[i] * (1 - lp) + zl * lp;
    zr = outR[i] * (1 - lp) + zr * lp;
    outL[i] = zl;
    outR[i] = zr;
    peak = Math.max(peak, Math.abs(zl), Math.abs(zr));
  }
  const g = 0.9 / peak;
  for (let i = 0; i < n; i++) {
    outL[i] *= g;
    outR[i] *= g;
  }
  return [outL, outR];
}
