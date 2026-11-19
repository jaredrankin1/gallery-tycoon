import { EXHIBITION, EXHIBITION_THEMES } from '../config';
import { clamp, type Rng } from '../rng';
import type { Artwork, Exhibition, ExhibitionTheme, GameState, Id } from '../types';
import { addFame } from './careers';
import { notify } from './feed';
import { post } from './ledger';
import { workTags } from './taste';

// Curated exhibitions: pick a theme, hang works that fit it, and the show runs
// for a week. How well the walls hang together (synergy) brings crowds, lifts
// sales of on-theme work, and decides what the critics say on opening day.

export interface SynergyBonus {
  label: string;
  value: number;
  /** Short explanation, shown under the label. */
  hint: string;
}

export interface Synergy {
  /** 0..1 */
  score: number;
  displayed: number;
  onTheme: Artwork[];
  bonuses: SynergyBonus[];
}

export function themeTitle(state: GameState, theme: ExhibitionTheme): string {
  if (theme.kind === 'solo') return `${state.artists[theme.artistId]?.name ?? 'Unknown'}: A Solo Show`;
  return EXHIBITION_THEMES.find((t) => t.tag === theme.tag)?.title ?? theme.tag;
}

export const themeKey = (t: ExhibitionTheme) => (t.kind === 'solo' ? `solo:${t.artistId}` : t.tag);

export function fitsTheme(state: GameState, work: Artwork, theme: ExhibitionTheme): boolean {
  if (theme.kind === 'solo') return work.artistId === theme.artistId;
  return workTags(work, state.artists[work.artistId]).includes(theme.tag);
}

/** How well what's on the walls fits a theme. Pure. */
export function synergy(state: GameState, theme: ExhibitionTheme): Synergy {
  const shown = Object.values(state.artworks).filter((w) => w.status === 'display');
  const on = shown.filter((w) => fitsTheme(state, w, theme));
  const bonuses: SynergyBonus[] = [];
  if (!shown.length) return { score: 0, displayed: 0, onTheme: [], bonuses };

  const share = on.length / shown.length;
  bonuses.push({ label: 'On theme', value: 0.45 * share, hint: `${on.length} of ${shown.length} works on the walls fit` });

  if (on.length >= 8) bonuses.push({ label: 'Big show', value: 0.15, hint: '8 or more works on theme' });
  else if (on.length >= 5) bonuses.push({ label: 'Full rooms', value: 0.08, hint: '5 or more works on theme' });

  const artists = [...new Set(on.map((w) => w.artistId))].map((id) => state.artists[id]).filter(Boolean);
  if (theme.kind === 'solo') {
    if (on.length >= 4) bonuses.push({ label: 'Focused', value: 0.12, hint: 'A real body of work from one artist' });
    const a = state.artists[theme.artistId];
    if (a && a.fame < 25) bonuses.push({ label: 'Discovery', value: 0.1, hint: 'Critics love finding someone new' });
    if (a && a.fame >= 60) bonuses.push({ label: 'Big name', value: 0.12, hint: 'A household name draws crowds' });
  } else {
    if (artists.length >= 3) bonuses.push({ label: 'Range', value: 0.1, hint: `${artists.length} artists in conversation` });
    if (artists.some((a) => a.fame >= 60)) bonuses.push({ label: 'Headliner', value: 0.1, hint: 'A famous name on the poster' });
    if (artists.some((a) => a.fame < 25)) bonuses.push({ label: 'Discovery', value: 0.08, hint: 'An unknown worth finding' });
  }

  const fresh = on.filter((w) => w.commissioned && state.day - w.day <= 14);
  if (fresh.length) bonuses.push({ label: 'Fresh from the studio', value: 0.08, hint: 'New work by artists you sponsor' });

  const avgGrade = on.length ? on.reduce((s, w) => s + w.grade, 0) / on.length : 0;
  if (avgGrade >= 1.15) bonuses.push({ label: 'Strong pieces', value: 0.1, hint: 'The work itself is excellent' });
  else if (on.length && avgGrade < 0.85) bonuses.push({ label: 'Weak pieces', value: -0.1, hint: 'Minor works drag it down' });

  const key = themeKey(theme);
  if (state.exhibitionHistory.slice(-2).some((h) => themeKey(h.theme) === key)) {
    bonuses.push({ label: 'Seen it', value: -EXHIBITION.repeatPenalty, hint: 'You ran this theme recently' });
  }

  if (on.length < EXHIBITION.minWorks) bonuses.push({ label: 'Thin', value: -0.2, hint: `Needs ${EXHIBITION.minWorks}+ works on theme` });

  const score = clamp(bonuses.reduce((s, b) => s + b.value, 0), 0, 1);
  return { score, displayed: shown.length, onTheme: on, bonuses };
}

export const exhibitionCost = (onTheme: number) => EXHIBITION.baseCost + EXHIBITION.perWorkCost * onTheme;

/** Live synergy of the show that's on, 0 if none. */
export const liveScore = (state: GameState) => (state.exhibition ? synergy(state, state.exhibition.theme).score : 0);

/** Crowd multiplier from the show that's on. */
export const exhibitionCrowd = (state: GameState) => 1 + EXHIBITION.crowdBoost * liveScore(state);

/** Sale-chance multiplier for one work. */
export function exhibitionSaleBoost(state: GameState, work: Artwork): number {
  const ex = state.exhibition;
  if (!ex || !fitsTheme(state, work, ex.theme)) return 1;
  return 1 + EXHIBITION.saleBoost * liveScore(state);
}

/** Counts a sale toward the running show, if it was part of it. */
export function recordExhibitionSale(state: GameState, work: Artwork): void {
  const ex = state.exhibition;
  if (!ex || !fitsTheme(state, work, ex.theme)) return;
  ex.sales += 1;
  ex.revenue += work.price;
}

export function starsFor(score: number, rng: Rng): number {
  return clamp(Math.round(1 + score * 4.2 + rng.range(-0.6, 0.6)), 1, 5);
}

export function mountExhibition(state: GameState, theme: ExhibitionTheme, rng: Rng): string | void {
  if (state.exhibition) return `“${state.exhibition.title}” is still on. Close it first.`;
  if (theme.kind === 'solo' && !state.artists[theme.artistId]) return 'Unknown artist.';
  const syn = synergy(state, theme);
  if (syn.onTheme.length < EXHIBITION.minWorks) return `Hang at least ${EXHIBITION.minWorks} works that fit the theme first.`;
  const cost = exhibitionCost(syn.onTheme.length);
  const title = themeTitle(state, theme);
  post(state, 'exhibitions', -cost, `Mounted “${title}”`);

  const stars = starsFor(syn.score, rng);
  const ex: Exhibition = {
    id: `x-${state.nextId++}`,
    title,
    theme,
    startDay: state.day,
    endDay: state.day + EXHIBITION.days - 1,
    openingScore: syn.score,
    stars,
    visitors: 0,
    sales: 0,
    revenue: 0,
  };
  state.exhibition = ex;

  // Opening-day press.
  const repDelta = (stars - 3) * EXHIBITION.reviewWeight;
  state.reputation = clamp(state.reputation + repDelta, 0, 100);
  const verdict = ['', 'A muddle.', 'Uneven.', 'Worth a look.', 'A smart, coherent show.', 'The show of the season.'][stars];
  notify(state, { kind: 'review', text: `“${title}” opens. Critics: ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} ${verdict}` });
  for (const id of new Set(syn.onTheme.map((w) => w.artistId))) {
    const a = state.artists[id];
    const fame = (stars - 2) * EXHIBITION.famePerStar * (a.fame < 25 ? 2 : 1);
    addFame(state, id, fame, fame > 0 ? 'the show' : undefined);
  }
}

export function closeExhibition(state: GameState, early = false): string | void {
  const ex = state.exhibition;
  if (!ex) return 'No show is on.';
  state.exhibition = null;
  state.exhibitionHistory.push({
    title: ex.title,
    theme: ex.theme,
    startDay: ex.startDay,
    endDay: early ? state.day : ex.endDay,
    stars: ex.stars,
    visitors: ex.visitors,
    sales: ex.sales,
    revenue: ex.revenue,
  });
  if (state.exhibitionHistory.length > EXHIBITION.historySize) state.exhibitionHistory.shift();
  const salesText = ex.sales ? `, ${ex.sales} sold for $${ex.revenue.toLocaleString('en-US')}` : '';
  notify(state, { kind: 'event', text: `“${ex.title}” ${early ? 'closed early' : 'has closed'}: ${ex.visitors} visitors${salesText}.` });
}

/** Called at the end of each day. */
export function endOfDayExhibition(state: GameState): void {
  if (state.exhibition && state.day >= state.exhibition.endDay) closeExhibition(state);
}

/** Featured artists in the show draw a bigger event crowd. */
export function exhibitionEventBoost(state: GameState, featured: Id[]): number {
  const ex = state.exhibition;
  if (!ex) return 1;
  const inShow = featured.some((id) =>
    Object.values(state.artworks).some((w) => w.artistId === id && w.status === 'display' && fitsTheme(state, w, ex.theme)),
  );
  return inShow ? 1 + EXHIBITION.eventBoost * liveScore(state) : 1;
}
