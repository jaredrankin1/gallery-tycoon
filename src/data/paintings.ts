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

  // Pim Varga: low-poly pets and race cars.
  { image: 'lowpoly-1', title: 'Library Cat', artistId: 'a-pim', tags: ['quiet'] },
  { image: 'lowpoly-2', title: 'Coast Road, No. 5', artistId: 'a-pim', tags: ['retro', 'landscape'] },
  { image: 'lowpoly-3', title: 'Goldfish, 400 Polygons', artistId: 'a-pim' },
  { image: 'lowpoly-4', title: 'Tuxedo on the Good Cushion', artistId: 'a-pim' },
  { image: 'lowpoly-5', title: 'Seventeen', artistId: 'a-pim', tags: ['retro'] },
  { image: 'lowpoly-6', title: 'Reef Angel', artistId: 'a-pim' },
  { image: 'lowpoly-7', title: 'Siamese With Sunflowers', artistId: 'a-pim', tags: ['classic'] },
  { image: 'lowpoly-8', title: 'Mountain Pass, No. 3', artistId: 'a-pim', tags: ['retro', 'landscape'] },
  { image: 'lowpoly-9', title: 'Lucky Cat, Waving', artistId: 'a-pim' },
  { image: 'lowpoly-10', title: 'Dragon Fish', artistId: 'a-pim', tags: ['moody'] },

  // Saskia Brandvold: low-poly still life.
  { image: 'stilllife-1', title: 'Oranges in a Blue Bowl', artistId: 'a-saskia', tags: ['colorful'] },
  { image: 'stilllife-2', title: 'Lilies in a Faceted Jug', artistId: 'a-saskia' },
  { image: 'stilllife-3', title: 'Opening Night', artistId: 'a-saskia' },
  { image: 'stilllife-4', title: 'Vanitas.obj', artistId: 'a-saskia', tags: ['weird'] },
  { image: 'stilllife-5', title: 'Moka at Dusk', artistId: 'a-saskia' },
  { image: 'stilllife-6', title: 'Last One, I Promise', artistId: 'a-saskia' },
  { image: 'stilllife-7', title: 'Instant', artistId: 'a-saskia', tags: ['retro'] },
  { image: 'stilllife-8', title: 'No Signal', artistId: 'a-saskia', tags: ['retro', 'weird'] },
  { image: 'stilllife-9', title: 'Monstera, Afternoon', artistId: 'a-saskia' },
  { image: 'stilllife-10', title: 'Side B', artistId: 'a-saskia', tags: ['retro'] },

  // Agnès Mortlake: neo-illuminated portraits.
  { image: 'medieval-1', title: 'The King in Ermine', artistId: 'a-agnes', tags: ['prestige'] },
  { image: 'medieval-2', title: 'Lady of the Tall Veil', artistId: 'a-agnes' },
  { image: 'medieval-3', title: 'Sir, With Lion', artistId: 'a-agnes' },
  { image: 'medieval-4', title: 'May Queen', artistId: 'a-agnes', tags: ['colorful'] },
  { image: 'medieval-5', title: 'Brother Ambrose, Reading', artistId: 'a-agnes', tags: ['quiet'] },
  { image: 'medieval-6', title: 'The Astronomer', artistId: 'a-agnes' },
  { image: 'medieval-7', title: 'Lutenist in a Plumed Hat', artistId: 'a-agnes' },
  { image: 'medieval-8', title: 'The Queen in Blue', artistId: 'a-agnes', tags: ['prestige'] },
  { image: 'medieval-9', title: 'The Fool Laughs Last', artistId: 'a-agnes', tags: ['weird', 'colorful'] },
  { image: 'medieval-10', title: 'Lady With a White Falcon', artistId: 'a-agnes', tags: ['animals'] },

  // The Vell River School: romantic landscapes.
  { image: 'romantic-1', title: 'Evening on the Vell', artistId: 'a-vell' },
  { image: 'romantic-2', title: 'The Falls at Harrow Gorge', artistId: 'a-vell', tags: ['moody'] },
  { image: 'romantic-3', title: 'A Sail on Still Water', artistId: 'a-vell' },
  { image: 'romantic-4', title: 'The Great Oak, Looking East', artistId: 'a-vell' },
  { image: 'romantic-5', title: 'Alpenglow Over the Pass', artistId: 'a-vell' },
  { image: 'romantic-6', title: 'October Shore', artistId: 'a-vell', tags: ['colorful'] },
  { image: 'romantic-7', title: 'Mist Rising, Palisades', artistId: 'a-vell', tags: ['moody'] },
  { image: 'romantic-8', title: 'Sunset From the Bluff', artistId: 'a-vell' },
  { image: 'romantic-9', title: 'Ruin Above the Lake', artistId: 'a-vell', tags: ['moody'] },
  { image: 'romantic-10', title: 'First Snow on the River', artistId: 'a-vell' },

  // Lena Strohm: black-and-white photographs.
  { image: 'bwphoto-1', title: 'Cliff in Cloud', artistId: 'a-lena', tags: ['moody'] },
  { image: 'bwphoto-2', title: 'Saguaro, Noon', artistId: 'a-lena', tags: ['americana'] },
  { image: 'bwphoto-3', title: 'Breakers', artistId: 'a-lena' },
  { image: 'bwphoto-4', title: 'Wall With Palm', artistId: 'a-lena', tags: ['geometric'] },
  { image: 'bwphoto-5', title: 'Redwood Light', artistId: 'a-lena' },
  { image: 'bwphoto-6', title: 'Dock, Still Morning', artistId: 'a-lena' },
  { image: 'bwphoto-7', title: 'Agave No. 2', artistId: 'a-lena', tags: ['organic'] },
  { image: 'bwphoto-8', title: 'Cumulus', artistId: 'a-lena' },
  { image: 'bwphoto-9', title: 'Switchback', artistId: 'a-lena' },
  { image: 'bwphoto-10', title: 'Blossom, f/2', artistId: 'a-lena', tags: ['organic'] },

  // Boone Calloway: cowboy realism.
  { image: 'western-1', title: 'Mesa at Sundown', artistId: 'a-boone' },
  { image: 'western-2', title: 'Driving the Herd', artistId: 'a-boone', tags: ['animals'] },
  { image: 'western-3', title: 'Saloon, Lamps Lit', artistId: 'a-boone', tags: ['retro'] },
  { image: 'western-4', title: 'Coffee by the Wagon', artistId: 'a-boone', tags: ['moody'] },
  { image: 'western-5', title: 'Red Rock Spires', artistId: 'a-boone' },
  { image: 'western-6', title: 'The 4:10 Out of Dry Creek', artistId: 'a-boone', tags: ['retro'] },
  { image: 'western-7', title: 'Lookout', artistId: 'a-boone', tags: ['moody'] },
  { image: 'western-8', title: 'Wild Horses Running', artistId: 'a-boone', tags: ['animals'] },
  { image: 'western-9', title: 'Aspen Crossing', artistId: 'a-boone', tags: ['colorful'] },
  { image: 'western-10', title: 'Saguaro at Dusk', artistId: 'a-boone', tags: ['quiet'] },

  // Ezra Moonwell: pixel ruins at twilight.
  { image: 'pixelland-1', title: 'Aqueduct at Sunset', artistId: 'a-ezra' },
  { image: 'pixelland-2', title: 'Castle on the Bluff', artistId: 'a-ezra' },
  { image: 'pixelland-3', title: 'White Horse, Pink Blossom', artistId: 'a-ezra', tags: ['animals', 'quiet'] },
  { image: 'pixelland-4', title: 'The Fallen Head', artistId: 'a-ezra', tags: ['weird'] },
  { image: 'pixelland-5', title: 'Obelisk and Pilgrim', artistId: 'a-ezra' },
  { image: 'pixelland-6', title: 'Palace by Moonlight', artistId: 'a-ezra' },
  { image: 'pixelland-7', title: 'Mushroom Steppe', artistId: 'a-ezra', tags: ['weird'] },
  { image: 'pixelland-8', title: 'Falls of the Old Wall', artistId: 'a-ezra', tags: ['quiet'] },
  { image: 'pixelland-9', title: 'Cat on the Arch', artistId: 'a-ezra', tags: ['animals'] },
  { image: 'pixelland-10', title: 'Dish, Listening', artistId: 'a-ezra', tags: ['retro'] },

  // Lupe Marchetti: impasto panoramas, long and thick.
  { image: 'impasto-1', title: 'Sunset, Extra Thick', artistId: 'a-lupe' },
  { image: 'impasto-2', title: 'Red Barn, Spotted Cow', artistId: 'a-lupe', tags: ['americana', 'animals'] },
  { image: 'impasto-3', title: 'Palm Beach, Buttercream', artistId: 'a-lupe' },
  { image: 'impasto-4', title: 'Desert, Piped', artistId: 'a-lupe', tags: ['americana'] },
  { image: 'impasto-5', title: 'Creek in the Woods', artistId: 'a-lupe', tags: ['quiet'] },
  { image: 'impasto-6', title: 'October Hills', artistId: 'a-lupe' },
  { image: 'impasto-7', title: 'Snowcaps', artistId: 'a-lupe' },
  { image: 'impasto-8', title: 'Cottage on the Lake', artistId: 'a-lupe', tags: ['quiet'] },
  { image: 'impasto-9', title: 'Swirling Night (After Vincent)', artistId: 'a-lupe', tags: ['classic'] },
  { image: 'impasto-10', title: 'Lavender Rows', artistId: 'a-lupe' },
];
