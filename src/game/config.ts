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
    defaultTicketPrice: 20,
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
  /** One slot per hour, midnight to midnight. The clock never stops: no closing, no jump to morning. */
  ticksPerDay: 24,
  /** Hour shown for tick 0. */
  openHour: 0,
  /** Hour a new game starts. */
  startTick: 10,
  /** Hour the day's event happens (7 PM). */
  eventTick: 19,
  /** Real seconds per game hour at 1x, in the daytime. */
  secondsPerHour: 1.6,
  /** Night hours (see isNight) pass this many times faster: it's quiet, nothing to watch. */
  nightSpeedup: 3,
  speeds: [0, 1, 2, 4] as const,
  /** Rent and staff are paid on this weekday (0 = Monday). Runs at end of day. */
  billsWeekday: 6,
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const,
};

/**
 * How busy each hour is, midnight to 11 PM. A day's visitors are spread over
 * the hours in proportion: dead at night, a lunchtime bump, busy afternoons.
 */
const TRAFFIC_WEIGHTS = [0.02, 0.01, 0.01, 0.01, 0.01, 0.02, 0.05, 0.15, 0.35, 0.6, 0.9, 1.1, 1.3, 1.3, 1.25, 1.3, 1.35, 1.3, 1.15, 1.0, 0.8, 0.5, 0.25, 0.08];
const TRAFFIC_SUM = TRAFFIC_WEIGHTS.reduce((a, b) => a + b, 0);
/** Share of a day's visitors who arrive during this hour (0..23). Sums to 1. */
export const trafficShare = (tick: number) => TRAFFIC_WEIGHTS[((tick % 24) + 24) % 24] / TRAFFIC_SUM;
/** Hours the room is dark and empty, and the clock runs faster. */
export const isNight = (hour: number) => hour >= 22 || hour < 7;

export const RULES = {
  maxLedgerEntries: 400,
  historyDays: 28,
  maxFeed: 30,
  /** Offers on the market at once. */
  marketSize: 5,
  /** New offers that appear per day (when there is room). */
  newOffersPerDay: 2,
  offerLifetimeDays: 3,
  /** Relationship needed before an artist offers you works directly. */
  relationshipForOffers: 20,
  /** Days without contact before an artist starts to feel neglected. */
  neglectAfterDays: 21,
  /** Relationship lost per neglected day (times temperament). */
  neglectPerDay: 0.25,
  studioVisitCost: 300,
  studioVisitGain: 6,
  /** Museum: base daily walk-ins at reputation 0 with one work on display. */
  museumBaseVisitors: 13,
  /** Gallery: scales everyone who wanders in to look (sales don't depend on it). */
  galleryFootfall: 0.5,
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
  walkTilesPerHour: 6,
  lookHours: 0.45,
  reactHours: 0.3,
  actionHours: 0.5,
  chatHours: 0.8,
  /** Score thresholds for reactions (0..1). */
  impressedAt: 0.62,
  thinkAt: 0.38,
  /** Works a guest looks at per visit (critics look at more). */
  worksPerVisit: 3,
  /** Last hour slot a guest will walk in (doors close at the end of the day). */
  /** Daily decay of buzz from photos and posts. */
  buzzDecay: 0.85,
  /** Buzz from one post at full enthusiasm. */
  influencerBuzz: 30,
  photographerBuzz: 8,
  /** Reputation per review star away from 3. */
  reviewWeight: 1.4,
  harshReviewWeight: 2.2,
};

// ---- Artist careers ------------------------------------------------------------

/** Career stages by fame. A step up revalues every work of theirs you own. */
export const CAREER_STAGES = [
  { min: 0, label: 'Unknown' },
  { min: 20, label: 'Emerging' },
  { min: 40, label: 'Established' },
  { min: 60, label: 'Acclaimed' },
  { min: 80, label: 'Blue-chip' },
] as const;

export const CAREER = {
  /** Potential is fame at the start plus a roll in this range (hidden until scouted). */
  potentialRoll: [-20, 45] as [number, number],
  /** Studio visits it takes to read an artist's potential. */
  visitsToScout: 2,
  /** Share of the gap to potential closed each day. Patronage doubles it. */
  driftToPotential: 0.005,
  /** Daily chance of a breakout for an artist well below their potential. */
  breakoutChance: 0.004,
  breakoutGap: 25,
  breakoutFame: 12,
  /** Daily chance a hyped artist (fame well above potential) puts out a flop. */
  flopChance: 0.004,
  flopFame: 8,
  /** Fame from being featured at an event, times the event's prestige and how well it went. */
  eventFame: 0.6,
  /** Fame from a sale, and extra when it sold at or above value. */
  saleFame: 0.4,
  premiumSaleFame: 0.4,
  /** Fame per critic review star away from three, for each artist they looked at. */
  pressFame: 0.6,
};

// ---- Patronage -----------------------------------------------------------------

export const PATRONAGE = {
  /** Most artists you can sponsor at once. */
  slots: 3,
  /** Fair weekly stipend as a share of what one of their works is worth. */
  stipendShare: 0.35,
  tiers: {
    modest: { label: 'Modest', mult: 0.7, speed: 0.75, formTarget: -15, weeklyRelationship: -2 },
    fair: { label: 'Fair', mult: 1, speed: 1, formTarget: 0, weeklyRelationship: 1 },
    generous: { label: 'Generous', mult: 1.4, speed: 1.3, formTarget: 12, weeklyRelationship: 3 },
  },
  /** Relationship needed before they'll take your money. */
  minRelationship: 10,
  /** Daily chance of a delivery at a fair stipend and average form. */
  deliveryChance: 1 / 8,
  /** Fewest days between two deliveries. */
  minDaysBetween: 2,
  /** Relationship lost when you cut their stipend or drop them. */
  cutPenalty: 6,
  dropPenalty: 10,
  /** Rivals only bother with artists at least this famous. */
  rivalMinFame: 18,
  /** Weekly chance a rival starts courting an underpaid or unhappy artist. */
  courtChanceModest: 0.45,
  courtChanceUnhappy: 0.25,
  /** Below this relationship they listen to rivals. */
  loyalAt: 25,
  /** Days a poached artist stays with the rival. */
  rivalLockDays: 28,
  /** Daily chance an artist moves into a new creative phase. */
  phaseChance: 1 / 30,
};

export const RIVAL_GALLERIES = ['Halvorsen & Pike', 'The Glasshouse', 'Okonkwo Fine Art', 'Studio Meridian', 'Vane Contemporary'];

/** Tags an artist can drift into. Each one is also an exhibition theme. */
export const PHASE_TAGS = ['moody', 'colorful', 'experimental', 'quiet', 'weird', 'minimal', 'retro', 'fantasy', 'portrait', 'landscape'];

// ---- Exhibitions ---------------------------------------------------------------

/** Themes you can hang a show around, keyed by tag. */
export const EXHIBITION_THEMES: { tag: string; title: string }[] = [
  { tag: 'portrait', title: 'Faces in the Crowd' },
  { tag: 'landscape', title: 'Elsewhere' },
  { tag: 'moody', title: 'After Dark' },
  { tag: 'colorful', title: 'Full Spectrum' },
  { tag: 'quiet', title: 'Stillness' },
  { tag: 'experimental', title: 'New Directions' },
  { tag: 'weird', title: 'Strange Days' },
  { tag: 'fantasy', title: 'Otherworlds' },
  { tag: 'pop', title: 'Pop Life' },
  { tag: 'retro', title: 'Tomorrow, Yesterday' },
  { tag: 'figurative', title: 'The Human Figure' },
  { tag: 'classic', title: 'Old Hands' },
  { tag: 'minimal', title: 'Less' },
];

export const EXHIBITION = {
  /** Days a show runs. */
  days: 7,
  /** On-theme works on the walls needed to open. */
  minWorks: 3,
  baseCost: 1_500,
  perWorkCost: 150,
  /** Crowd multiplier at a perfect score is 1 + this. */
  crowdBoost: 0.5,
  /** Sale chance multiplier for on-theme works at a perfect score is 1 + this. */
  saleBoost: 1,
  /** Event turnout bonus when a featured artist is in the show. */
  eventBoost: 0.4,
  /** Reputation per opening-review star away from three. */
  reviewWeight: 1.5,
  /** Fame per star for artists in the show (doubled for unknowns). */
  famePerStar: 0.6,
  historySize: 10,
  /** Penalty for repeating a theme from one of your last two shows. */
  repeatPenalty: 0.15,
};
