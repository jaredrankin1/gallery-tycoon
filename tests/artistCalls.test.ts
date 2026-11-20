import { describe, expect, it } from 'vitest';
import { ARTIST_CALLS, createNewGame, dispatch, DIFFICULTY, TIME, toneScore, type Action, type GameState } from '../src/game';
import { workValue } from '../src/game/systems/careers';
import { callTimeline, startArtistCall } from '../src/game/systems/artistCalls';
import { Rng } from '../src/game/rng';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const fresh = (seed = 3) => createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed });

/** A game with `artistId` standing in the gallery, waiting to talk. */
function withCaller(artistId: string, seed = 3) {
  const s = fresh(seed);
  const rng = new Rng(11);
  startArtistCall(s, artistId, rng);
  return s;
}

/** Talk to them, always picking the line they'll like best. */
function charm(s: GameState, buy = false): GameState {
  s = run(s, { type: 'talkToArtist' });
  for (let i = 0; i < 6 && s.artistCall && s.artistCall.stage !== 'farewell' && s.artistCall.stage !== 'done'; i++) {
    const call = s.artistCall!;
    const artist = s.artists[call.artistId];
    let opts = call.options.filter((o) => o.tone !== 'haggle');
    if (call.stage === 'deal') opts = opts.filter((o) => (buy ? o.tone === 'buy' : o.tone === 'pass'));
    const best = opts.reduce((a, b) => (toneScore(artist, b.tone) > toneScore(artist, a.tone) ? b : a));
    s = run(s, { type: 'talkChoose', optionId: best.id });
  }
  return s;
}

/** Talk to them, always picking the line they'll like least. */
function offend(s: GameState): GameState {
  s = run(s, { type: 'talkToArtist' });
  for (let i = 0; i < 6 && s.artistCall && s.artistCall.stage !== 'farewell' && s.artistCall.stage !== 'done'; i++) {
    const call = s.artistCall!;
    const artist = s.artists[call.artistId];
    const opts = call.options.filter((o) => o.tone !== 'buy' && o.tone !== 'haggle');
    const worst = opts.reduce((a, b) => (toneScore(artist, b.tone) < toneScore(artist, a.tone) ? b : a));
    s = run(s, { type: 'talkChoose', optionId: worst.id });
  }
  return s;
}

describe('artist visits', () => {
  it('someone drops by on day one, after lunch', () => {
    let s = fresh();
    s = run(s, { type: 'tick', hours: ARTIST_CALLS.firstVisitTick - TIME.startTick + 1 });
    expect(s.artistCall).toBeTruthy();
    expect(s.artistCall!.stage).toBe('waiting');
    expect(s.feed.some((f) => f.kind === 'artist' && f.text.includes('walked in'))).toBe(true);
  });

  it('artists keep dropping by, at most one a day', () => {
    let s = fresh(5);
    const arrivals: number[] = [];
    for (let h = 0; h < 24 * 21; h++) {
      const before = s.artistCalls?.count ?? 0;
      s = run(s, { type: 'tick', hours: 1 });
      if ((s.artistCalls?.count ?? 0) > before) arrivals.push(s.day);
    }
    expect(arrivals.length).toBeGreaterThanOrEqual(5);
    expect(new Set(arrivals).size).toBe(arrivals.length);
  });

  it('what they bring is cheaper than the dealers and not on the market list', () => {
    const s = withCaller('a-mara');
    const call = s.artistCall!;
    expect(call.workIds.length).toBeGreaterThan(0);
    for (const id of call.workIds) {
      const w = s.artworks[id];
      expect(w.withArtist).toBe(true);
      const dealer = workValue(s.artists['a-mara'], w) * DIFFICULTY.normal.artPriceMultiplier;
      expect(w.price).toBeLessThan(dealer);
    }
    // The dealer market's buy action can't reach them.
    expect(dispatch(s, { type: 'buyArtwork', artworkId: call.workIds[0] }).ok).toBe(false);
  });

  it('each artist likes different things', () => {
    const s = fresh();
    // Mara loves wine and company; Tobias the recluse can't stand hype.
    expect(toneScore(s.artists['a-mara'], 'wine')).toBeGreaterThan(0);
    expect(toneScore(s.artists['a-tobias'], 'hype')).toBeLessThan(0);
    expect(toneScore(s.artists['a-tobias'], 'process')).toBeGreaterThan(0);
    expect(toneScore(s.artists['a-sable'], 'flatter')).toBeGreaterThan(0);
    expect(toneScore(s.artists['a-sable'], 'haggle')).toBeLessThan(0);
  });

  it('saying what they like raises the relationship and your reputation', () => {
    const s0 = withCaller('a-mara');
    const rep0 = s0.reputation;
    const rel0 = s0.artists['a-mara'].relationship;
    const s = charm(s0);
    expect(s.artistCall!.stage).toBe('farewell');
    expect(s.artistCall!.rapport).toBeGreaterThanOrEqual(ARTIST_CALLS.repFrom);
    expect(s.artists['a-mara'].relationship).toBeGreaterThan(rel0);
    expect(s.reputation).toBeGreaterThan(rep0);
  });

  it('saying what they hate costs you', () => {
    const s0 = withCaller('a-tobias');
    const s = offend(s0);
    expect(s.artistCall!.rapport).toBeLessThan(0);
    expect(s.artists['a-tobias'].relationship).toBeLessThan(s0.artists['a-tobias'].relationship);
    expect(s.reputation).toBeLessThanOrEqual(s0.reputation);
  });

  it('buying takes the piece into storage; what you pass on leaves with them', () => {
    let s = withCaller('a-hollis');
    const cash0 = s.cash;
    const ids = [...s.artistCall!.workIds];
    s = charm(s, true);
    const bought = s.artistCall!.bought;
    expect(bought.length).toBeGreaterThan(0);
    expect(s.cash).toBeLessThan(cash0);
    for (const id of bought) expect(s.artworks[id].status).toBe('storage');
    s = run(s, { type: 'talkChoose', optionId: 'bye' });
    expect(s.artistCall!.stage).toBe('done');
    for (const id of ids) if (!bought.includes(id)) expect(s.artworks[id]).toBeUndefined();
    // A little later they're out the door and gone.
    s = run(s, { type: 'tick', hours: 3 });
    expect(s.artistCall).toBeNull();
  });

  it('ignore them long enough and they leave, a little hurt', () => {
    let s = withCaller('a-junie');
    const rel0 = s.artists['a-junie'].relationship;
    const ids = [...s.artistCall!.workIds];
    s = run(s, { type: 'tick', hours: ARTIST_CALLS.waitHours + 1 });
    expect(s.artistCall?.stage ?? 'gone').not.toBe('waiting');
    expect(s.artists['a-junie'].relationship).toBeLessThan(rel0);
    for (const id of ids) expect(s.artworks[id]).toBeUndefined();
  });

  it('walking off mid-conversation is rude', () => {
    let s = withCaller('a-pilar');
    s = run(s, { type: 'talkToArtist' });
    const rel = s.artists['a-pilar'].relationship;
    s = run(s, { type: 'leaveTalk' });
    expect(s.artistCall!.stage).toBe('done');
    expect(s.artists['a-pilar'].relationship).toBeLessThan(rel);
  });

  it('a great chat can end in a patronage deal', () => {
    let s = withCaller('a-mara');
    s.artists['a-mara'].relationship = 20;
    s = charm(s);
    const sponsor = s.artistCall!.options.find((o) => o.tone === 'sponsor');
    expect(sponsor).toBeTruthy();
    s = run(s, { type: 'talkChoose', optionId: sponsor!.id });
    expect(s.artists['a-mara'].patron?.tier).toBe('fair');
  });

  it('they walk in, wait on the floor, and walk out through the door', () => {
    let s = withCaller('a-noor');
    const call = s.artistCall!;
    const segs = callTimeline(call, s.floor);
    expect(segs[0].anim).toBe('walk');
    expect(segs[segs.length - 1].anim).toBe('idle');
    s = charm(s);
    s = run(s, { type: 'talkChoose', optionId: 'bye' });
    const out = callTimeline(s.artistCall!, s.floor);
    const last = out[out.length - 1];
    expect(last.anim).toBe('walk');
    expect(Math.hypot(last.to.x - (s.floor.entrance.x + 0.5), last.to.y - (s.floor.entrance.y + 0.5))).toBeLessThan(0.01);
  });

  it('the whole conversation survives a save', () => {
    let s = withCaller('a-wren');
    s = run(s, { type: 'talkToArtist' });
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    const a = run(s, { type: 'talkChoose', optionId: s.artistCall!.options[0].id });
    const b = run(copy, { type: 'talkChoose', optionId: copy.artistCall!.options[0].id });
    expect(b.artistCall).toEqual(a.artistCall);
  });
});
