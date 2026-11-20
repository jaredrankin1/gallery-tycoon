import { describe, expect, it } from 'vitest';
import { createNewGame, dispatch, startTutorial, TUTORIAL, type Action, type GameState } from '../src/game';
import { migrate } from '../src/game/save';
import { TUTORIAL_STEPS } from '../src/ui/Tutorial';

const run = (s: GameState, a: Action) => {
  const r = dispatch(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const fresh = () => {
  const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 3, collection: 'personal' });
  startTutorial(s);
  return s;
};
const ui = { sheet: null, build: null, building: false, selected: null, draft: null, guest: null, peopleTab: 'guests', artTab: 'market', talk: false } as const;

describe("Marisol's opening-week tour", () => {
  it('has as many tasks as the game expects', () => {
    expect(TUTORIAL_STEPS.length).toBe(TUTORIAL.steps);
    expect(new Set(TUTORIAL_STEPS.map((s) => s.id)).size).toBe(TUTORIAL_STEPS.length);
  });

  it('starts on the first task and walks through every one', () => {
    let s = fresh();
    expect(s.tutorial).toEqual({ status: 'on', step: 0, rewarded: false, skipped: 0 });
    for (let i = 1; i < TUTORIAL.steps; i++) {
      s = run(s, { type: 'tutorial', to: 'next' });
      expect(s.tutorial!.step).toBe(i);
      expect(s.tutorial!.status).toBe('on');
    }
  });

  it('pays the welcome gift once, on finishing, and never on a replay', () => {
    let s = fresh();
    const cash = s.cash;
    const rep = s.reputation;
    for (let i = 0; i < TUTORIAL.steps; i++) s = run(s, { type: 'tutorial', to: 'next' });
    expect(s.tutorial!.status).toBe('done');
    expect(s.cash).toBe(cash + TUTORIAL.rewardCash);
    expect(s.reputation).toBeCloseTo(rep + TUTORIAL.rewardReputation);
    expect(s.ledger.at(-1)!.category).toBe('donations');

    s = run(s, { type: 'tutorial', to: 'start' });
    expect(s.tutorial).toMatchObject({ status: 'on', step: 0 });
    for (let i = 0; i < TUTORIAL.steps; i++) s = run(s, { type: 'tutorial', to: 'next' });
    expect(s.cash).toBe(cash + TUTORIAL.rewardCash);
  });

  it('passing over too many tasks means no gift', () => {
    let s = fresh();
    const cash = s.cash;
    for (let i = 0; i < TUTORIAL.steps; i++) s = run(s, { type: 'tutorial', to: 'next', passed: i <= TUTORIAL.maxPassedForReward });
    expect(s.tutorial!.status).toBe('done');
    expect(s.cash).toBe(cash);
  });

  it('skipping ends it with no gift, and further taps do nothing', () => {
    let s = fresh();
    const cash = s.cash;
    s = run(s, { type: 'tutorial', to: 'next' });
    s = run(s, { type: 'tutorial', to: 'skip' });
    expect(s.tutorial!.status).toBe('skipped');
    s = run(s, { type: 'tutorial', to: 'next' });
    expect(s.tutorial!.step).toBe(1);
    expect(s.cash).toBe(cash);
  });

  it('a game started without the tour has none, and old saves load without one', () => {
    const s = createNewGame({ name: 'x', difficulty: 'normal', venue: 'gallery', seed: 3 });
    expect(s.tutorial).toBeUndefined();
    expect(migrate(JSON.parse(JSON.stringify(s)))!.tutorial).toBeUndefined();
  });

  it('notices a dealer purchase on the buy task, and not before', () => {
    const s = fresh();
    const step = TUTORIAL_STEPS.find((t) => t.id === 'buy')!;
    // Base is measured as the task starts; the TutorialCard does this itself.
    const offer = Object.values(s.artworks).find((w) => w.status === 'offered' && w.price < s.cash)!;
    const before = run(s, { type: 'tutorial', to: 'next' });
    const base = { display: 0, spots: 0, owned: Object.values(before.artworks).filter((w) => w.status !== 'offered' && w.status !== 'lot').length, booked: 0, staff: 0, calls: 0, callOpen: false, shops: 0 };
    expect(step.done!({ state: before, ui: { ...ui } }, base)).toBe(false);
    const after = run(before, { type: 'buyArtwork', artworkId: offer.id });
    expect(step.done!({ state: after, ui: { ...ui } }, base)).toBe(true);
  });

  it('notices a gift shop counter going in', () => {
    const s = fresh();
    const step = TUTORIAL_STEPS.find((t) => t.id === 'shop')!;
    const base = { display: 0, spots: 0, owned: 0, booked: 0, staff: 0, calls: 0, callOpen: false, shops: s.floor.fixtures.filter((f) => f.kind === 'shop').length };
    expect(step.done!({ state: s, ui: { ...ui } }, base)).toBe(false);
    let placed: GameState | null = null;
    for (let x = 0; x < s.floor.width && !placed; x++)
      for (let y = 0; y < s.floor.height && !placed; y++) {
        const r = dispatch(s, { type: 'placeFixture', kind: 'shop', x, y });
        if (r.ok) placed = r.state;
      }
    expect(placed).not.toBeNull();
    expect(step.done!({ state: placed!, ui: { ...ui } }, base)).toBe(true);
  });
});
