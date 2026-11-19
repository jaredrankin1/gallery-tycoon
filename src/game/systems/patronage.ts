import { TITLE_A, TITLE_B } from '../../data/artists';
import { PATRONAGE, PHASE_TAGS, RIVAL_GALLERIES } from '../config';
import { clamp, type Rng } from '../rng';
import type { Artist, Artwork, GameState, Id, StipendTier } from '../types';
import { adjustRelationship } from './artists';
import { baseWorkValue, workValue } from './careers';
import { notify } from './feed';
import { post } from './ledger';
import { freshPainting, rollGrade } from './market';
import { TAG_LABEL } from './taste';

// Patronage: put an artist on a weekly stipend and they send you new work at
// random intervals. Pay well and their form and loyalty climb. Pay badly and a
// rival gallery will come calling.

const first = (a: Artist) => a.name.split(' ')[0];

/** Weekly stipend this artist would take at a given tier. */
export function stipendFor(artist: Artist, tier: StipendTier): number {
  return Math.round((baseWorkValue(artist) * PATRONAGE.stipendShare * PATRONAGE.tiers[tier].mult) / 50) * 50;
}

export const patronCount = (state: GameState) => Object.values(state.artists).filter((a) => a.patron).length;

export const signedWithRival = (state: GameState, a: Artist) => (a.rivalUntil ?? 0) > state.day;

/** Why you can't sponsor this artist right now, or nothing if you can. */
export function canSponsor(state: GameState, artist: Artist): string | undefined {
  if (artist.patron) return `You already sponsor ${first(artist)}.`;
  if (signedWithRival(state, artist)) return `${first(artist)} is under contract with a rival until day ${artist.rivalUntil}.`;
  if (artist.relationship < PATRONAGE.minRelationship) return `${first(artist)} doesn’t know you well enough yet. Try a studio visit.`;
  if (patronCount(state) >= PATRONAGE.slots) return `You can sponsor ${PATRONAGE.slots} artists at once.`;
}

export function signPatron(state: GameState, artistId: Id, tier: StipendTier): string | void {
  const artist = state.artists[artistId];
  if (!artist) return 'Unknown artist.';
  const err = canSponsor(state, artist);
  if (err) return err;
  const stipend = stipendFor(artist, tier);
  // First week up front.
  post(state, 'patronage', -stipend, `Stipend: ${artist.name} (first week)`);
  artist.patron = { tier, stipend, since: state.day, delivered: 0, lastDeliveryDay: state.day };
  adjustRelationship(state, artistId, tier === 'modest' ? 3 : tier === 'fair' ? 8 : 12);
  notify(state, { kind: 'artist', text: `${first(artist)} signed on. Expect new work in the coming days.` });
}

export function setStipend(state: GameState, artistId: Id, tier: StipendTier): string | void {
  const artist = state.artists[artistId];
  if (!artist?.patron) return 'You don’t sponsor that artist.';
  const old = PATRONAGE.tiers[artist.patron.tier].mult;
  const next = PATRONAGE.tiers[tier].mult;
  if (next === old) return;
  artist.patron.tier = tier;
  artist.patron.stipend = stipendFor(artist, tier);
  if (next < old) adjustRelationship(state, artistId, -PATRONAGE.cutPenalty);
  else {
    adjustRelationship(state, artistId, 4);
    wardOffRival(state, artist);
  }
}

export function endPatronage(state: GameState, artistId: Id): string | void {
  const artist = state.artists[artistId];
  if (!artist?.patron) return 'You don’t sponsor that artist.';
  artist.patron = undefined;
  adjustRelationship(state, artistId, -PATRONAGE.dropPenalty);
  notify(state, { kind: 'artist', text: `You ended ${first(artist)}’s stipend. They took it hard.` });
}

/** True when a rival would get a hearing. */
export const atRisk = (a: Artist) => !!a.patron && (a.patron.tier === 'modest' || a.relationship < PATRONAGE.loyalAt);

/** Clears a rival's approach once the artist is paid fairly and happy with you. */
export function wardOffRival(state: GameState, artist: Artist): void {
  const p = artist.patron;
  if (!p || p.courtedDay === undefined || atRisk(artist)) return;
  notify(state, { kind: 'artist', text: `${first(artist)} turned down ${p.courtedBy ?? 'the rival'}. They’re staying with you.` });
  p.courtedDay = undefined;
  p.courtedBy = undefined;
}

/** Daily: form drifts, phases change, sponsored artists deliver. */
export function endOfDayPatronage(state: GameState, rng: Rng): void {
  for (const artist of Object.values(state.artists)) {
    // Form: a random walk pulled toward what their situation supports.
    const tierPull = artist.patron ? PATRONAGE.tiers[artist.patron.tier].formTarget : -5;
    const target = 50 + tierPull + artist.relationship / 5;
    artist.form = clamp(artist.form + (target - artist.form) * 0.06 + rng.range(-3, 3), 5, 95);

    // Style drift: now and then they move into a new phase.
    if (rng.chance(PATRONAGE.phaseChance)) {
      const options = PHASE_TAGS.filter((t) => t !== artist.phase && !artist.tags.includes(t));
      if (options.length) {
        artist.phase = rng.pick(options);
        if (artist.patron || artist.relationship >= 20) {
          notify(state, { kind: 'artist', text: `${first(artist)} has moved into a new phase: ${TAG_LABEL[artist.phase] ?? artist.phase}.` });
        }
      }
    }

    const p = artist.patron;
    if (!p) continue;
    const since = state.day - p.lastDeliveryDay;
    // The longer it's been, the likelier: no one waits a month for nothing.
    const overdue = 1 + Math.max(0, since - 7) * 0.15;
    const chance = PATRONAGE.deliveryChance * PATRONAGE.tiers[p.tier].speed * (0.6 + artist.form / 125) * overdue;
    if (since >= PATRONAGE.minDaysBetween && rng.chance(chance)) deliver(state, artist, rng);
  }
}

/** A sponsored artist sends a new work. It goes straight into storage. */
export function deliver(state: GameState, artist: Artist, rng: Rng): Id {
  const p = artist.patron!;
  const { painting } = freshPainting(state, artist, rng);
  const grade = rollGrade(artist, rng, 0.2);
  const id = `w-${state.nextId++}`;
  const title = painting?.title ?? `${rng.pick(TITLE_A)} ${rng.pick(TITLE_B)}`;
  const tags = [...new Set([...(painting?.tags ?? []), ...(artist.phase ? [artist.phase] : [])])];
  const work: Artwork = {
    id,
    title,
    artistId: artist.id,
    grade,
    value: 0,
    acquiredFor: 0,
    price: 0,
    status: 'storage',
    day: state.day,
    commissioned: true,
  };
  if (painting) work.image = painting.image;
  if (painting?.form) work.form = painting.form;
  if (tags.length) work.tags = tags;
  work.value = workValue(artist, work);
  work.price = Math.round((work.value * state.settings.defaultMarkup) / 50) * 50;
  state.artworks[id] = work;
  p.delivered += 1;
  p.lastDeliveryDay = state.day;
  const quality = grade >= 1.2 ? 'a standout piece' : grade >= 0.95 ? 'a solid piece' : 'a minor work';
  notify(state, { kind: 'delivery', text: `${first(artist)} delivered “${title}”, ${quality}. It’s in storage.` });
  return id;
}

/** Weekly, with the other bills: pay stipends, and rivals make their moves. */
export function weeklyPatronage(state: GameState, rng: Rng): void {
  let total = 0;
  for (const artist of Object.values(state.artists)) {
    const p = artist.patron;
    if (!p) continue;
    post(state, 'patronage', -p.stipend, `Stipend: ${artist.name}`);
    total += p.stipend;
    adjustRelationship(state, artist.id, PATRONAGE.tiers[p.tier].weeklyRelationship);

    if (p.courtedDay !== undefined) {
      if (atRisk(artist)) {
        // They gave you a week to do something about it.
        const rival = p.courtedBy ?? 'a rival gallery';
        artist.patron = undefined;
        artist.rivalUntil = state.day + PATRONAGE.rivalLockDays;
        adjustRelationship(state, artist.id, -15);
        notify(state, { kind: 'warn', text: `${first(artist)} left you for ${rival}. They’re off the market for ${PATRONAGE.rivalLockDays} days.` });
        continue;
      }
      wardOffRival(state, artist);
    } else if (artist.fame >= PATRONAGE.rivalMinFame && atRisk(artist)) {
      const chance = p.tier === 'modest' ? PATRONAGE.courtChanceModest : PATRONAGE.courtChanceUnhappy;
      if (rng.chance(chance)) {
        p.courtedDay = state.day;
        p.courtedBy = rng.pick(RIVAL_GALLERIES);
        notify(state, { kind: 'warn', text: `${p.courtedBy} is courting ${first(artist)}. Raise their stipend or win them over within a week.` });
      }
    }
  }
  if (total > 0) notify(state, { kind: 'bills', text: `Artist stipends paid: $${total.toLocaleString('en-US')}`, amount: -total });
}
