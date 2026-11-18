// Core data model. Everything in GameState is plain JSON so it can be saved,
// loaded, diffed and tested without any UI.

export type Difficulty = 'easy' | 'normal' | 'hard';
export type VenueType = 'gallery' | 'museum';

export type Id = string;

/** -100 (hostile) .. 0 (stranger) .. 100 (devoted) */
export type Relationship = number;

export interface Artist {
  id: Id;
  name: string;
  medium: string;
  style: string;
  bio: string;
  /** 0..100. Drives artwork value, attendance and buyer interest. */
  fame: number;
  /** How quickly the relationship moves, and how much neglect hurts. 0.5 = easygoing, 1.5 = touchy. */
  temperament: number;
  relationship: Relationship;
  /** Week the player last did something with this artist (for neglect decay). */
  lastContactWeek: number;
  /** Persona tags used by content/events, e.g. "loves-wine", "reclusive". */
  traits: string[];
}

export type ArtworkStatus = 'offered' | 'storage' | 'display' | 'sold';

export interface Artwork {
  id: Id;
  title: string;
  artistId: Id;
  /** Fair market value right now. */
  value: number;
  /** What the player paid (0 while still an offer). */
  acquiredFor: number;
  /** Asking price for an offer, or the player's list price on the gallery floor. */
  price: number;
  status: ArtworkStatus;
  /** Week an offer expires, or the week it was acquired/sold. */
  week: number;
}

export type EventKind = 'opening' | 'reception' | 'talk' | 'gala';

/** Tier 0 = none, 1 = boxed/cheap, 2 = decent, 3 = lavish. */
export type HospitalityTier = 0 | 1 | 2 | 3;

export interface HospitalityPlan {
  wine: HospitalityTier;
  cheese: HospitalityTier;
  /** Guests you are catering for. Real turnout can be higher or lower. */
  guests: number;
}

export interface ScheduledEvent {
  id: Id;
  kind: EventKind;
  week: number;
  featuredArtistIds: Id[];
  hospitality: HospitalityPlan;
  /** Locked in when booked so the books are predictable. */
  cost: number;
}

export interface EventResult {
  eventId: Id;
  kind: EventKind;
  week: number;
  attendance: number;
  catered: number;
  /** 0..1, how well food and wine matched the crowd. */
  satisfaction: number;
  reputationDelta: number;
  relationshipDeltas: Record<Id, number>;
  /** Artworks sold during the event (gallery). */
  soldArtworkIds: Id[];
  /** Ticket/door income during the event (museum). */
  income: number;
  /** Human-readable reasons, shown in the weekly report. */
  notes: string[];
}

export type LedgerCategory =
  | 'art'
  | 'hospitality'
  | 'events'
  | 'rent'
  | 'staff'
  | 'artist-care'
  | 'fit-out'
  | 'sales'
  | 'tickets';

export interface LedgerEntry {
  week: number;
  category: LedgerCategory;
  /** Positive = income, negative = expense. */
  amount: number;
  note: string;
}

export interface WeeklyReport {
  week: number;
  income: number;
  expenses: number;
  cashAfter: number;
  visitors: number;
  sales: Id[];
  events: EventResult[];
  notes: string[];
}

/** Player-set spending targets per week. Purely advisory for now; the books compare against them. */
export interface BudgetPlan {
  art: number;
  hospitality: number;
}

export interface VenueSettings {
  /** Museum only. */
  ticketPrice: number;
  /** Gallery only: list price as a multiple of value, used as the default for new works. */
  defaultMarkup: number;
}

// ---- Isometric floor plan -------------------------------------------------
// Grid coordinates: x runs down-right, y runs down-left on screen. The two back
// walls sit along x = 0 (left wall) and y = 0 (right wall). The renderer only
// reads this; game rules only ever talk in tiles, never pixels.

export type FixtureKind = 'wallHang' | 'pedestal' | 'bar' | 'bench' | 'plant';

export interface Fixture {
  id: Id;
  kind: FixtureKind;
  x: number;
  y: number;
  /** wallHang / pedestal hold one artwork each. */
  artworkId?: Id;
}

export interface FloorPlan {
  width: number;
  height: number;
  /** Tile the public walks in through (front edge). */
  entrance: { x: number; y: number };
  fixtures: Fixture[];
}

export interface GameState {
  version: 1;
  name: string;
  difficulty: Difficulty;
  venue: VenueType;
  week: number;
  cash: number;
  /** 0..100 */
  reputation: number;
  settings: VenueSettings;
  budget: BudgetPlan;
  artists: Record<Id, Artist>;
  artworks: Record<Id, Artwork>;
  floor: FloorPlan;
  events: ScheduledEvent[];
  ledger: LedgerEntry[];
  reports: WeeklyReport[];
  /** Seeded RNG state so a run is reproducible. */
  rng: number;
  nextId: number;
  status: 'playing' | 'bankrupt';
}
