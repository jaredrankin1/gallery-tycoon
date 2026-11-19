import { TITLE_A, TITLE_B } from '../../data/artists';
import { PAINTINGS } from '../../data/paintings';
import { DIFFICULTY, RULES } from '../config';
import { Rng } from '../rng';
import type { Artist, GameState } from '../types';
import { friendDiscount } from './artists';
import { workValue } from './careers';
import { notify } from './feed';

/** One of the artist's real paintings that isn't already on the market or in your hands. */
export function freshPainting(state: GameState, artist: Artist, rng: Rng) {
  // Sold works can turn up again later, resold by their new owners.
  const taken = new Set(Object.values(state.artworks).filter((w) => w.status !== 'sold').map((w) => w.image));
  const mine = PAINTINGS.filter((p) => p.artistId === artist.id);
  const fresh = mine.filter((p) => !taken.has(p.image));
  return { hasCatalogue: mine.length > 0, painting: fresh.length ? rng.pick(fresh) : undefined };
}

/** How strong a new piece is, from the artist's current form. About 0.7 .. 1.4. */
export function rollGrade(artist: Artist, rng: Rng, spread = 0.35): number {
  return Math.round((1.05 + (artist.form - 50) / 180 + rng.range(-spread, spread)) * 100) / 100;
}

/** Drops expired offers and adds up to `count` new ones (never above marketSize). */
export function refreshMarket(state: GameState, rng: Rng, count: number = RULES.newOffersPerDay): void {
  for (const [id, work] of Object.entries(state.artworks)) {
    if (work.status === 'offered' && work.day < state.day) delete state.artworks[id];
  }

  // Artists who are angry with you won't sell to you. Friends show up more often.
  // Artists you sponsor send their work straight to you; ones a rival signed sell through them.
  const sellers = Object.values(state.artists).filter((a) => a.relationship > -10 && !a.patron && !((a.rivalUntil ?? 0) > state.day));
  if (sellers.length === 0) return;
  const weighted = sellers.flatMap((a) => (a.relationship >= RULES.relationshipForOffers ? [a, a, a] : [a]));

  const diff = DIFFICULTY[state.difficulty];
  let open = Object.values(state.artworks).filter((w) => w.status === 'offered').length;
  for (let i = 0; i < count && open < RULES.marketSize; i++, open++) {
    const artist = rng.pick(weighted);
    const grade = rollGrade(artist, rng);
    const value = workValue(artist, { grade });
    const price = Math.round((value * diff.artPriceMultiplier * (1 - friendDiscount(artist))) / 50) * 50;
    const id = `w-${state.nextId++}`;
    // Real paintings first.
    const { hasCatalogue, painting } = freshPainting(state, artist, rng);
    if (hasCatalogue && !painting) {
      open--; // they've nothing new to show today
      continue;
    }
    const title = painting?.title ?? `${rng.pick(TITLE_A)} ${rng.pick(TITLE_B)}`;
    state.artworks[id] = {
      id,
      title,
      artistId: artist.id,
      value,
      grade,
      acquiredFor: 0,
      price,
      status: 'offered',
      day: state.day + RULES.offerLifetimeDays - 1,
      ...(painting && { image: painting.image, tags: painting.tags }),
    };
    if (artist.relationship >= RULES.relationshipForOffers) {
      notify(state, { kind: 'market', text: `${artist.name.split(' ')[0]} offered you “${title}”.` });
    }
  }
}
