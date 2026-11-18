import type { Artist } from '../game/types';

// Placeholder personas. Add more here; nothing else needs to change.
export type ArtistSeed = Omit<Artist, 'relationship' | 'lastContactDay'> & { relationship?: number };

export const ARTIST_SEEDS: ArtistSeed[] = [
  {
    id: 'a-mara',
    name: 'Mara Velloso',
    medium: 'Oil on canvas',
    style: 'Moody portraits',
    bio: 'Paints strangers she meets on night buses. Will talk your ear off about varnish.',
    fame: 35,
    temperament: 0.8,
    traits: ['loves-wine', 'social'],
    tags: ['painting', 'portrait', 'figurative', 'moody', 'classic'],
  },
  {
    id: 'a-tobias',
    name: 'Tobias Arkwright',
    medium: 'Found-object sculpture',
    style: 'Industrial salvage',
    bio: 'Welds scrap into towering birds. Distrusts anyone in a blazer.',
    fame: 20,
    temperament: 1.4,
    traits: ['reclusive', 'cheese-snob'],
    tags: ['sculpture', 'industrial', 'experimental', 'rough'],
  },
  {
    id: 'a-junie',
    name: 'Junie Okafor',
    medium: 'Digital print',
    style: 'Neon collage',
    bio: 'Big online following, tiny attention span. Openings are her natural habitat.',
    fame: 55,
    temperament: 1.1,
    traits: ['social', 'trendy'],
    tags: ['digital', 'colorful', 'pop', 'trendy'],
  },
  {
    id: 'a-hollis',
    name: 'Hollis Brandt',
    medium: 'Watercolour',
    style: 'Quiet landscapes',
    bio: 'Retired schoolteacher. Patient, kind, and criminally underpriced.',
    fame: 10,
    temperament: 0.5,
    traits: ['easygoing'],
    tags: ['painting', 'landscape', 'quiet', 'classic'],
  },
  {
    id: 'a-sable',
    name: 'Sable Ivanova',
    medium: 'Installation',
    style: 'Light and shadow',
    bio: 'Critically adored, commercially terrifying. Expects lavish everything.',
    fame: 75,
    temperament: 1.5,
    traits: ['diva', 'loves-wine'],
    tags: ['installation', 'experimental', 'minimal', 'prestige'],
  },
];

export const TITLE_A = ['Study', 'Portrait', 'Fragment', 'Echo', 'Night', 'Field', 'Window', 'Bird', 'Static', 'Harbour'];
export const TITLE_B = ['in Blue', 'No. 4', 'at Dusk', 'Interrupted', 'Revisited', 'for Two', 'Underneath', 'in Rust', 'Unfinished', 'with Lemons'];
