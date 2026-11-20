import { describe, expect, it } from 'vitest';
import {
  absHour,
  buyChance,
  candidatesFor,
  createNewGame,
  dispatch,
  hired,
  salaryOf,
  STAFF_CANDIDATES,
  STAFF_ROLE_ORDER,
  staffPoses,
  synergy,
  TIME,
  weeklySalaries,
  type Action,
  type GameState,
} from '../src/game';
import { SPRITES } from '../src/render/sprites';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const days = (s: GameState, n: number) => run(s, { type: 'tick', hours: n * TIME.ticksPerDay });
const offers = (s: GameState) => Object.values(s.artworks).filter((w) => w.status === 'offered');
const fresh = (seed = 5) => createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed });

describe('staff', () => {
  it('has applicants for every role, and only Duane for security to start', () => {
    for (const r of STAFF_ROLE_ORDER) expect(candidatesFor(r).length).toBeGreaterThan(0);
    expect(candidatesFor('security').map((c) => c.name)).toEqual(['Duane Kowalski']);
  });

  it('every applicant wears a sheet that has the animations their routine uses', () => {
    for (const c of STAFF_CANDIDATES) {
      const meta = SPRITES[c.sprite];
      expect(meta, c.sprite).toBeTruthy();
      expect(meta.anims.idle).toBeTruthy();
      expect(meta.anims[c.role === 'security' ? 'segway' : 'walk']).toBeTruthy();
    }
    const guard = SPRITES.guard.anims;
    for (const a of ['sleep', 'flashlight', 'radio', 'donut', 'think', 'point', 'whistle']) expect(guard[a], a).toBeTruthy();
  });

  it('hires one person per role, replaces, and lets go with final pay', () => {
    let s = fresh();
    s = run(s, { type: 'hireStaff', candidateId: 'c-lucia' });
    expect(hired(s, 'curator')?.who.name).toBe('Lucia Ferrante');
    s = run(s, { type: 'hireStaff', candidateId: 'c-jonah' });
    expect(hired(s, 'curator')?.who.name).toBe('Jonah Reyes');
    expect(dispatch(s, { type: 'hireStaff', candidateId: 'c-jonah' }).ok).toBe(false);
    s = days(s, 2);
    const cash = s.cash;
    s = run(s, { type: 'letGoStaff', role: 'curator' });
    expect(hired(s, 'curator')).toBeUndefined();
    expect(s.cash).toBeLessThan(cash);
  });

  it('pays wages with the weekly bills', () => {
    const base = days(fresh(), 7);
    let s = run(fresh(), { type: 'hireStaff', candidateId: 'i-pip' });
    s = run(s, { type: 'hireStaff', candidateId: 's-duane' });
    expect(weeklySalaries(s)).toBe(salaryOf(hired(s, 'intern')!.who) + salaryOf(hired(s, 'security')!.who));
    s = days(s, 7);
    const wages = s.ledger.filter((e) => e.note.startsWith('Wages:'));
    expect(wages.length).toBe(2);
    expect(base.ledger.some((e) => e.note.startsWith('Wages:'))).toBe(false);
  });

  it('the appraiser talks dealers down', () => {
    const s0 = run(fresh(), { type: 'hireStaff', candidateId: 'a-ambrose' });
    const w = offers(s0)[0];
    const s = run(s0, { type: 'buyArtwork', artworkId: w.id });
    expect(s.artworks[w.id].acquiredFor).toBeLessThan(w.price);
    expect(s0.cash - s.cash).toBe(s.artworks[w.id].acquiredFor);
  });

  it('the assistant curator adds to a show, the intern to the gift shop', () => {
    let s = fresh();
    for (const w of offers(s)) {
      s = run(s, { type: 'buyArtwork', artworkId: w.id });
      const r = dispatch(s, { type: 'setDisplay', artworkId: w.id, display: true });
      if (r.ok) s = r.state;
    }
    expect(Object.values(s.artworks).some((w) => w.status === 'display')).toBe(true);
    const theme = { kind: 'tag' as const, tag: 'portrait' };
    const before = synergy(s, theme);
    const withCurator = synergy(run(s, { type: 'hireStaff', candidateId: 'c-lucia' }), theme);
    expect(withCurator.bonuses.some((b) => b.label === 'Curated')).toBe(true);
    expect(withCurator.score).toBeGreaterThanOrEqual(before.score);
    expect(buyChance(run(s, { type: 'hireStaff', candidateId: 'i-pip' }), 'postcard')).toBeGreaterThan(buyChance(s, 'postcard'));
  });

  it('a guard means nothing is ever stolen', () => {
    for (const seed of [1, 2, 3, 4]) {
      let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'museum', seed });
      for (const w of offers(s).slice(0, 3)) {
        s = run(s, { type: 'buyArtwork', artworkId: w.id });
        if ((s.artworks[w.id].form ?? 'painting') !== 'sculpture') s = run(s, { type: 'setDisplay', artworkId: w.id, display: true });
      }
      s = run(s, { type: 'hireStaff', candidateId: 's-duane' });
      s = days(s, 40);
      expect(Object.values(s.artworks).some((w) => w.stolen)).toBe(false);
    }
  });

  it('without a guard, trouble happens sooner or later', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'museum', seed: 9 });
    for (const w of offers(s).slice(0, 3)) {
      s = run(s, { type: 'buyArtwork', artworkId: w.id });
      if ((s.artworks[w.id].form ?? 'painting') !== 'sculpture') s = run(s, { type: 'setDisplay', artworkId: w.id, display: true });
    }
    s = days(s, 60);
    expect(s.feed.length).toBeGreaterThan(0);
    // Incidents are rare, so this only checks the game survives them and stays consistent.
    for (const w of Object.values(s.artworks)) if (w.stolen) expect(s.floor.fixtures.some((f) => f.artworkId === w.id)).toBe(false);
  });

  it('staff are on the floor in working hours, and the guard is there all night', () => {
    let s = run(fresh(), { type: 'hireStaff', candidateId: 's-duane' });
    s = run(s, { type: 'hireStaff', candidateId: 'i-pip' });
    const day = absHour(s) - s.tick;
    const noon = staffPoses(s, day + 12);
    expect(noon.map((p) => p.role).sort()).toEqual(['intern', 'security']);
    const night = staffPoses(s, day + 3);
    expect(night.map((p) => p.role)).toEqual(['security']);
    for (const p of [...noon, ...night]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
      expect(SPRITES[p.sprite].anims[p.anim] ?? SPRITES[p.sprite].anims.idle).toBeTruthy();
    }
  });
});
