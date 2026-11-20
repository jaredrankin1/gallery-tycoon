import type { Difficulty, EventKind, FixtureKind, HospitalityTier, MerchKind, StaffRole, VenueType } from './types';

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
  auction: { label: 'Auction night', short: 'Auction', baseCost: 2_500, baseAttendance: 45, minFeatured: 0, maxFeatured: 0, prestige: 3, minDaysAhead: 3 },
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
  /** Dealers are the priciest way to buy: asking price is value times this (before friend discounts). */
  dealerMarkup: 1.3,
};

// ---- Starting collections ------------------------------------------------------

export interface CollectionConfig {
  label: string;
  note: string;
  /** Works you start with. */
  works: number;
  /** Artists the works are drawn from, by fame. */
  fame: [number, number];
  /** Strength of the pieces (grade range). */
  grade: [number, number];
  /** Starting cash multiplier: the family's lawyers and the estate take their share. */
  cash: number;
}

export const COLLECTION: Record<'personal' | 'family', CollectionConfig> = {
  personal: {
    label: 'Your own collection',
    note: 'A couple of pieces you bought over the years. You keep all your cash.',
    works: 2,
    fame: [10, 45],
    grade: [0.85, 1.1],
    cash: 1,
  },
  family: {
    label: 'The family collection',
    note: 'A storeroom of inherited work, a big name or two among it. Death duties take half your cash.',
    works: 8,
    fame: [15, 80],
    grade: [0.9, 1.3],
    cash: 0.5,
  },
};

// ---- Auctions --------------------------------------------------------------------

export const AUCTION = {
  houses: ['Harrow & Finch', 'Calloway Rooms', 'Marchetti & Sons', 'The Lindqvist Saleroom'],
  /** Weekday of the sale (0 = Monday). */
  weekday: 3,
  lots: 5,
  /** Lots lean toward established names: artists below this fame are rarely consigned. */
  minFame: 15,
  /** Estimate as a share of value. */
  estimate: [0.8, 1.2] as [number, number],
  /** Reserve as a share of the low estimate. */
  reserve: 0.8,
  /** Bidding opens at this share of the low estimate. */
  opening: 0.5,
  /** The room's ceiling as a share of value. Below 1 on average: auctions are where bargains are. */
  room: [0.55, 1.3] as [number, number],
  /** Buyer's premium on top of the hammer price. */
  buyersPremium: 0.15,
};

/** Bid increments, auction-house style. */
export function bidIncrement(bid: number): number {
  return bid < 2_000 ? 100 : bid < 10_000 ? 250 : bid < 25_000 ? 500 : bid < 100_000 ? 1_000 : 5_000;
}

/** Hosting an auction night: collectors consign work, you keep a commission on what sells. */
export const HOSTED_AUCTION = {
  /** Lots at reputation 0, plus one per this much reputation. */
  baseLots: 4,
  repPerLot: 15,
  maxLots: 10,
  /** Your cut of each hammer price (seller's commission plus your share of the premium). */
  commission: 0.12,
  /** Days between two auction nights: collectors need time to consign. */
  minDaysBetween: 7,
  /** Hammer as a share of the lot's value, before the room's mood. */
  hammer: [0.6, 1.25] as [number, number],
  /** Below this share of value the consignor's reserve isn't met and the lot goes unsold. */
  reserve: 0.7,
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
  shop: { label: 'Gift shop', cost: 2_500, display: false, wallOnly: false },
};

/** Marisol's auto-hang. Durations in game hours. */
export const AUTO_HANG = {
  /** She never builds a wall spot or pedestal if it would leave less than this... */
  cashReserve: 2_000,
  /** ...or less than this many weeks of bills (rent, staff, upkeep, stipends). */
  reserveWeeks: 1,
  /** Signing for the piece at the door. */
  pickupHours: 0.35,
  /** Up on the wall (or onto the pedestal) after she arrives. */
  hangHours: 0.45,
  /** Stepping back to admire it. */
  admireHours: 0.4,
  /** Drifting back to her routine afterwards. */
  returnHours: 0.6,
};

/** Effects of furniture. Hooks for later: lighting, guards... */
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

// ---- Gift shop ---------------------------------------------------------------

export interface MerchConfig {
  label: string;
  /** Plural, for "Stocked 100 postcards". */
  plural: string;
  /** Wholesale cost per unit. */
  unitCost: number;
  /** The price shoppers think is fair. Charging more cuts demand fast. */
  fairPrice: number;
  /** Units per wholesale order. */
  batch: number;
  /** Chance one visitor buys one, at the fair price, before venue and reputation. */
  buyChance: number;
}

export const MERCH: Record<MerchKind, MerchConfig> = {
  postcard: { label: 'Postcards', plural: 'postcards', unitCost: 1, fairPrice: 3, batch: 100, buyChance: 0.35 },
  /** Prints are of whatever hangs on the floor: famous work sells more prints, an empty room sells none. */
  print: { label: 'Art prints', plural: 'art prints', unitCost: 8, fairPrice: 25, batch: 25, buyChance: 0.1 },
  keychain: { label: 'Keychains', plural: 'keychains', unitCost: 2, fairPrice: 8, batch: 50, buyChance: 0.15 },
  /** T-shirts sell on the brand: they need reputation, and every one worn out the door is a walking ad. */
  tshirt: { label: 'T-shirts', plural: 't-shirts', unitCost: 9, fairPrice: 30, batch: 20, buyChance: 0.06 },
};

export const SHOP = {
  /** Most units of one line the stockroom holds. */
  maxStock: 500,
  /** Auto-restock tops up a line when it falls below this share of a batch. */
  restockBelow: 0.25,
  /** Highest price you can set, as a multiple of the fair price. */
  maxPriceMultiple: 4,
  /** Museum crowds are there for a day out; gallery visitors browse less but spend more. */
  venueSpend: { museum: 1, gallery: 1.6 } as Record<VenueType, number>,
  /** Event guests are in a spending mood. */
  eventSpend: 1.5,
  /** Buzz from one t-shirt worn around town. */
  tshirtBuzz: 0.25,
};

/** Visitor moods (see systems/moods.ts). Every axis runs -1 .. 1. */
export const MOODS = {
  /** Others at the same work before it starts to grate (times their patience, 0..1). */
  crowdTolerance: 3,
  /** Happiness lost per person over their tolerance. */
  crowdPenalty: 0.09,
  /** People per floor tile that starts to feel packed. */
  packedDensity: 0.22,
  /** Walk out early below these. */
  leaveBoredAt: -0.4,
  leaveUnhappyAt: -0.45,
  /** Skip a work when this many are already crowding it (impatient people). */
  skipCrowdAt: 3,
  /** Gallery: a member of the public leaving at least this covetous may buy what they wanted. */
  buyAt: 0.45,
  /** Base chance they do, plus how far past buyAt they are. */
  buyChance: 0.18,
  /** Buzz (word of mouth) from one visitor leaving delighted, or lost to one leaving miserable. */
  wordOfMouth: 0.35,
  /** Chance a public visitor drifts to an open spot between works (browsing), and how long they linger. */
  browseChance: 0.3,
  browseHours: [0.12, 0.3] as const,
  /** Walking pace varies person to person, as a multiple of GUESTS.walkTilesPerHour. */
  paceRange: [0.75, 1.2] as const,
};

// ---- Hired staff -------------------------------------------------------------

export interface StaffRoleConfig {
  label: string;
  /** What they do, in a line, for the hiring card. */
  duty: string;
  /** Weekly wage at skill 2. */
  salary: number;
}

export const STAFF_ROLES: Record<StaffRole, StaffRoleConfig> = {
  security: { label: 'Security guard', duty: 'Stops theft, damage and shoplifting', salary: 700 },
  appraiser: { label: 'Art appraiser', duty: 'Talks dealers down, and buyers trust an appraised work', salary: 1_400 },
  curator: { label: 'Assistant curator', duty: 'Makes exhibitions and events land better', salary: 1_200 },
  intern: { label: 'Intern', duty: 'Minds the gift shop and posts about you every day', salary: 250 },
};

export const STAFF = {
  /** Wage multiplier by skill (index 1..3). */
  salaryBySkill: [0, 0.8, 1, 1.35],
  /** Effect multiplier by skill (index 1..3). */
  effectBySkill: [0, 0.7, 1, 1.3],
  /** Appraiser: off the asking price of every dealer-market purchase. */
  appraiserDiscount: 0.08,
  /** Appraiser: floor sale chance multiplier is 1 + this. */
  appraiserSaleBoost: 0.15,
  /** Assistant curator: added to an exhibition's synergy score. */
  curatorSynergy: 0.08,
  /** Assistant curator: added to event satisfaction. */
  curatorEventSatisfaction: 0.06,
  /** Intern: gift shop buy chance multiplier is 1 + this. */
  internShopBoost: 0.15,
  /** Intern: buzz from their daily posts. */
  internDailyBuzz: 1.5,
  /** Staff on the floor (not the guard) work these hours. */
  dayStart: 8,
  dayEnd: 21,
};

/** Trouble on the floor: rolled once a day. A guard stops most of it. */
export const INCIDENTS = {
  /** Daily chance before visitors... */
  baseChance: 0.02,
  /** ...plus this per visitor that day... */
  perVisitor: 0.0008,
  /** ...never more than this. */
  maxChance: 0.12,
  /** Share of incidents a skill-2 guard stops (times effectBySkill, capped at 0.95). */
  guardStops: 0.75,
  /** Damage knocks this share off the piece's grade (and so its value). */
  damage: 0.12,
  /** Odds by kind when nothing rules one out. Theft never gets past a guard. */
  weights: { damage: 0.5, theft: 0.15, shoplift: 0.35 },
  /** Units a shoplifter walks off with. */
  shoplift: [3, 10] as [number, number],
};

// ---- Artist visits ---------------------------------------------------------------

export const ARTIST_CALLS = {
  /** Chance each daytime hour that an artist drops in, if none has today. About one visit every other day. */
  hourlyChance: 0.08,
  /** They arrive between these hours (ticks). */
  hours: [10, 16] as [number, number],
  /** On day one, someone always drops by from this hour, so you meet the idea early. */
  firstVisitTick: 13,
  /** How long they'll wait for you to come and talk, at most. */
  waitHours: 8,
  /** And never past this hour (9 PM). */
  leaveByTick: 21,
  walkHours: 0.6,
  /** Buying straight from the artist: a share of what the dealers would ask. */
  priceMultiple: 0.85,
  twoWorksChance: 0.4,
  /** Buying both pieces knocks this much off. */
  pairCut: 0.1,
  /** A successful haggle knocks this much off. */
  haggleCut: 0.15,
  /** Base odds a haggle works, before rapport and temperament. */
  haggleBase: 0.4,
  /** Relationship per point of rapport, before temperament. */
  relationshipPerRapport: 2,
  boughtBonus: 4,
  /** Relationship lost if you leave them standing until they go. */
  ignoredPenalty: 3,
  /** Relationship lost if you walk off mid-conversation. */
  walkAwayPenalty: 6,
  /** Reputation: gained from this much rapport up, lost from this much down. */
  repFrom: 3,
  repLossFrom: -3,
  repPerRapport: 0.5,
  /** Artists this cold won't bother coming. */
  minRelationship: -20,
};

/** Marisol's opening-week tour (src/ui/Tutorial.tsx has the tasks). */
export const TUTORIAL = {
  /** Must match TUTORIAL_STEPS.length; a test checks. */
  steps: 9,
  /** Paid once, on finishing the last task. */
  rewardCash: 1_000,
  rewardReputation: 3,
  /** Pass over more tasks than this and the gift isn't paid. */
  maxPassedForReward: 3,
};
