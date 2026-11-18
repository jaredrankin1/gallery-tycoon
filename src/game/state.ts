import { ARTIST_SEEDS } from '../data/artists';
import { DIFFICULTY, VENUE } from './config';
import type { Artist, Difficulty, GameState, Id, VenueType } from './types';
import { Rng } from './rng';
import { createFloor } from './systems/floor';
import { refreshMarket } from './systems/market';

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
    artists[seed.id] = { ...seed, relationship: seed.relationship ?? 0, lastContactWeek: 0 };
  }

  const state: GameState = {
    version: 1,
    name: opts.name.trim() || (opts.venue === 'museum' ? 'The New Museum' : 'Untitled Gallery'),
    difficulty: opts.difficulty,
    venue: opts.venue,
    week: 1,
    cash: diff.startingCash,
    reputation: diff.startingReputation,
    settings: { ticketPrice: VENUE[opts.venue].defaultTicketPrice, defaultMarkup: 1.3 },
    budget: { art: Math.round(diff.startingCash * 0.15), hospitality: 2_000 },
    artists,
    artworks: {},
    floor: createFloor(opts.venue),
    events: [],
    ledger: [],
    reports: [],
    rng: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
    nextId: 1,
    status: 'playing',
  };

  const rng = new Rng(state.rng);
  refreshMarket(state, rng);
  state.rng = rng.state;
  return state;
}

export function newId(state: GameState, prefix: string): Id {
  return `${prefix}-${state.nextId++}`;
}
