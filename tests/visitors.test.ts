import { describe, expect, it } from 'vitest';
import { createNewGame, dispatch, finalMood, MOOD_AXES, moodAt, Steering, TIME, visitTimeline, type Action, type FloorPlan, type GameState } from '../src/game';
import { challengeOf, encounterMood, type Encounter } from '../src/game/systems/moods';
import { blockedTiles, hitsFurniture, route } from '../src/game/systems/paths';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const offers = (s: GameState) => Object.values(s.artworks).filter((w) => w.status === 'offered');
const hung = (venue: 'gallery' | 'museum', seed: number) => {
  let s = createNewGame({ name: 'x', difficulty: 'easy', venue, seed });
  for (const w of offers(s).slice(0, 4)) {
    s = run(s, { type: 'buyArtwork', artworkId: w.id });
    // Anything that won't go up where there's room (a sculpture with no free pedestal) stays in storage.
    const r = dispatch(s, { type: 'setDisplay', artworkId: w.id, display: true });
    if (r.ok) s = r.state;
  }
  return s;
};

describe('walking', () => {
  const floor: FloorPlan = {
    width: 8,
    height: 8,
    entrance: { x: 7, y: 7 },
    // A row of pedestals right across the middle, with a gap at one end.
    fixtures: [1, 2, 3, 4, 5, 6].map((x) => ({ id: `p${x}`, kind: 'pedestal' as const, x, y: 4 })),
  };

  it('goes around furniture, not through it', () => {
    const pts = route(floor, { x: 3.5, y: 6.5 }, { x: 3.5, y: 1.5 }, 'k');
    expect(pts.length).toBeGreaterThan(1);
    const blocked = blockedTiles(floor);
    let at = { x: 3.5, y: 6.5 };
    for (const p of pts) {
      for (let i = 1; i <= 20; i++) {
        const q = { x: at.x + ((p.x - at.x) * i) / 20, y: at.y + ((p.y - at.y) * i) / 20 };
        expect(hitsFurniture(blocked, q, 0)).toBe(false);
      }
      at = p;
    }
    expect(pts[pts.length - 1]).toEqual({ x: 3.5, y: 1.5 });
  });

  it('walks straight when the way is clear', () => {
    expect(route({ ...floor, fixtures: [] }, { x: 1, y: 1 }, { x: 6, y: 6 }, 'k')).toEqual([{ x: 6, y: 6 }]);
  });

  it('people make room for each other instead of walking through', () => {
    const steer = new Steering();
    const open = { ...floor, fixtures: [] };
    // Two people walking straight at each other along the same line.
    let closest = Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      const a = { key: 'a', x: 1 + t * 5, y: 3.5, moving: true };
      const b = { key: 'b', x: 6 - t * 5, y: 3.5, moving: true };
      const at = steer.step([a, b], 0.01, open);
      const pa = at.get('a')!;
      const pb = at.get('b')!;
      closest = Math.min(closest, Math.hypot(pa.x - pb.x, pa.y - pb.y));
    }
    expect(closest).toBeGreaterThan(0.25);
  });

  it('a crowd at one work spreads out', () => {
    const steer = new Steering();
    const open = { ...floor, fixtures: [] };
    const crowd = ['a', 'b', 'c', 'd'].map((key) => ({ key, x: 3, y: 3, moving: false }));
    let at = steer.step(crowd, 0.02, open);
    for (let i = 0; i < 60; i++) at = steer.step(crowd, 0.02, open);
    const ps = [...at.values()];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y)).toBeGreaterThan(0.2);
  });
});

describe('moods', () => {
  const base: Encounter = { score: 0.6, challenge: 0.4, fame: 30, tags: [], repeat: false, crowd: 0, packed: -1, venue: 'gallery', affordable: 0.5 };
  const person = { savvy: 0.5, wealth: 0.5, patience: 0.5 };

  it('hard work baffles novices and enlightens the savvy', () => {
    const hard = { ...base, challenge: 0.9 };
    expect(encounterMood({ ...person, savvy: 0.1 }, hard).enlightened).toBeLessThan(0);
    expect(encounterMood({ ...person, savvy: 0.9 }, hard).enlightened).toBeGreaterThan(0);
  });

  it('experimental work is more challenging than a landscape', () => {
    const w = { id: 'w', tags: [] as string[] };
    expect(challengeOf(w, { tags: ['experimental', 'minimal'] })).toBeGreaterThan(challengeOf(w, { tags: ['landscape', 'pop'] }));
  });

  it('crowds make people unhappy, more so the impatient', () => {
    const quiet = encounterMood(person, base).happy;
    const packed = { ...base, crowd: 6, packed: 0.5 };
    expect(encounterMood(person, packed).happy).toBeLessThan(quiet);
    expect(encounterMood({ ...person, patience: 0.1 }, packed).happy).toBeLessThan(encounterMood({ ...person, patience: 0.9 }, packed).happy);
  });

  it('seeing the same artist again gets boring; loving a work makes you want it', () => {
    expect(encounterMood(person, { ...base, repeat: true }).amused).toBeLessThan(encounterMood(person, base).amused);
    expect(encounterMood(person, { ...base, score: 0.95 }).covetous).toBeGreaterThan(encounterMood(person, { ...base, score: 0.3 }).covetous);
  });

  it('every visitor has a name and moods that change as they look at the art', () => {
    let s = hung('museum', 4);
    s = run(s, { type: 'tick', hours: 4 });
    const crowd = s.visits.filter((v) => v.look);
    expect(crowd.length).toBeGreaterThan(2);
    const names = new Set(crowd.map((v) => v.name));
    expect(names.size).toBeGreaterThan(1);
    let changed = 0;
    for (const v of s.visits) {
      expect(v.mood).toBeDefined();
      const segs = visitTimeline(v, s.floor);
      const first = moodAt(v, segs, v.start);
      const last = moodAt(v, segs, v.end);
      expect(last).toEqual(finalMood(v));
      for (const k of MOOD_AXES) expect(Math.abs(last[k])).toBeLessThanOrEqual(1);
      if (v.steps.length && MOOD_AXES.some((k) => first[k] !== last[k])) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('a busy week has some people leaving early', () => {
    let s = hung('museum', 11);
    let early = 0;
    for (let h = 0; h < TIME.ticksPerDay * 7; h++) {
      s = run(s, { type: 'tick', hours: 1 });
      early += s.visits.filter((v) => v.leftEarly && v.start > (s.day - 1) * 24 + s.tick - 1).length;
    }
    expect(early).toBeGreaterThan(0);
  });
});
