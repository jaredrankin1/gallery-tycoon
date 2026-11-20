// The real paintings in the game. Images are cut from art/source/paintings/
// by tools/slice_art.py into src/assets/art/<image>.jpg.
//
// Each work belongs to an artist. `tags` add to that artist's own tags when a
// visitor decides how they feel about it (a landscape by a pop artist, say).

export interface PaintingSeed {
  image: string;
  title: string;
  artistId: string;
  tags?: string[];
}

export const PAINTINGS: PaintingSeed[] = [
  // Mara Velloso: heavy, moody oils.
  { image: 'sheet1-2', title: 'The Foreman', artistId: 'a-mara', tags: ['portrait'] },
  { image: 'sheet1-5', title: 'Last Transmission', artistId: 'a-mara', tags: ['weird'] },
  { image: 'sheet1-8', title: 'Night Bus, 3 A.M.', artistId: 'a-mara', tags: ['experimental'] },
  { image: 'sheet2-3', title: 'Heir Apparent', artistId: 'a-mara', tags: ['weird'] },
  { image: 'sheet2-5', title: 'Blue Hour', artistId: 'a-mara' },

  // Hollis Brandt: patient landscapes.
  { image: 'sheet2-10', title: 'Aqueduct in Late Pink', artistId: 'a-hollis' },
  { image: 'sheet1-9', title: 'The Long Watch', artistId: 'a-hollis', tags: ['moody'] },

  // Junie Okafor: pixel dreamscapes.
  { image: 'sheet1-10', title: 'Signal Loss', artistId: 'a-junie', tags: ['portrait', 'experimental'] },
  { image: 'sheet4-1', title: 'Falls Under a Pink Sun', artistId: 'a-junie', tags: ['landscape'] },
  { image: 'sheet4-2', title: 'Blossom.exe', artistId: 'a-junie', tags: ['landscape'] },
  { image: 'sheet4-3', title: 'Skyline With Airship', artistId: 'a-junie' },
  { image: 'sheet4-4', title: 'The Arch at Low Tide', artistId: 'a-junie', tags: ['landscape', 'quiet'] },
  { image: 'sheet4-5', title: 'Crystal Field', artistId: 'a-junie', tags: ['fantasy'] },
  { image: 'sheet4-6', title: 'Bamboo, 8-Bit', artistId: 'a-junie', tags: ['landscape', 'quiet'] },
  { image: 'sheet4-7', title: 'Mountain, Reflected', artistId: 'a-junie', tags: ['landscape', 'quiet'] },
  { image: 'sheet4-8', title: 'Spore Country', artistId: 'a-junie', tags: ['fantasy', 'weird'] },
  { image: 'sheet4-9', title: 'Listening Station', artistId: 'a-junie' },
  { image: 'sheet4-10', title: 'Northern Static', artistId: 'a-junie', tags: ['landscape'] },

  // Inès Coutard: retro-modern geometry and cubist figures.
  { image: 'sheet1-3', title: 'Cathedral of Angles', artistId: 'a-ines' },
  { image: 'sheet1-7', title: 'Atomic Garden', artistId: 'a-ines', tags: ['retro'] },
  { image: 'sheet2-4', title: 'Lunar Debutante', artistId: 'a-ines', tags: ['retro', 'portrait'] },
  { image: 'sheet2-8', title: 'Fortress at Moonrise', artistId: 'a-ines' },
  { image: 'sheet1-6', title: 'Seated Figure in Ochre', artistId: 'a-ines', tags: ['figurative'] },
  { image: 'sheet2-1', title: 'She Sees Both Ways', artistId: 'a-ines', tags: ['portrait', 'colorful'] },

  // Kiyoshi Tanabe: ink and woodblock.
  { image: 'sheet1-4', title: 'Chrysanthemum Pins', artistId: 'a-kiyo', tags: ['colorful'] },
  { image: 'sheet2-6', title: 'Ronin in Bamboo', artistId: 'a-kiyo', tags: ['moody'] },

  // Rook Amador: pop psychedelia, extra eyes.
  { image: 'sheet1-1', title: 'Familiar', artistId: 'a-rook', tags: ['moody'] },
  { image: 'sheet2-2', title: 'Good Boy (Third Eye)', artistId: 'a-rook' },
  { image: 'sheet2-7', title: 'The Wizard Was High', artistId: 'a-rook' },
  { image: 'sheet2-9', title: 'Dancing Thing', artistId: 'a-rook', tags: ['minimal'] },

  // Wren Halloway: heroes and wanderers.
  { image: 'sheet3-1', title: 'The Queen of Coins', artistId: 'a-wren' },
  { image: 'sheet3-2', title: 'Old Man of the Engines', artistId: 'a-wren' },
  { image: 'sheet3-3', title: 'Courier', artistId: 'a-wren', tags: ['retro'] },
  { image: 'sheet3-4', title: 'Thinking It Over', artistId: 'a-wren' },
  { image: 'sheet3-5', title: 'The Warden of the Grove', artistId: 'a-wren' },
  { image: 'sheet3-6', title: 'Nobody You Know', artistId: 'a-wren', tags: ['moody'] },
  { image: 'sheet3-7', title: 'Arena Champion', artistId: 'a-wren' },
  { image: 'sheet3-8', title: 'The Cartographer', artistId: 'a-wren', tags: ['quiet'] },
  { image: 'sheet3-9', title: 'Rain Hat', artistId: 'a-wren' },
  { image: 'sheet3-10', title: 'Walking Out', artistId: 'a-wren', tags: ['landscape'] },

  // Ruben Ashe: loud, raw neo-expressionism. Unframed canvases, landscape.
  { image: 'neo-1', title: 'King of Nothing', artistId: 'a-ruben', tags: ['portrait'] },
  { image: 'neo-2', title: 'Big Bad', artistId: 'a-ruben', tags: ['moody'] },
  { image: 'neo-3', title: 'Sitting With It', artistId: 'a-ruben', tags: ['figurative'] },
  { image: 'neo-4', title: 'Tar Beach, Noon', artistId: 'a-ruben', tags: ['landscape'] },
  { image: 'neo-5', title: 'Head No. 9 (Pink)', artistId: 'a-ruben', tags: ['portrait'] },
  { image: 'neo-6', title: 'Sunflowers, Shouting', artistId: 'a-ruben', tags: ['classic'] },
  { image: 'neo-7', title: 'Crown in Orbit', artistId: 'a-ruben', tags: ['portrait', 'fantasy'] },
  { image: 'neo-8', title: 'The Bull', artistId: 'a-ruben' },
  { image: 'neo-9', title: 'Sunset Strip, Melting', artistId: 'a-ruben', tags: ['landscape', 'pop'] },
  { image: 'neo-10', title: 'Memento, Loud', artistId: 'a-ruben', tags: ['moody'] },

  // Della Price: photorealist Americana.
  { image: 'photoreal-1', title: 'Freckles, August', artistId: 'a-della', tags: ['portrait'] },
  { image: 'photoreal-2', title: 'Lipstick on the Mug', artistId: 'a-della', tags: ['retro'] },
  { image: 'photoreal-3', title: 'Last Gas for 90 Miles', artistId: 'a-della', tags: ['landscape', 'retro'] },
  { image: 'photoreal-4', title: 'Two Fingers, Neat', artistId: 'a-della', tags: ['moody'] },
  { image: 'photoreal-5', title: 'Rooftop Dusk, Manhattan', artistId: 'a-della', tags: ['landscape'] },
  { image: 'photoreal-6', title: 'Dollar Slice', artistId: 'a-della', tags: ['pop'] },
  { image: 'photoreal-7', title: 'Sunday, Unmade', artistId: 'a-della' },
  { image: 'photoreal-8', title: 'Tony in Aviators', artistId: 'a-della', tags: ['portrait', 'retro'] },
  { image: 'photoreal-9', title: 'Peonies in a Jar', artistId: 'a-della', tags: ['classic'] },
  { image: 'photoreal-10', title: 'Airstream at Golden Hour', artistId: 'a-della', tags: ['retro', 'landscape'] },
];
