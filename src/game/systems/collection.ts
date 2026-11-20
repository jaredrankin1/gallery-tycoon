import { COLLECTION } from '../config';
import type { Rng } from '../rng';
import type { Artwork, GameState, StartingCollection } from '../types';
import { workValue } from './careers';
import { freeDisplayFixture } from './floor';
import { freshPainting } from './market';

/**
 * Gives a new game the art the player chose to start with: a couple of their
 * own pieces, or a storeroom of family heirlooms. As many as fit go straight up
 * on the starter walls and pedestal; the rest wait in storage (Marisol hangs
 * them when auto-hang is on).
 */
export function grantStartingCollection(state: GameState, kind: StartingCollection, rng: Rng): void {
  if (kind === 'none') return;
  const cfg = COLLECTION[kind];
  state.cash = Math.round((state.cash * cfg.cash) / 1000) * 1000;
  const [lo, hi] = cfg.fame;
  const artists = Object.values(state.artists).filter((a) => a.fame >= lo && a.fame <= hi);
  if (!artists.length) return;

  const used = new Set<string>();
  for (let tries = 0, made = 0; made < cfg.works && tries < cfg.works * 6; tries++) {
    // The family collection always has one of its biggest names.
    // Spread across artists where there are enough of them.
    const unused = artists.filter((a) => !used.has(a.id));
    const artist = kind === 'family' && tries === 0 ? artists.reduce((a, b) => (b.fame > a.fame ? b : a)) : rng.pick(unused.length ? unused : artists);
    const { painting } = freshPainting(state, artist, rng);
    if (!painting) continue;
    const grade = Math.round(rng.range(cfg.grade[0], cfg.grade[1]) * 100) / 100;
    const value = workValue(artist, { grade });
    const id = `w-${state.nextId++}`;
    const work: Artwork = {
      id,
      title: painting.title,
      artistId: artist.id,
      value,
      grade,
      // Valued at today's price, so gains and losses show from here on.
      acquiredFor: value,
      price: Math.round((value * state.settings.defaultMarkup) / 50) * 50,
      status: 'storage',
      day: state.day,
      image: painting.image,
      tags: painting.tags,
      source: kind,
      ...(painting.form && { form: painting.form }),
    };
    state.artworks[id] = work;
    const spot = freeDisplayFixture(state.floor, work);
    if (spot) {
      spot.artworkId = id;
      work.status = 'display';
    }
    used.add(artist.id);
    made++;
  }
}
