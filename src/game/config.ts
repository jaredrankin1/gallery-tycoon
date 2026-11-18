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
  minWeeksAhead: number;
}

export const EVENT_KIND: Record<EventKind, EventKindConfig> = {
  opening: { label: 'Show opening', short: 'Opening', baseCost: 1_500, baseAttendance: 60, minFeatured: 1, maxFeatured: 1, prestige: 4, minWeeksAhead: 1 },
  reception: { label: 'Reception', short: 'Reception', baseCost: 800, baseAttendance: 35, minFeatured: 0, maxFeatured: 2, prestige: 2, minWeeksAhead: 1 },
  talk: { label: 'Artist talk', short: 'Talk', baseCost: 400, baseAttendance: 25, minFeatured: 1, maxFeatured: 1, prestige: 1, minWeeksAhead: 1 },
  gala: { label: 'Gala', short: 'Gala', baseCost: 6_000, baseAttendance: 150, minFeatured: 2, maxFeatured: 4, prestige: 8, minWeeksAhead: 2 },
};

export const RULES = {
  maxLedgerEntries: 400,
  maxReports: 52,
  /** Offers on the market each week. */
  marketSize: 4,
  offerLifetimeWeeks: 2,
  /** Relationship needed before an artist offers you works directly. */
  relationshipForOffers: 20,
  /** Weeks without contact before an artist starts to feel neglected. */
  neglectAfterWeeks: 4,
  studioVisitCost: 300,
  studioVisitGain: 6,
  /** Museum: base weekly walk-ins at reputation 0 with one work on display. */
  museumBaseVisitors: 120,
  /** Gallery: weekly chance a displayed work sells when priced at value. */
  gallerySaleChance: 0.12,
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
