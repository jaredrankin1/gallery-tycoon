import { ARTIST_SEEDS, type ArtistSeed } from '../data/artists';
import { DIFFICULTY, VENUE } from './config';
import type { Artist, Difficulty, GameState, Id, VenueType } from './types';
import { clamp, Rng } from './rng';
import { createFloor } from './systems/floor';
import { GUEST_SEEDS } from '../data/guests';
import { refreshMarket } from './systems/market';
import { emptyDay } from './clock';
import { CAREER, RULES, TIME } from './config';

export interface NewGameOptions {
  name: string;
  difficulty: Difficulty;
  venue: VenueType;
  seed?: number;
}

export function createNewGame(opts: NewGameOptions): GameState {
  const diff = DIFFICULTY[opts.difficulty];
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  // Each run rolls fresh potentials, so who breaks out is never the same twice.
  const careerRng = new Rng(seed ^ 0x5eed);
  const artists: Record<Id, Artist> = {};
  for (const a of ARTIST_SEEDS) artists[a.id] = newArtist(a, careerRng);

  const state: GameState = {
    version: 5,
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
    exhibition: null,
    exhibitionHistory: [],
    ledger: [],
    today: emptyDay(1),
    history: [],
    feed: [],
    feedSeq: 0,
    rng: seed,
    nextId: 1,
    status: 'playing',
  };

  const rng = new Rng(state.rng);
  refreshMarket(state, rng, RULES.marketSize);
  state.rng = rng.state;
  return state;
}

export function newArtist(a: ArtistSeed, rng: Rng): Artist {
  const [lo, hi] = CAREER.potentialRoll;
  return {
    ...a,
    relationship: a.relationship ?? 0,
    lastContactDay: 0,
    potential: Math.round(clamp(a.fame + rng.range(lo, hi), 5, 98)),
    studioVisits: 0,
    form: Math.round(rng.range(35, 65)),
    fameLastWeek: a.fame,
  };
}

export function newId(state: GameState, prefix: string): Id {
  return `${prefix}-${state.nextId++}`;
}
