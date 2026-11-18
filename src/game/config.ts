import type { Difficulty, EventKind, FixtureKind, HospitalityTier, VenueType } from './types';

// All tuning numbers live here so balancing never means hunting through systems.

export interface DifficultyConfig {
  label: string;
  startingCash: number;
  weeklyRent: number;
  weeklyStaff: number;
  /** Multiplies art asking prices. */
  artPriceMultiplier: number;
  /** Multiplies buyer and visitor interest. */
  demandMultiplier: number;
  startingReputation: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  easy: {
    label: 'Patron',
    startingCash: 250_000,
    weeklyRent: 2_000,
    weeklyStaff: 1_500,
    artPriceMultiplier: 0.85,
    demandMultiplier: 1.25,
    startingReputation: 25,
  },
  normal: {
    label: 'Curator',
    startingCash: 120_000,
    weeklyRent: 3_000,
    weeklyStaff: 2_000,
    artPriceMultiplier: 1,
    demandMultiplier: 1,
    startingReputation: 15,
  },
  hard: {
    label: 'Starving Artist',
    startingCash: 50_000,
    weeklyRent: 3_500,
    weeklyStaff: 2_500,
    artPriceMultiplier: 1.15,
    demandMultiplier: 0.8,
    startingReputation: 5,
  },
};

export interface VenueConfig {
  label: string;
  tagline: string;
  /** Extra weekly upkeep on top of rent/staff (museums need guards and climate control). */
  weeklyUpkeep: number;
  defaultTicketPrice: number;
}

export const VENUE: Record<VenueType, VenueConfig> = {
  gallery: {
    label: 'Gallery',
    tagline: 'Buy low, hang well, sell high.',
    weeklyUpkeep: 0,
    defaultTicketPrice: 0,
  },
  museum: {
    label: 'Museum',
    tagline: 'Build a collection people pay to see.',
    weeklyUpkeep: 1_000,
    defaultTicketPrice: 15,
  },
};

/** Cost per guest for each hospitality tier. */
export const WINE_PER_GUEST: Record<HospitalityTier, number> = { 0: 0, 1: 4, 2: 10, 3: 28 };
export const CHEESE_PER_GUEST: Record<HospitalityTier, number> = { 0: 0, 1: 3, 2: 8, 3: 20 };
export const TIER_LABEL: Record<HospitalityTier, string> = {
  0: 'None',
  1: 'Budget',
  2: 'Decent',
  3: 'Lavish',
};

export interface EventKindConfig {
  label: string;
  short: string;
  /** Fixed cost to put the event on (staff, setup, PR). */
  baseCost: number;
  /** Base crowd before reputation and fame. */
  baseAttendance: number;
  minFeatured: number;
  maxFeatured: number;
  /** How much the event moves reputation at full satisfaction. */
  prestige: number;
  /** Earliest booking: this many days from today. */
  minDaysAhead: number;
}

export const EVENT_KIND: Record<EventKind, EventKindConfig> = {
  opening: { label: 'Show opening', short: 'Opening', baseCost: 1_500, baseAttendance: 60, minFeatured: 1, maxFeatured: 1, prestige: 4, minDaysAhead: 2 },
  reception: { label: 'Reception', short: 'Reception', baseCost: 800, baseAttendance: 35, minFeatured: 0, maxFeatured: 2, prestige: 2, minDaysAhead: 1 },
  talk: { label: 'Artist talk', short: 'Talk', baseCost: 400, baseAttendance: 25, minFeatured: 1, maxFeatured: 1, prestige: 1, minDaysAhead: 1 },
  gala: { label: 'Gala', short: 'Gala', baseCost: 6_000, baseAttendance: 150, minFeatured: 2, maxFeatured: 4, prestige: 8, minDaysAhead: 5 },
};

/** The clock. The game runs in real time; the player can pause or speed it up. */
export const TIME = {
  /** Hour slots per day. Doors open at OPEN_HOUR, one slot per hour. */
  ticksPerDay: 12,
  openHour: 10,
  /** Slot when the day's event happens (7 PM). */
  eventTick: 9,
  /** Real seconds per game day at 1x. */
  secondsPerDay: 20,
  speeds: [0, 1, 2, 4] as const,
  /** Rent and staff are paid on this weekday (0 = Monday). Runs at end of day. */
  billsWeekday: 6,
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const,
};

export const RULES = {
  maxLedgerEntries: 400,
  historyDays: 28,
  maxFeed: 30,
  /** Offers on the market at once. */
  marketSize: 5,
  /** New offers that appear per day (when there is room). */
  newOffersPerDay: 1,
  offerLifetimeDays: 5,
  /** Relationship needed before an artist offers you works directly. */
  relationshipForOffers: 20,
  /** Days without contact before an artist starts to feel neglected. */
  neglectAfterDays: 21,
  /** Relationship lost per neglected day (times temperament). */
  neglectPerDay: 0.25,
  studioVisitCost: 300,
  studioVisitGain: 6,
  /** Museum: base daily walk-ins at reputation 0 with one work on display. */
  museumBaseVisitors: 45,
  /** Gallery: daily chance a displayed work sells when priced at value. */
  gallerySaleChance: 0.05,
  /** Cash floor before the game ends. */
  overdraftLimit: -5_000,
};

export interface FixtureConfig {
  label: string;
  cost: number;
  /** Holds an artwork. */
  display: boolean;
  /** Must sit against a back wall (x = 0 or y = 0). */
  wallOnly: boolean;
}

export const FIXTURE: Record<FixtureKind, FixtureConfig> = {
  wallHang: { label: 'Wall spot', cost: 500, display: true, wallOnly: true },
  pedestal: { label: 'Pedestal', cost: 1_200, display: true, wallOnly: false },
  bar: { label: 'Wine bar', cost: 2_500, display: false, wallOnly: false },
  bench: { label: 'Bench', cost: 300, display: false, wallOnly: false },
  plant: { label: 'Plant', cost: 150, display: false, wallOnly: false },
};

/** Effects of furniture. Hooks for later: lighting, guards, gift shop... */
export const FIXTURE_EFFECTS = {
  /** Each bar adds this much to event satisfaction. */
  barSatisfaction: 0.06,
  /** Each bench adds this share to museum visitors. */
  benchVisitorBonus: 0.03,
};

export const FLOOR_SIZE: Record<VenueType, { width: number; height: number }> = {
  gallery: { width: 8, height: 8 },
  museum: { width: 10, height: 10 },
};

/** Named guests: how they move and how much they matter. Durations are in game hours. */
export const GUESTS = {
  walkTilesPerHour: 3.2,
  lookHours: 0.9,
  reactHours: 0.6,
  actionHours: 0.7,
  chatHours: 1.1,
  /** Score thresholds for reactions (0..1). */
  impressedAt: 0.62,
  thinkAt: 0.38,
  /** Works a guest looks at per visit (critics look at more). */
  worksPerVisit: 3,
  /** Last hour slot a guest will walk in (doors close at the end of the day). */
  lastArrivalTick: 8,
  /** Daily decay of buzz from photos and posts. */
  buzzDecay: 0.85,
  /** Buzz from one post at full enthusiasm. */
  influencerBuzz: 30,
  photographerBuzz: 8,
  /** Reputation per review star away from 3. */
  reviewWeight: 1.4,
  harshReviewWeight: 2.2,
};
