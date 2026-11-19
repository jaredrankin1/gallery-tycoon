import { describe, expect, it } from 'vitest';
import { ARTIST_SEEDS } from '../src/data/artists';
import { SCULPTURES } from '../src/data/sculptures';
import { assistantPose, fitsOn, createNewGame, dispatch, DIFFICULTY, poseAt, tasteScore, TIME, visitTimeline, workTags, type Action, type GameState } from '../src/game';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const days = (s: GameState, n: number) => run(s, { type: 'tick', hours: n * TIME.ticksPerDay });
const offers = (s: GameState) => Object.values(s.artworks).filter((w) => w.status === 'offered');
/** Put an owned work on display, building a pedestal first if it's a sculpture with nowhere to stand. */
const show = (s: GameState, id: string) => {
  if (s.artworks[id].form === 'sculpture' && !s.floor.fixtures.some((f) => f.kind === 'pedestal' && !f.artworkId)) {
    const { width, height } = s.floor;
    outer: for (let y = 1; y < height - 1; y++)
      for (let x = 1; x < width - 1; x++) {
        const r = dispatch(s, { type: 'placeFixture', kind: 'pedestal', x, y });
        if (r.ok) {
          s = r.state;
          break outer;
        }
      }
  }
  return run(s, { type: 'setDisplay', artworkId: id, display: true });
};

describe('new game', () => {
  it('starting cash follows difficulty', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      expect(createNewGame({ name: 'x', difficulty: d, venue: 'gallery', seed: 1 }).cash).toBe(DIFFICULTY[d].startingCash);
    }
  });
  it('starts with a full market, a floor and artists', () => {
    const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'museum', seed: 1 });
    expect(offers(s).length).toBe(5);
    expect(s.floor.fixtures.some((f) => f.kind === 'wallHang')).toBe(true);
    expect(Object.keys(s.artists).length).toBeGreaterThan(0);
  });
});

describe('clock', () => {
  it('advances hours, then days', () => {
    let s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 1 });
    expect(s.tick).toBe(TIME.startTick);
    s = run(s, { type: 'tick', hours: 3 });
    expect([s.day, s.tick]).toEqual([1, TIME.startTick + 3]);
    s = days(s, 1);
    expect([s.day, s.tick]).toEqual([2, TIME.startTick + 3]);
    expect(s.history).toHaveLength(1);
  });

  it('is deterministic for a seed', () => {
    const play = () => days(createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 42 }), 10);
    expect(play()).toEqual(play());
  });

  it('pays weekly bills on Sunday night', () => {
    let s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 5 });
    s = days(s, 6);
    expect(s.ledger.some((e) => e.category === 'rent')).toBe(false);
    s = days(s, 1);
    expect(s.ledger.filter((e) => e.category === 'rent')).toHaveLength(1);
    expect(s.feed.some((f) => f.kind === 'bills')).toBe(true);
  });

  it('goes bankrupt when cash runs out', () => {
    let s = createNewGame({ name: 'x', difficulty: 'hard', venue: 'gallery', seed: 1 });
    for (let i = 0; i < 300 && s.status === 'playing'; i++) s = days(s, 1);
    expect(s.status).toBe('bankrupt');
  });
});

describe('venues', () => {
  it('buying and hanging art', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 7 });
    const w = offers(s)[0];
    const cash = s.cash;
    s = run(s, { type: 'buyArtwork', artworkId: w.id });
    expect(s.cash).toBe(cash - w.price);
    expect(s.artists[w.artistId].relationship).toBeGreaterThan(0);
    s = show(s, w.id);
    expect(s.artworks[w.id].status).toBe('display');
    expect(s.floor.fixtures.some((f) => f.artworkId === w.id)).toBe(true);
  });

  it('gallery eventually sells displayed work and reports it', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 11 });
    for (const w of offers(s).slice(0, 4)) {
      s = run(s, { type: 'buyArtwork', artworkId: w.id });
      s = run(s, { type: 'setPrice', artworkId: w.id, price: Math.round(s.artworks[w.id].value * 0.9) });
      s = show(s, w.id);
    }
    s = days(s, 30);
    expect(Object.values(s.artworks).some((w) => w.status === 'sold')).toBe(true);
    expect(s.ledger.some((e) => e.category === 'sales')).toBe(true);
  });

  it('museum earns ticket money hour by hour from displayed art', () => {
    let s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'museum', seed: 3 });
    for (const w of offers(s).slice(0, 2)) {
      s = run(s, { type: 'buyArtwork', artworkId: w.id });
      s = show(s, w.id);
    }
    const before = s.cash;
    s = run(s, { type: 'tick', hours: 6 });
    expect(s.cash).toBeGreaterThan(before);
    // Ticket income merges into one ledger line per day.
    expect(s.ledger.filter((e) => e.category === 'tickets')).toHaveLength(1);
  });

  it('museums cannot set sale prices', () => {
    const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'museum', seed: 3 });
    expect(dispatch(s, { type: 'setPrice', artworkId: 'nope', price: 10 }).ok).toBe(false);
  });
});

describe('events and hospitality', () => {
  it('books, charges wine & cheese, resolves at 7 PM and moves the relationship', () => {
    let s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 9 });
    const cash = s.cash;
    s = run(s, {
      type: 'scheduleEvent',
      kind: 'talk',
      day: 2,
      featuredArtistIds: ['a-hollis'],
      hospitality: { wine: 2, cheese: 2, guests: 40 },
    });
    expect(s.cash).toBe(cash - 400 - 40 * 18);
    s = run(s, { type: 'tick', hours: TIME.ticksPerDay - s.tick + TIME.eventTick });
    expect(s.events).toHaveLength(1);
    s = run(s, { type: 'tick', hours: 1 });
    expect(s.events).toHaveLength(0);
    expect(s.feed.some((f) => f.kind === 'event')).toBe(true);
    expect(s.artists['a-hollis'].relationship).toBeGreaterThan(0);
  });

  it('rejects events with the wrong number of artists or too soon', () => {
    const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 9 });
    const plan = { wine: 1, cheese: 1, guests: 10 } as const;
    expect(dispatch(s, { type: 'scheduleEvent', kind: 'opening', day: 3, featuredArtistIds: [], hospitality: plan }).ok).toBe(false);
    expect(dispatch(s, { type: 'scheduleEvent', kind: 'gala', day: 2, featuredArtistIds: ['a-mara', 'a-junie'], hospitality: plan }).ok).toBe(false);
  });
});

describe('floor', () => {
  it('only allows wall spots on back walls', () => {
    const s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 1 });
    expect(dispatch(s, { type: 'placeFixture', kind: 'wallHang', x: 3, y: 3 }).ok).toBe(false);
    expect(dispatch(s, { type: 'placeFixture', kind: 'pedestal', x: 3, y: 3 }).ok).toBe(true);
  });
});

describe('guests', () => {
  const hung = (venue: 'gallery' | 'museum', seed: number) => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue, seed });
    for (const w of offers(s).slice(0, 4)) {
      s = run(s, { type: 'buyArtwork', artworkId: w.id });
      s = show(s, w.id);
    }
    return s;
  };

  it('taste follows likes and dislikes', () => {
    const s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 1 });
    const g = s.guests['g-edmund'];
    const fake = (tags: string[]) => ({ ...Object.values(s.artists)[0], tags });
    const work = { id: 'w', artistId: 'a', title: 't', value: 1000, price: 1000 } as never;
    expect(tasteScore(g, work, fake(g.likes))).toBeGreaterThan(tasteScore(g, work, fake(g.dislikes)));
  });

  it('visit, react, and learn what they like', () => {
    let s = hung('gallery', 3);
    s = days(s, 14);
    const visited = Object.values(s.guests).filter((g) => g.visits > 0);
    expect(visited.length).toBeGreaterThan(2);
    expect(visited.some((g) => g.knownLikes.length + g.knownDislikes.length > 0)).toBe(true);
    expect(visited.some((g) => g.affinity !== 0)).toBe(true);
    expect(s.feed.some((f) => f.kind === 'guest' && f.guestId)).toBe(true);
  });

  it('guest visits stay deterministic for a seed', () => {
    const play = () => days(hung('museum', 9), 10);
    expect(play().guests).toEqual(play().guests);
  });

  it('timelines start at the door and end back there', () => {
    let s = hung('gallery', 5);
    for (let i = 0; i < 40 && !s.visits.length; i++) s = run(s, { type: 'tick', hours: 1 });
    const v = s.visits[0];
    expect(v).toBeDefined();
    const segs = visitTimeline(v, s.floor);
    expect(segs[0].start).toBe(v.start);
    expect(segs[0].from).toEqual(segs[segs.length - 1].to);
    expect(poseAt(segs, v.start + 0.01)).not.toBeNull();
  });
});

describe('paintings', () => {
  it('market offers real, unique paintings with their own tags', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 2 });
    const seen: string[] = [];
    for (let d = 0; d < 20; d++) {
      const imgs = offers(s).map((w) => w.image).filter(Boolean) as string[];
      expect(new Set(imgs).size).toBe(imgs.length);
      seen.push(...imgs);
      s = days(s, 1);
    }
    expect(new Set(seen).size).toBeGreaterThan(15);
    const tagged = Object.values(s.artworks).find((w) => w.tags?.length);
    if (tagged) expect(workTags(tagged, s.artists[tagged.artistId])).toEqual(expect.arrayContaining(tagged.tags!));
  });
});

describe('one person per visitor', () => {
  for (const venue of ['gallery', 'museum'] as const) {
    it(`every ${venue} visitor counted walks in`, () => {
      let s = createNewGame({ name: 'x', difficulty: 'easy', venue, seed: 21 });
      for (const w of offers(s).slice(0, 4)) {
        s = run(s, { type: 'buyArtwork', artworkId: w.id });
        s = show(s, w.id);
      }
      s = days(s, 1);
      s = run(s, { type: 'tick', hours: TIME.ticksPerDay - s.tick });
      expect(s.tick).toBe(0);
      const dayStart = (s.day - 1) * TIME.ticksPerDay;
      const seen = new Set<string>();
      for (let h = 0; h < TIME.ticksPerDay - 1; h++) {
        s = run(s, { type: 'tick', hours: 1 });
        for (const v of s.visits) if (v.start >= dayStart) seen.add(`${v.guestId}@${v.start}`);
      }
      expect(s.today.visitors).toBeGreaterThan(3);
      expect(seen.size).toBe(s.today.visitors);
    });
  }
});

describe('around the clock', () => {
  it('stays open overnight, quiet at night and busy in the afternoon', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'museum', seed: 8 });
    for (const w of offers(s).slice(0, 4)) {
      s = run(s, { type: 'buyArtwork', artworkId: w.id });
      s = show(s, w.id);
    }
    s = run(s, { type: 'tick', hours: TIME.ticksPerDay - s.tick });
    let night = 0;
    let afternoon = 0;
    for (let d = 0; d < 5; d++) {
      for (let h = 0; h < TIME.ticksPerDay; h++) {
        const before = s.today.visitors;
        s = run(s, { type: 'tick', hours: 1 });
        if (h < TIME.ticksPerDay - 1) {
          const added = s.today.visitors - before;
          if (h >= 1 && h < 6) night += added;
          if (h >= 12 && h < 17) afternoon += added;
        }
      }
    }
    expect(afternoon).toBeGreaterThan(night * 5);
    expect(s.feed.some((f) => f.text.startsWith('Closing time'))).toBe(false);
  });

  it('visits carry on past midnight and still end at the door', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'museum', seed: 8 });
    for (const w of offers(s).slice(0, 4)) {
      s = run(s, { type: 'buyArtwork', artworkId: w.id });
      s = show(s, w.id);
    }
    let crossed = 0;
    for (let d = 0; d < 6; d++) {
      s = run(s, { type: 'tick', hours: TIME.ticksPerDay - s.tick });
      const midnight = (s.day - 1) * TIME.ticksPerDay;
      for (const v of s.visits) {
        if (v.start < midnight) crossed++;
        const segs = visitTimeline(v, s.floor);
        expect(segs[segs.length - 1].to).toEqual({ x: s.floor.entrance.x + 0.5, y: s.floor.entrance.y + 0.5 });
      }
    }
    expect(crossed).toBeGreaterThan(0);
  });
});

describe('gallery assistant', () => {
  it('works the floor by day and keeps watch by the door at night', () => {
    const s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 3 });
    const anims = new Set<string>();
    for (let h = 8; h < 21; h += 0.1) {
      const p = assistantPose(s, h);
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(s.floor.width);
      expect(p.y).toBeLessThan(s.floor.height);
      anims.add(p.anim);
    }
    expect(anims.size).toBeGreaterThan(2);
    expect(assistantPose(s, 4.2)).toEqual(assistantPose(s, 4.2));
    const a = assistantPose(s, 2.5);
    const b = assistantPose(s, 3.5);
    expect([a.x, a.y]).toEqual([b.x, b.y]);
    expect(['idle', 'radio']).toContain(a.anim);
  });
});

describe('sculpture and fibre art', () => {
  it('every catalogued work has an image and a known artist', () => {
    const files = new Set(Object.keys(import.meta.glob('../src/assets/sculpture/*.png')).map((f) => f.replace(/^.*\/|\.png$/g, '')));
    const ids = new Set(ARTIST_SEEDS.map((a) => a.id));
    expect(SCULPTURES.length).toBe(100);
    for (const w of SCULPTURES) {
      expect(files.has(w.image)).toBe(true);
      expect(ids.has(w.artistId)).toBe(true);
    }
  });

  it('sculpture stands on pedestals, hangings go on walls, paintings go anywhere', () => {
    expect(fitsOn({ form: 'sculpture' }, 'pedestal')).toBe(true);
    expect(fitsOn({ form: 'sculpture' }, 'wallHang')).toBe(false);
    expect(fitsOn({ form: 'hanging' }, 'wallHang')).toBe(true);
    expect(fitsOn({ form: 'hanging' }, 'pedestal')).toBe(false);
    expect(fitsOn({}, 'wallHang')).toBe(true);
    expect(fitsOn({}, 'pedestal')).toBe(true);
    expect(fitsOn({}, 'bench')).toBe(false);
  });

  it('sculptors put real pieces on the market, and they only go on a pedestal', () => {
    let s = createNewGame({ name: 'x', difficulty: 'easy', venue: 'gallery', seed: 5 });
    let w = offers(s).find((o) => o.form === 'sculpture');
    for (let d = 0; d < 30 && !w; d++) {
      s = days(s, 1);
      w = offers(s).find((o) => o.form === 'sculpture');
    }
    expect(w).toBeDefined();
    s = run(s, { type: 'buyArtwork', artworkId: w!.id });
    const wall = s.floor.fixtures.find((f) => f.kind === 'wallHang' && !f.artworkId)!;
    expect(dispatch(s, { type: 'setDisplay', artworkId: w!.id, display: true, fixtureId: wall.id }).ok).toBe(false);
    s = run(s, { type: 'setDisplay', artworkId: w!.id, display: true });
    const spot = s.floor.fixtures.find((f) => f.artworkId === w!.id)!;
    expect(spot.kind).toBe('pedestal');
  });
});
