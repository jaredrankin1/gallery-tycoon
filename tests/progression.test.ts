import { describe, expect, it } from 'vitest';
import {
  careerStage,
  createNewGame,
  dispatch,
  EXHIBITION,
  PATRONAGE,
  stipendFor,
  synergy,
  TIME,
  type Action,
  type GameState,
} from '../src/game';
import { migrate } from '../src/game/save';
import { addFame } from '../src/game/systems/careers';
import { exhibitionCrowd } from '../src/game/systems/exhibitions';
import { weeklyPatronage } from '../src/game/systems/patronage';
import { Rng } from '../src/game/rng';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const tryRun = (s: GameState, a: Action) => dispatch(s, a);
const days = (s: GameState, n: number) => run(s, { type: 'tick', hours: n * TIME.ticksPerDay });
const fresh = (venue: 'gallery' | 'museum' = 'gallery', seed = 3) => createNewGame({ name: 'x', difficulty: 'easy', venue, seed });
const befriend = (s: GameState, id: string, r = 40) => {
  s.artists[id].relationship = r;
  return s;
};
const mine = (s: GameState, artistId: string) => Object.values(s.artworks).filter((w) => w.artistId === artistId && w.status !== 'offered' && w.status !== 'sold');

describe('artist careers', () => {
  it('every artist gets a hidden potential and a form', () => {
    const s = fresh();
    for (const a of Object.values(s.artists)) {
      expect(a.potential).toBeGreaterThanOrEqual(5);
      expect(a.potential).toBeLessThanOrEqual(98);
      expect(a.form).toBeGreaterThan(0);
    }
  });

  it('owned work gains value as its artist gets famous', () => {
    let s = fresh();
    const w = Object.values(s.artworks).find((x) => x.status === 'offered')!;
    s = run(s, { type: 'buyArtwork', artworkId: w.id });
    const before = s.artworks[w.id].value;
    const fame = s.artists[w.artistId].fame;
    addFame(s, w.artistId, 30);
    expect(s.artworks[w.id].value).toBeGreaterThan(before);
    expect(careerStage(s.artists[w.artistId].fame)).not.toBe(careerStage(fame));
    expect(s.feed.some((f) => f.text.includes('went up'))).toBe(true);
  });

  it('fame drifts toward potential over time', () => {
    let s = fresh();
    s.artists['a-hollis'].fame = 10;
    s.artists['a-hollis'].potential = 90;
    s = days(s, 60);
    expect(s.artists['a-hollis'].fame).toBeGreaterThan(18);
  });

  it('studio visits scout potential', () => {
    let s = fresh();
    s = run(s, { type: 'studioVisit', artistId: 'a-mara' });
    s = days(s, 1);
    s = run(s, { type: 'studioVisit', artistId: 'a-mara' });
    expect(s.artists['a-mara'].studioVisits).toBe(2);
  });
});

describe('patronage', () => {
  it('needs a relationship and a free slot', () => {
    const s = fresh();
    const r = tryRun(s, { type: 'signPatron', artistId: 'a-mara', tier: 'fair' });
    expect(r.ok).toBe(false);
    let t = befriend(fresh(), 'a-mara');
    for (const id of ['a-hollis', 'a-junie', 'a-rook']) befriend(t, id);
    t = run(t, { type: 'signPatron', artistId: 'a-mara', tier: 'fair' });
    t = run(t, { type: 'signPatron', artistId: 'a-hollis', tier: 'fair' });
    t = run(t, { type: 'signPatron', artistId: 'a-junie', tier: 'fair' });
    expect(PATRONAGE.slots).toBe(3);
    expect(tryRun(t, { type: 'signPatron', artistId: 'a-rook', tier: 'fair' }).ok).toBe(false);
  });

  it('charges the first week up front, then weekly with the bills', () => {
    let s = befriend(fresh(), 'a-hollis');
    const cash = s.cash;
    const stipend = stipendFor(s.artists['a-hollis'], 'fair');
    s = run(s, { type: 'signPatron', artistId: 'a-hollis', tier: 'fair' });
    expect(s.cash).toBe(cash - stipend);
    s = days(s, 7);
    expect(s.ledger.filter((e) => e.category === 'patronage')).toHaveLength(2);
  });

  it('sponsored artists deliver works into storage at random intervals', () => {
    let s = befriend(fresh(), 'a-wren');
    s = run(s, { type: 'signPatron', artistId: 'a-wren', tier: 'generous' });
    s = days(s, 30);
    const delivered = mine(s, 'a-wren').filter((w) => w.commissioned);
    expect(delivered.length).toBeGreaterThanOrEqual(2);
    expect(delivered.length).toBe(s.artists['a-wren'].patron?.delivered);
    expect(delivered.every((w) => w.acquiredFor === 0 && w.value > 0)).toBe(true);
    // Their works stop turning up on the open market.
    expect(Object.values(s.artworks).some((w) => w.status === 'offered' && w.artistId === 'a-wren' && w.day > 1)).toBe(false);
  });

  it('a generous stipend keeps form higher than a modest one', () => {
    const play = (tier: 'modest' | 'generous') => {
      let s = befriend(fresh('gallery', 9), 'a-mara', 30);
      s = run(s, { type: 'signPatron', artistId: 'a-mara', tier });
      s.artists['a-mara'].fame = 10; // keep rivals away for this test
      return days(s, 40).artists['a-mara'].form;
    };
    expect(play('generous')).toBeGreaterThan(play('modest'));
  });

  it('rivals poach underpaid artists unless you respond', () => {
    const s = befriend(fresh(), 'a-junie', 15);
    const signed = run(s, { type: 'signPatron', artistId: 'a-junie', tier: 'modest' });
    const rng = new Rng(1);
    // Force the approach, then let a week pass with nothing done.
    signed.artists['a-junie'].patron!.courtedDay = signed.day;
    signed.artists['a-junie'].patron!.courtedBy = 'The Glasshouse';
    signed.artists['a-junie'].relationship = 10;
    weeklyPatronage(signed, rng);
    expect(signed.artists['a-junie'].patron).toBeUndefined();
    expect(signed.artists['a-junie'].rivalUntil).toBeGreaterThan(signed.day);
    expect(tryRun(signed, { type: 'signPatron', artistId: 'a-junie', tier: 'fair' }).ok).toBe(false);
  });

  it('raising the stipend and keeping them happy fends a rival off', () => {
    let s = befriend(fresh(), 'a-junie', 40);
    s = run(s, { type: 'signPatron', artistId: 'a-junie', tier: 'modest' });
    s.artists['a-junie'].patron!.courtedDay = s.day;
    s = run(s, { type: 'setStipend', artistId: 'a-junie', tier: 'generous' });
    expect(s.artists['a-junie'].patron?.courtedDay).toBeUndefined();
    weeklyPatronage(s, new Rng(2));
    expect(s.artists['a-junie'].patron).toBeDefined();
  });

  it('ending a deal hurts the relationship', () => {
    let s = befriend(fresh(), 'a-rook', 40);
    s = run(s, { type: 'signPatron', artistId: 'a-rook', tier: 'fair' });
    const r = s.artists['a-rook'].relationship;
    s = run(s, { type: 'endPatronage', artistId: 'a-rook' });
    expect(s.artists['a-rook'].patron).toBeUndefined();
    expect(s.artists['a-rook'].relationship).toBeLessThan(r);
  });
});

/** Buys and hangs everything on offer, adding wall spots as needed, until `n` works are up. */
function hangWorks(s: GameState, pick: (s: GameState) => string[]): GameState {
  for (const id of pick(s)) {
    if (s.artworks[id].status === 'offered') s = run(s, { type: 'buyArtwork', artworkId: id });
    const r = dispatch(s, { type: 'setDisplay', artworkId: id, display: true });
    if (r.ok) s = r.state;
  }
  return s;
}

describe('exhibitions', () => {
  const soloSetup = () => {
    let s = befriend(fresh('gallery', 4), 'a-junie');
    s.cash = 1_000_000;
    // Hand-deliver four Junie works so the test doesn't depend on the market.
    s = run(s, { type: 'signPatron', artistId: 'a-junie', tier: 'fair' });
    for (let i = 0; i < 4; i++) {
      const id = `w-test-${i}`;
      s.artworks[id] = { id, title: `T${i}`, artistId: 'a-junie', value: 5000, grade: 1.2, acquiredFor: 0, price: 6000, status: 'storage', day: 1 };
    }
    return hangWorks(s, (st) => Object.keys(st.artworks).filter((k) => k.startsWith('w-test-')));
  };

  it('scores synergy from what is on the walls', () => {
    const s = soloSetup();
    const solo = synergy(s, { kind: 'solo', artistId: 'a-junie' });
    expect(solo.onTheme.length).toBe(4);
    expect(solo.bonuses.map((b) => b.label)).toContain('Focused');
    const offTheme = synergy(s, { kind: 'solo', artistId: 'a-mara' });
    expect(offTheme.score).toBeLessThan(solo.score);
  });

  it('needs enough on-theme works to open', () => {
    const s = fresh();
    expect(tryRun(s, { type: 'mountExhibition', theme: { kind: 'tag', tag: 'moody' } }).ok).toBe(false);
  });

  it('runs a week, draws a bigger crowd, gets reviewed, then closes', () => {
    let s = soloSetup();
    const before = exhibitionCrowd(s);
    s = run(s, { type: 'mountExhibition', theme: { kind: 'solo', artistId: 'a-junie' } });
    expect(s.exhibition).not.toBeNull();
    expect(s.exhibition!.stars).toBeGreaterThanOrEqual(1);
    expect(exhibitionCrowd(s)).toBeGreaterThan(before);
    expect(s.ledger.some((e) => e.category === 'exhibitions')).toBe(true);
    expect(tryRun(s, { type: 'mountExhibition', theme: { kind: 'tag', tag: 'pop' } }).ok).toBe(false);
    s = days(s, EXHIBITION.days);
    expect(s.exhibition).toBeNull();
    expect(s.exhibitionHistory).toHaveLength(1);
    expect(s.exhibitionHistory[0].visitors).toBeGreaterThan(0);
  });

  it('can close early', () => {
    let s = soloSetup();
    s = run(s, { type: 'mountExhibition', theme: { kind: 'solo', artistId: 'a-junie' } });
    s = run(s, { type: 'closeExhibition' });
    expect(s.exhibition).toBeNull();
  });
});

describe('saves', () => {
  it('upgrades a version 4 save', () => {
    const s = fresh() as any;
    s.version = 4;
    for (const a of Object.values(s.artists) as any[]) {
      delete a.potential;
      delete a.form;
      delete a.studioVisits;
      delete a.fameLastWeek;
    }
    for (const w of Object.values(s.artworks) as any[]) delete w.grade;
    delete s.exhibition;
    delete s.exhibitionHistory;
    const m = migrate(JSON.parse(JSON.stringify(s)))!;
    expect(m.version).toBe(5);
    expect(m.exhibition).toBeNull();
    expect(Object.values(m.artworks).every((w) => w.grade > 0)).toBe(true);
    expect(days(m, 3).day).toBe(4);
  });
});
