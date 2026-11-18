import { ARTIST_SEEDS } from '../data/artists';
import { DIFFICULTY, VENUE } from './config';
import type { Artist, Difficulty, GameState, Id, VenueType } from './types';
import { Rng } from './rng';
import { createFloor } from './systems/floor';
import { GUEST_SEEDS } from '../data/guests';
import { refreshMarket } from './systems/market';
import { emptyDay } from './clock';
import { RULES, TIME } from './config';

export interface NewGameOptions {
  name: string;
  difficulty: Difficulty;
  venue: VenueType;
  seed?: number;
}

export function createNewGame(opts: NewGameOptions): GameState {
  const diff = DIFFICULTY[opts.difficulty];
  const artists: Record<Id, Artist> = {};
  for (const seed of ARTIST_SEEDS) {
    artists[seed.id] = { ...seed, relationship: seed.relationship ?? 0, lastContactDay: 0 };
  }

  const state: GameState = {
    version: 4,
    name: opts.name.trim() || (opts.venue === 'museum' ? 'The New Museum' : 'Untitled Gallery'),
    difficulty: opts.difficulty,
    venue: opts.venue,
    day: 1,
    tick: TIME.startTick,
    cash: diff.startingCash,
    reputation: diff.startingReputation,
    settings: { ticketPrice: VENUE[opts.venue].defaultTicketPrice, defaultMarkup: 1.3 },
    budget: { art: Math.round(diff.startingCash * 0.3), hospitality: 3_000 },
    artists,
    artworks: {},
    floor: createFloor(opts.venue),
    guests: Object.fromEntries(
      GUEST_SEEDS.map((g) => [g.id, { ...g, affinity: 0, visits: 0, lastVisitDay: 0, knownLikes: [], knownDislikes: [] }]),
    ),
    visits: [],
    buzz: 0,
    events: [],
    ledger: [],
    today: emptyDay(1),
    history: [],
    feed: [],
    feedSeq: 0,
    rng: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
    nextId: 1,
    status: 'playing',
  };

  const rng = new Rng(state.rng);
  refreshMarket(state, rng, RULES.marketSize);
  state.rng = rng.state;
  return state;
}

export function newId(state: GameState, prefix: string): Id {
  return `${prefix}-${state.nextId++}`;
}
