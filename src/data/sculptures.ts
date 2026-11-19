// Sculpture and fibre art. Sprites are cut from art/source/sculptures/ by
// tools/slice_sculpture.py into src/assets/sculpture/<image>.png.
//
// `form` says where a work can go: sculptures stand on a pedestal (the sprite
// brings its own plinth), hangings go flat on a wall with no frame.

import type { PaintingSeed } from './paintings';
import type { ArtForm } from '../game/types';

export interface SculptureSeed extends PaintingSeed {
  form: ArtForm;
}

const s = (image: string, title: string, artistId: string, tags?: string[]): SculptureSeed => ({
  image,
  title,
  artistId,
  form: 'sculpture',
  ...(tags && { tags }),
});
const hang = (image: string, title: string, artistId: string, tags?: string[]): SculptureSeed => ({
  image,
  title,
  artistId,
  form: 'hanging',
  ...(tags && { tags }),
});

export const SCULPTURES: SculptureSeed[] = [
  // Ottoline Strand: hard-edge geometry in steel, glass and painted wood.
  s('geometric-1', 'Stacked Ember', 'a-ottoline', ['colorful']),
  s('geometric-2', 'Open Cube', 'a-ottoline'),
  s('geometric-3', 'Unequal Pair', 'a-ottoline', ['quiet']),
  s('geometric-4', 'Four Verticals', 'a-ottoline', ['industrial']),
  s('geometric-5', 'Sunset in Sheets', 'a-ottoline', ['colorful']),
  s('geometric-6', 'Sphere, Resting', 'a-ottoline', ['quiet']),
  s('geometric-7', 'Window, Solid', 'a-ottoline'),
  s('geometric-8', 'Tipping Point', 'a-ottoline', ['rough']),
  s('geometric-9', 'Nested Squares', 'a-ottoline'),
  s('geometric-10', 'Crossing', 'a-ottoline'),

  // Pilar Esquivel: soft, living forms.
  s('organic-1', 'Held Breath', 'a-pilar', ['quiet']),
  s('organic-2', 'Cherry Molecule', 'a-pilar', ['colorful']),
  s('organic-3', 'Sea Fan in Verdigris', 'a-pilar'),
  s('organic-4', 'Seed in the Grain', 'a-pilar', ['classic']),
  s('organic-5', 'Pearl Cluster', 'a-pilar'),
  s('organic-6', 'Sponge Memory', 'a-pilar', ['rough']),
  s('organic-7', 'Starfish Waltz', 'a-pilar'),
  s('organic-8', 'Inside Voice', 'a-pilar', ['weird']),
  s('organic-9', 'Ribbon of Granite', 'a-pilar', ['classic']),
  s('organic-10', 'Lilac Weather', 'a-pilar', ['colorful']),

  // Tobias Arkwright: scrap made to live again.
  s('salvage-1', 'Good Boy, Rebuilt', 'a-tobias'),
  s('salvage-2', 'This Way to the Show', 'a-tobias', ['pop']),
  s('salvage-3', 'Seamstress Angel', 'a-tobias', ['fantasy']),
  s('salvage-4', 'Throne of Small Engines', 'a-tobias'),
  s('salvage-5', 'The Last Ferry', 'a-tobias', ['moody']),
  s('salvage-6', 'Reading Room Arch', 'a-tobias', ['quiet']),
  s('salvage-7', 'Tin Can Bouquet', 'a-tobias', ['colorful']),
  s('salvage-8', 'Everything I Packed', 'a-tobias', ['retro']),
  s('salvage-9', 'Iron Mare', 'a-tobias', ['figurative']),
  s('salvage-10', 'House of Windows', 'a-tobias'),

  // Dex Mallory: glossy pop surrealism.
  s('pop-1', 'Sweet Tooth', 'a-dex'),
  s('pop-2', 'Prickly Darling', 'a-dex'),
  s('pop-3', 'Toast Is Ready', 'a-dex', ['retro']),
  s('pop-4', 'Polka Pudding', 'a-dex'),
  s('pop-5', 'Tune In, Drip Out', 'a-dex', ['retro']),
  s('pop-6', 'Running Upstream', 'a-dex'),
  s('pop-7', 'Greenhouse Bubbles', 'a-dex', ['quiet']),
  s('pop-8', 'Cheese Dreams', 'a-dex'),
  s('pop-9', 'Space Cat Is Unbothered', 'a-dex', ['fantasy']),
  s('pop-10', 'Mushroom Cloud Nine', 'a-dex', ['moody']),

  // Konrad Ilves: brutalist monuments, small enough to fit indoors.
  s('brutalist-1', 'Monument to a Door', 'a-konrad'),
  s('brutalist-2', 'Housing Block, Abstracted', 'a-konrad'),
  s('brutalist-3', 'Cantilever', 'a-konrad'),
  s('brutalist-4', 'Civic Column', 'a-konrad', ['classic']),
  s('brutalist-5', 'Porthole', 'a-konrad'),
  s('brutalist-6', 'Compass Rose in Concrete', 'a-konrad'),
  s('brutalist-7', 'Orange Room', 'a-konrad', ['colorful']),
  s('brutalist-8', 'Silos Holding Hands', 'a-konrad'),
  s('brutalist-9', 'Stair to Nowhere', 'a-konrad', ['weird']),
  s('brutalist-10', 'Tuning Fork', 'a-konrad'),

  // Noor Haddad: glazed stoneware with feelings.
  s('ceramic-1', 'Sunday Bather', 'a-noor', ['portrait']),
  s('ceramic-2', 'Chimney Coral', 'a-noor', ['experimental']),
  s('ceramic-3', 'Three Moods', 'a-noor', ['portrait', 'moody']),
  s('ceramic-4', 'Guard Dog of the Kiln', 'a-noor', ['classic']),
  s('ceramic-5', 'Arch With a Handle', 'a-noor', ['minimal']),
  s('ceramic-6', 'Fungal Cottage', 'a-noor', ['fantasy']),
  s('ceramic-7', 'Sleepy House', 'a-noor', ['quiet']),
  s('ceramic-8', 'Gingham Vase', 'a-noor', ['classic']),
  s('ceramic-9', 'Mr. Toad Considers', 'a-noor'),
  s('ceramic-10', 'Blue Ruffle', 'a-noor', ['minimal']),

  // Tilde Marsh: fibre art, for walls and plinths.
  hang('textile-1', 'Sunrise Macramé', 'a-tilde', ['landscape']),
  s('textile-2', 'Toadstool Family', 'a-tilde', ['fantasy']),
  hang('textile-3', 'Patchwork Compass', 'a-tilde', ['geometric']),
  hang('textile-4', 'Tabby, Tufted', 'a-tilde', ['pop']),
  s('textile-5', 'Sailor’s Knot, Enlarged', 'a-tilde', ['minimal']),
  s('textile-6', 'Coil Basket in Rust and Blue', 'a-tilde', ['classic']),
  hang('textile-7', 'Wildflower Lace', 'a-tilde', ['quiet']),
  s('textile-8', 'Felted Moss Jar', 'a-tilde', ['weird']),
  hang('textile-9', 'Mountain Weaving', 'a-tilde', ['landscape']),
  hang('textile-10', 'Pom-Pom Rain', 'a-tilde', ['pop']),

  // Juno Kaplan: glittery soft-vinyl monsters, hand-painted in tiny runs.
  s('vinyl-1', 'Little Cyclops, Sherbet', 'a-juno'),
  s('vinyl-2', 'Skelenaut', 'a-juno', ['retro']),
  s('vinyl-3', 'Third-Eye Kitty', 'a-juno'),
  s('vinyl-4', 'Oni Having a Bad Day', 'a-juno'),
  s('vinyl-5', 'Glitter Squid', 'a-juno'),
  s('vinyl-6', 'Lime Kaiju', 'a-juno'),
  s('vinyl-7', 'Kitten Suit', 'a-juno', ['figurative']),
  s('vinyl-8', 'Sleepy Flame', 'a-juno', ['quiet']),
  s('vinyl-9', 'Gorilla Cosmonaut', 'a-juno', ['retro']),
  s('vinyl-10', 'Fishboy in Wellies', 'a-juno'),

  // Ollie Ferris: matte designer toys with attitude.
  s('toys-1', 'Star Pilot', 'a-ollie', ['retro']),
  s('toys-2', 'Bunny Hood', 'a-ollie'),
  s('toys-3', 'Tiny Tyrant', 'a-ollie'),
  s('toys-4', 'Box Cat', 'a-ollie', ['geometric']),
  s('toys-5', 'Skelenaut, Matte Edition', 'a-ollie', ['retro']),
  s('toys-6', 'Not a Morning Dog', 'a-ollie'),
  s('toys-7', 'Robot With a Spark', 'a-ollie', ['retro']),
  s('toys-8', 'Grumpy Cap', 'a-ollie'),
  s('toys-9', 'Unimpressed Visitor', 'a-ollie', ['weird']),
  s('toys-10', 'Box Dog', 'a-ollie', ['geometric']),

  // The Castellani Estate: classical marble busts from an old family's attic.
  s('marble-1', 'Youth With Curls', 'a-castellani'),
  s('marble-2', 'Lady of the Braid', 'a-castellani'),
  s('marble-3', 'The Philosopher', 'a-castellani'),
  s('marble-4', 'Athena in Her Helmet', 'a-castellani'),
  s('marble-5', 'Emperor in Laurels', 'a-castellani'),
  s('marble-6', 'The Veiled Woman', 'a-castellani', ['quiet']),
  s('marble-7', 'Young Bacchus', 'a-castellani'),
  s('marble-8', 'Medusa', 'a-castellani', ['moody']),
  s('marble-9', 'Old God of the Sea', 'a-castellani'),
  s('marble-10', 'Venus, Turned Away', 'a-castellani'),

  // Cal Whitaker: the Old West in cast bronze.
  s('western-1', 'The Roper', 'a-cal'),
  s('western-2', 'The Elder', 'a-cal', ['portrait']),
  s('western-3', 'Longhorn', 'a-cal'),
  s('western-4', 'Trail Boss', 'a-cal', ['portrait']),
  s('western-5', 'The Overland Stage', 'a-cal'),
  s('western-6', 'Bronc Buster', 'a-cal'),
  s('western-7', 'Calling the Pack', 'a-cal', ['moody']),
  s('western-8', 'Prairie Daughter', 'a-cal', ['portrait']),
  s('western-9', 'Grizzly on the Ridge', 'a-cal'),
  s('western-10', 'Pack Mule', 'a-cal', ['quiet']),
];
