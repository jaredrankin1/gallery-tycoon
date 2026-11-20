import type { StaffRole } from '../game/types';

/**
 * People you can hire. Duane the guard has his own sheet; everyone else wears
 * one of the visitor sheets in a recolour, so they never pass for the visitor
 * who owns that sheet.
 */
export interface StaffCandidate {
  id: string;
  role: StaffRole;
  name: string;
  /** Sprite sheet in src/assets/sprites. */
  sprite: string;
  /** Crowd recolour index (see render/sprites.ts crowdAtlas). 0 = the sheet as drawn. */
  variant: number;
  /** 1 = green, 2 = solid, 3 = the best around. Scales both what they do and what they cost. */
  skill: 1 | 2 | 3;
  blurb: string;
}

export const STAFF_CANDIDATES: StaffCandidate[] = [
  // Security: Duane is the only guard looking for work at the start.
  {
    id: 's-duane',
    role: 'security',
    name: 'Duane Kowalski',
    sprite: 'guard',
    variant: 0,
    skill: 2,
    blurb: 'Patrols on a Segway, lives on donuts and coffee, and takes the job very, very seriously.',
  },
  // Appraisers
  {
    id: 'a-ambrose',
    role: 'appraiser',
    name: 'Ambrose Pell',
    sprite: 'edmund',
    variant: 2,
    skill: 3,
    blurb: 'Has valued estates for half the city. Dealers lower their voices when he walks in.',
  },
  {
    id: 'a-ines',
    role: 'appraiser',
    name: 'Ines Kowalczyk',
    sprite: 'beatrix',
    variant: 1,
    skill: 2,
    blurb: 'Sharp eye, sharper pencil. Haggles like it’s a sport.',
  },
  // Assistant curators
  {
    id: 'c-lucia',
    role: 'curator',
    name: 'Lucia Ferrante',
    sprite: 'rosa',
    variant: 3,
    skill: 2,
    blurb: 'Writes wall texts people actually read. Loves a theme.',
  },
  {
    id: 'c-jonah',
    role: 'curator',
    name: 'Jonah Reyes',
    sprite: 'amara',
    variant: 2,
    skill: 3,
    blurb: 'Hung a biennial at twenty-six. Critics take his calls.',
  },
  {
    id: 'c-wren',
    role: 'curator',
    name: 'Wren Liu',
    sprite: 'hana',
    variant: 1,
    skill: 1,
    blurb: 'Fresh out of a curating MA, full of ideas, light on contacts.',
  },
  // Interns
  {
    id: 'i-pip',
    role: 'intern',
    name: 'Pip Andersen',
    sprite: 'fen',
    variant: 2,
    skill: 2,
    blurb: 'Runs the gallery’s socials, minds the shop, never stops filming.',
  },
  {
    id: 'i-tomas',
    role: 'intern',
    name: 'Tomás Vidal',
    sprite: 'mei',
    variant: 3,
    skill: 1,
    blurb: 'Eager, punctual, and still learning which end of a frame is up.',
  },
  {
    id: 'i-sol',
    role: 'intern',
    name: 'Sol Mensah',
    sprite: 'sunny',
    variant: 4,
    skill: 3,
    blurb: 'Retired teacher volunteering for the love of it. Visitors adore them.',
  },
];

export const candidateById = (id: string) => STAFF_CANDIDATES.find((c) => c.id === id);
