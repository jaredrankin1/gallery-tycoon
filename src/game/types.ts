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
  /** Day the player last did something with this artist (for neglect decay). */
  lastContactDay: number;
  /** Day of the last studio visit (one per day). */
  lastVisitDay?: number;
  /** Persona tags used by content/events, e.g. "loves-wine", "reclusive". */
  traits: string[];
  /** What their work is like. Guests' tastes are matched against these. */
  tags: string[];
  /** Where their career is heading, 0..100. Fame drifts toward it. Hidden until scouted. */
  potential: number;
  /** Studio visits so far. Enough of them reveal their potential. */
  studioVisits: number;
  /** 0..100: how good what they're making right now is. Drifts day to day. */
  form: number;
  /** Current creative phase: an extra tag on everything they make while it lasts. */
  phase?: string;
  /** Fame a week ago, for the trend arrow. */
  fameLastWeek: number;
  /** Set while you are their patron. */
  patron?: Patronage;
  /** Signed to a rival gallery: you can't take them on again until this day. */
  rivalUntil?: number;
}

export type StipendTier = 'modest' | 'fair' | 'generous';

/** A patronage deal: you pay a weekly stipend, they send you work now and then. */
export interface Patronage {
  tier: StipendTier;
  /** Weekly stipend, fixed when the deal is signed or changed. */
  stipend: number;
  since: number;
  /** Works delivered under this deal. */
  delivered: number;
  lastDeliveryDay: number;
  /** Day a rival gallery started courting them. Cleared once you win them back. */
  courtedDay?: number;
  courtedBy?: string;
}

/** painting: walls or an easel on a pedestal. sculpture: pedestals only. hanging: walls only, no frame. */
export type ArtForm = 'painting' | 'sculpture' | 'hanging';

/** offered: on a dealer's books. lot: in the next auction-house sale. */
export type ArtworkStatus = 'offered' | 'lot' | 'storage' | 'display' | 'sold';

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
  /** Day an offer expires, or the day it was acquired/sold. */
  day: number;
  /** Image key (src/assets/art or src/assets/sculpture). Missing = drawn procedurally. */
  image?: string;
  /** What kind of object it is. Missing = painting. */
  form?: ArtForm;
  /** Extra tags for this one work, on top of the artist's. */
  tags?: string[];
  /** How strong this piece is: a multiplier on the artist's going rate. Value follows fame. */
  grade: number;
  /** Delivered by an artist you sponsor. */
  commissioned?: boolean;
  /** How it came to you, when that's worth showing: your own collection, the family's, or won at auction. */
  source?: ArtSource;
  /** Taken off the floor by a thief (status is 'sold' so it can turn up on the market again). */
  stolen?: boolean;
}

export type ArtSource = 'personal' | 'family' | 'auction';

/** What you start the game owning. */
export type StartingCollection = 'none' | 'personal' | 'family';

// ---- Auctions: buying at an auction house's weekly sale ------------------------

export interface AuctionLot {
  artworkId: Id;
  /** The printed estimate. */
  low: number;
  high: number;
  /** Lowest hammer price the consignor will take. The auctioneer bids on their behalf up to it. */
  reserve: number;
  /** Current bid on the floor, 0 before anyone has bid. */
  bid: number;
  leader: 'you' | 'room' | null;
  /** The most the room will go to (hidden from the player). */
  roomMax: number;
  state: 'open' | 'won' | 'lost' | 'passed';
  /** Hammer price once it's settled. */
  hammer?: number;
  /** The auctioneer's last line, for the bidding panel. */
  call?: string;
}

export interface AuctionSale {
  id: Id;
  house: string;
  /** Bidding runs all of this day and closes at midnight. Lots are on view before. */
  day: number;
  lots: AuctionLot[];
}

// ---- Exhibitions: themed shows that run for a week -----------------------------

export type ExhibitionTheme = { kind: 'tag'; tag: string } | { kind: 'solo'; artistId: Id };

export interface Exhibition {
  id: Id;
  title: string;
  theme: ExhibitionTheme;
  startDay: number;
  /** Last day it runs. It comes down at the end of this day. */
  endDay: number;
  /** Synergy when it opened, 0..1. */
  openingScore: number;
  /** Critics' verdict on opening day, 1..5. */
  stars: number;
  visitors: number;
  sales: number;
  revenue: number;
}

export interface ExhibitionSummary {
  title: string;
  theme: ExhibitionTheme;
  startDay: number;
  endDay: number;
  stars: number;
  visitors: number;
  sales: number;
  revenue: number;
}

/** auction: you host a sale of collectors' consignments and keep a commission. */
export type EventKind = 'opening' | 'reception' | 'talk' | 'gala' | 'auction';

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
  /** Happens on the evening of this day. */
  day: number;
  featuredArtistIds: Id[];
  hospitality: HospitalityPlan;
  /** Locked in when booked so the books are predictable. */
  cost: number;
}

export interface EventResult {
  eventId: Id;
  kind: EventKind;
  day: number;
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
  /** Human-readable reasons, shown in the feed. */
  notes: string[];
}

export type LedgerCategory =
  | 'art'
  | 'hospitality'
  | 'events'
  | 'rent'
  | 'staff'
  | 'artist-care'
  | 'patronage'
  | 'exhibitions'
  | 'fit-out'
  | 'sales'
  | 'tickets'
  | 'donations'
  | 'shop'
  | 'auctions';

export interface LedgerEntry {
  day: number;
  category: LedgerCategory;
  /** Positive = income, negative = expense. */
  amount: number;
  note: string;
}

/** One finished day, for charts. */
export interface DayReport {
  day: number;
  income: number;
  expenses: number;
  visitors: number;
  sales: number;
}

export type FeedKind = 'staff' | 'sale' | 'tickets' | 'shop' | 'event' | 'artist' | 'delivery' | 'guest' | 'review' | 'bills' | 'market' | 'warn';

/** Something worth telling the player about, as it happens. The UI shows new ones as toasts. */
export interface FeedItem {
  id: number;
  day: number;
  kind: FeedKind;
  text: string;
  amount?: number;
  /** Guest it's about, for showing their portrait. */
  guestId?: Id;
  /** Tile to pop a floating label over, if it happened somewhere on the floor. */
  at?: { x: number; y: number };
  /** Floating label and sound only, no toast (the gift shop's steady trickle of sales). */
  quiet?: boolean;
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

export type FixtureKind = 'wallHang' | 'pedestal' | 'bar' | 'bench' | 'plant' | 'shop';

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

// ---- Gift shop ---------------------------------------------------------------

export type MerchKind = 'postcard' | 'print' | 'keychain' | 'tshirt';

export interface MerchLine {
  /** Units on the shelf. Sales stop at zero. */
  stock: number;
  /** What the player charges for one. */
  price: number;
  /** Units sold today and in total, for the shop panel. */
  soldToday: number;
  soldTotal: number;
}

export interface GiftShop {
  lines: Record<MerchKind, MerchLine>;
  /** Overnight, top up any line that is running low by one wholesale batch. */
  autoRestock: boolean;
  /** Takings today, shown on the counter and in the summary at midnight. */
  takingsToday: number;
}

// ---- Guests: named visitors with tastes -------------------------------------

export type GuestRole = 'collector' | 'critic' | 'influencer' | 'student' | 'regular';

/** Things guests do on the floor. Each has a sprite animation of the same name. */
export type GuestAnim = 'idle' | 'walk' | 'look' | 'think' | 'impressed' | 'disapprove' | 'photo' | 'notes' | 'chat';
export type Reaction = 'impressed' | 'think' | 'disapprove';

export interface Guest {
  id: Id;
  name: string;
  /** Short label shown under the name, e.g. "Collector". */
  title: string;
  role: GuestRole;
  bio: string;
  /** Sprite sheet name in src/assets/sprites. */
  sprite: string;
  likes: string[];
  dislikes: string[];
  /** Personality hooks: photographer, note-taker, chatty, buyer, wine-lover, cheese-snob, fame-chaser, freeloader, hard-to-please. */
  traits: string[];
  /** Most they'll pay for one work (collectors, regulars who buy). 0 = never buys. */
  budget: number;
  /** Highest price/value ratio they'll accept. */
  priceTolerance: number;
  /** Won't visit until your reputation reaches this. */
  minReputation: number;
  /** Typical visits per week when they like you. */
  visitsPerWeek: number;
  /** Signature lines, picked by mood. */
  lines: { love: string[]; meh: string[]; hate: string[] };
  /** -100 .. 100: how they feel about your place. */
  affinity: number;
  visits: number;
  lastVisitDay: number;
  /** Tags you have learned they like or dislike by watching them. */
  knownLikes: string[];
  knownDislikes: string[];
  /** Their last verdict, shown in the Guests panel. */
  lastWords?: string;
  /** Favourite work they've seen here. */
  favoriteArtworkId?: Id;
}

/**
 * How a visitor feels right now. Each axis runs -1 .. 1 between two poles:
 * sad/happy, bored/amused, blasé/inspired, baffled/enlightened (do they "get"
 * the work?) and browsing/covetous (do they want to own something?).
 */
export interface Mood {
  happy: number;
  amused: number;
  inspired: number;
  enlightened: number;
  covetous: number;
}
export type MoodAxis = keyof Mood;

/** One planned stop on a visit. Positions are tile coordinates (floats are tile centres). */
export interface VisitStep {
  artworkId: Id;
  /** Where they stand. */
  at: { x: number; y: number };
  /** Face screen-left (true) or screen-right. */
  faceLeft: boolean;
  score: number;
  reaction: Reaction;
  action?: 'photo' | 'notes';
  /** How this work changes their mood, applied once they've reacted to it. */
  mood?: Mood;
  /** Other people already looking at this work when they got there. */
  crowd?: number;
}

export interface GuestVisit {
  guestId: Id;
  /** Absolute game hour they walked in (fractional allowed). See absHour(). */
  start: number;
  /** Absolute hour they're gone. */
  end: number;
  steps: VisitStep[];
  /** Guest they'll stop and talk to at the end, if any. */
  chatWith?: Id;
  /** Came for tonight's event. */
  event?: boolean;
  /** Set for an ordinary member of the public (not one of the named guests): which sprite, and which recolour. */
  look?: { sprite: string; variant: number };
  /** A member of the public's name (named guests use Guest.name). */
  name?: string;
  /** How they felt walking in. Steps add to it as they go (see moodAt). */
  mood?: Mood;
  /** They cut the visit short, and why. */
  leftEarly?: 'bored' | 'crowded' | 'unhappy';
}

// ---- Staff: Marisol hangs new arrivals when auto-hang is on ----------------

/**
 * One piece Marisol is putting out. The placement is already made in the
 * floor plan when the job is created; these times only say when the renderer
 * shows her fetch it from the door, carry it over and hang it.
 */
export interface HangJob {
  artworkId: Id;
  fixtureId: Id;
  /** Piece she took down to make room. Shown on the fixture until the swap. */
  evictedId?: Id;
  /** She had the fixture built for this piece. Hidden until she gets there. */
  built?: boolean;
  /** Absolute hours (see absHour). */
  start: number;
  /** Reaches the door to collect it. */
  pickupAt: number;
  /** Leaves the door carrying it. */
  carryAt: number;
  /** Reaches the spot. */
  arriveAt: number;
  /** The piece goes up. */
  hangAt: number;
  end: number;
  /** Where she was when the job started. */
  from: { x: number; y: number };
  door: { x: number; y: number };
  /** Where she stands to hang it, and which way she faces. */
  at: { x: number; y: number };
  faceLeft: boolean;
}

/** Hireable staff on top of Marisol. See data/staff.ts for the candidates and systems/staff.ts for what each does. */
export type StaffRole = 'security' | 'appraiser' | 'curator' | 'intern';

export interface Hire {
  /** Which candidate (data/staff.ts). */
  candidateId: Id;
  /** Day they started. */
  since: number;
  /** Wages earned since the last payday, paid with the weekly bills (or on leaving). */
  owed: number;
}

export interface StaffState {
  /** Who you've taken on, by role. One per role. */
  hired?: Partial<Record<StaffRole, Hire>>;
  /** Marisol places new art herself: makes room, builds a spot if she can, hangs it. */
  autoHang: boolean;
  /** Works she has already dealt with (or that were already here when auto-hang came on). */
  seen: Id[];
  /** Works the player took down or moved aside. She leaves these in storage. */
  parked?: Id[];
  /** Last day she said the backlog is waiting on cash, so she says it once a day. */
  backlogNoteDay?: number;
  jobs: HangJob[];
}

export interface GameState {
  version: 5;
  name: string;
  difficulty: Difficulty;
  venue: VenueType;
  /** Day number, starting at 1. Day 1 is a Monday. */
  day: number;
  /** Hour slot within the day, 0 .. TICKS_PER_DAY - 1. */
  tick: number;
  cash: number;
  /** 0..100 */
  reputation: number;
  settings: VenueSettings;
  budget: BudgetPlan;
  artists: Record<Id, Artist>;
  artworks: Record<Id, Artwork>;
  floor: FloorPlan;
  guests: Record<Id, Guest>;
  /** Guests in the building right now. */
  visits: GuestVisit[];
  /** Word of mouth from photos and posts. Extra daily visitors; decays every day. */
  buzz: number;
  events: ScheduledEvent[];
  /** The themed show on right now, if any. */
  exhibition: Exhibition | null;
  /** Past shows, newest last. */
  exhibitionHistory: ExhibitionSummary[];
  /** Postcards, prints, keychains and t-shirts. Sells only once a shop counter is built. */
  shop: GiftShop;
  ledger: LedgerEntry[];
  /** Running totals for the day in progress. */
  today: DayReport;
  history: DayReport[];
  feed: FeedItem[];
  feedSeq: number;
  /** Seeded RNG state so a run is reproducible. */
  rng: number;
  nextId: number;
  /** The auction house's next (or current) sale. Missing on older saves until migrate() adds it. */
  auction?: AuctionSale;
  /** Day of your last auction night, for spacing them out. */
  hostedAuctionDay?: number;
  /** Missing on older saves; see ensureStaff(). */
  staff?: StaffState;
  status: 'playing' | 'bankrupt';
}
