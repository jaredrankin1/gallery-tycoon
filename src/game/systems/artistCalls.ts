import { ARTIST_TALK, artistLook, LINES, READS, VOICES, type Voice } from '../../data/artistTalk';
import { TITLE_A, TITLE_B } from '../../data/artists';
import { ARTIST_CALLS, DIFFICULTY, GUESTS, RULES, TIME } from '../config';
import { clamp, type Rng } from '../rng';
import type { Artist, ArtistCall, Artwork, FloorPlan, GameState, Id, TalkOption, TalkTone } from '../types';
import { adjustRelationship, friendDiscount } from './artists';
import { workValue } from './careers';
import { notify } from './feed';
import { post } from './ledger';
import { freshPainting, rollGrade } from './market';
import { browseSpot, route } from './paths';
import { canSponsor, signPatron, stipendFor } from './patronage';
import { hash01 } from './taste';
import { absHour, type Segment } from './visits';

// Artists drop by the gallery with new work. You walk over and talk, RPG style:
// say things they like and they warm to you, tell people about you (reputation),
// and sell to you for less than the dealers ask.
//
// The conversation runs greet -> show -> deal -> farewell. Each line you pick
// has a tone; how an artist takes each tone comes from their traits (see
// TRAIT_TASTE), so knowing them (People > Artists) is how you talk well.

const first = (a: Artist) => a.name.split(' ')[0];
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Who speaks for the artist: themselves, or an envoy for an estate. */
export const speakerName = (a: Artist) => ARTIST_TALK[a.id]?.speaker ?? a.name;

/** How each trait takes each tone. Added up per artist, then clamped to -3..3. */
const TRAIT_TASTE: Record<string, Partial<Record<TalkTone, number>>> = {
  social: { warm: 2, wine: 1, business: -1, blunt: -1 },
  'loves-wine': { wine: 2 },
  reclusive: { process: 2, business: 1, hype: -2, flatter: -1, warm: -1 },
  diva: { flatter: 2, wine: 1, business: -1, blunt: -2, haggle: -2 },
  trendy: { hype: 2, warm: 1, process: -1 },
  'cheese-snob': { cheese: 2, flatter: 1, hype: -1, blunt: -1 },
  easygoing: { warm: 1, process: 1, blunt: -1 },
};
/** Everyone: being understood is lovely, being misread or brushed off is not. */
const BASE_TASTE: Partial<Record<TalkTone, number>> = { read: 2, misread: -2, blunt: -1, buy: 1, rudePass: -2 };

export function toneScore(artist: Artist, tone: TalkTone): number {
  let s = BASE_TASTE[tone] ?? 0;
  for (const t of artist.traits) s += TRAIT_TASTE[t]?.[tone] ?? 0;
  return clamp(s, -3, 3);
}

export function voiceOf(artist: Artist): Voice {
  const t = artist.traits;
  if (t.includes('diva')) return 'diva';
  if (t.includes('reclusive')) return 'recluse';
  if (t.includes('social') || t.includes('loves-wine')) return 'social';
  if (t.includes('trendy')) return 'trendy';
  if (t.includes('cheese-snob')) return 'snob';
  return 'easy';
}

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

// ---- Arrivals ---------------------------------------------------------------

/** Artists who might drop in today, weighted toward the ones who like you. */
function candidates(state: GameState, rng: Rng): Artist[] {
  const out: Artist[] = [];
  for (const a of Object.values(state.artists)) {
    if (a.patron || (a.rivalUntil ?? 0) > state.day || a.relationship < ARTIST_CALLS.minRelationship) continue;
    const { hasCatalogue, painting } = freshPainting(state, a, rng);
    if (hasCatalogue && !painting) continue;
    const w = 1 + Math.max(0, a.relationship) / 20 + (a.fame < 30 ? 0.5 : 0);
    for (let i = 0; i < Math.round(w * 2); i++) out.push(a);
  }
  return out;
}

/** Hourly: maybe someone walks in; someone waiting may give up; someone leaving is gone. */
export function artistCallHour(state: GameState, rng: Rng): void {
  const now = absHour(state);
  const call = state.artistCall;
  if (call) {
    if (call.stage === 'waiting' && now >= call.leaveBy) {
      const artist = state.artists[call.artistId];
      walkOut(state, now);
      adjustRelationship(state, call.artistId, -ARTIST_CALLS.ignoredPenalty);
      if (artist) notify(state, { kind: 'warn', text: `${first(artist)} waited a long time, then left with their work.` });
    } else if (call.stage === 'done' && now >= (call.leftAt ?? now) + ARTIST_CALLS.walkHours + 0.5) {
      state.artistCall = null;
    }
    return;
  }
  const memo = (state.artistCalls ??= { count: 0, lastDay: 0 });
  if (memo.lastDay === state.day) return;
  const [from, to] = ARTIST_CALLS.hours;
  if (state.tick < from || state.tick > to) return;
  // Day one: someone always drops by after lunch, so you meet the idea early.
  const firstEver = memo.count === 0 && state.tick >= ARTIST_CALLS.firstVisitTick;
  if (!firstEver && !rng.chance(ARTIST_CALLS.hourlyChance)) return;
  const pool = candidates(state, rng);
  if (!pool.length) return;
  // The first one is a gentle soul, so the first conversation is a friendly one.
  const easy = pool.filter((a) => a.temperament <= 0.8);
  startArtistCall(state, (firstEver && easy.length ? rng.pick(easy) : rng.pick(pool)).id, rng);
}

/** An artist walks in with one or two pieces to show you. */
export function startArtistCall(state: GameState, artistId: Id, rng: Rng): ArtistCall | undefined {
  const artist = state.artists[artistId];
  if (!artist) return;
  const now = absHour(state);
  const workIds: Id[] = [];
  const count = rng.chance(ARTIST_CALLS.twoWorksChance) ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const id = bringWork(state, artist, rng);
    if (id) workIds.push(id);
  }
  if (!workIds.length) return;
  const key = `${artistId}@${now}`;
  const at = browseSpot(state.floor, key) ?? { x: state.floor.width / 2, y: state.floor.height / 2 };
  const endOfDay = Math.floor(now / TIME.ticksPerDay) * TIME.ticksPerDay + ARTIST_CALLS.leaveByTick;
  const call: ArtistCall = {
    artistId,
    look: artistLook(artistId),
    arrive: now,
    leaveBy: Math.max(now + 3, Math.min(now + ARTIST_CALLS.waitHours, endOfDay)),
    at,
    faceLeft: hash01(key) < 0.5,
    workIds,
    stage: 'waiting',
    rapport: 0,
    discount: 0,
    bought: [],
    line: '',
    options: [],
    log: [],
  };
  state.artistCall = call;
  const memo = (state.artistCalls ??= { count: 0, lastDay: 0 });
  memo.count += 1;
  memo.lastDay = state.day;
  const what = workIds.length > 1 ? 'two new pieces' : 'a new piece';
  notify(state, { kind: 'artist', face: 'assistant', text: `${speakerName(artist)} just walked in with ${what}. Tap them on the floor to talk.` });
  return call;
}

/** A piece the artist brings along: priced below what the dealers ask. */
function bringWork(state: GameState, artist: Artist, rng: Rng): Id | undefined {
  const { hasCatalogue, painting } = freshPainting(state, artist, rng);
  if (hasCatalogue && !painting) return;
  const grade = rollGrade(artist, rng);
  const value = workValue(artist, { grade });
  const diff = DIFFICULTY[state.difficulty];
  const price = Math.round((value * diff.artPriceMultiplier * ARTIST_CALLS.priceMultiple * (1 - friendDiscount(artist))) / 50) * 50;
  const id = `w-${state.nextId++}`;
  const work: Artwork = {
    id,
    title: painting?.title ?? `${rng.pick(TITLE_A)} ${rng.pick(TITLE_B)}`,
    artistId: artist.id,
    value,
    grade,
    acquiredFor: 0,
    price,
    status: 'offered',
    day: state.day,
    withArtist: true,
  };
  if (painting) {
    work.image = painting.image;
    work.tags = painting.tags;
    if (painting.form) work.form = painting.form;
  }
  state.artworks[id] = work;
  return id;
}

/** They head for the door: unbought pieces leave with them. */
function walkOut(state: GameState, at: number) {
  const call = state.artistCall;
  if (!call) return;
  call.stage = 'done';
  call.leftAt = at;
  call.options = [];
  for (const id of call.workIds) if (!call.bought.includes(id)) delete state.artworks[id];
}

// ---- Conversation -----------------------------------------------------------

export const callPrice = (state: GameState, call: ArtistCall, ids: Id[]) => {
  const sum = ids.reduce((s, id) => s + (state.artworks[id]?.price ?? 0), 0);
  const pairCut = ids.length > 1 ? ARTIST_CALLS.pairCut : 0;
  return Math.round((sum * (1 - pairCut) * (1 - call.discount)) / 50) * 50;
};

/** You walk over. They say hello. */
export function beginTalk(state: GameState, rng: Rng): string | void {
  const call = state.artistCall;
  if (!call || call.stage === 'done') return 'Nobody’s waiting to talk.';
  if (call.stage !== 'waiting') return;
  const artist = state.artists[call.artistId];
  call.stage = 'greet';
  say(call, ARTIST_TALK[artist.id]?.greeting ?? `Hi. I’m ${artist.name}. I brought some work.`);
  call.options = greetOptions(artist, rng);
}

function say(call: ArtistCall, text: string) {
  call.line = text;
  call.log.push({ who: 'artist', text });
}

function pickN<T>(rng: Rng, xs: T[], n: number): T[] {
  const pool = [...xs];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  return out;
}

const shuffle = <T>(rng: Rng, xs: T[]) => pickN(rng, xs, xs.length);

function greetOptions(artist: Artist, rng: Rng): TalkOption[] {
  const g = LINES.greet;
  const friend = artist.relationship >= 35;
  const v = { first: first(artist) };
  const pool: TalkOption[] = [
    { id: 'warm', tone: 'warm', text: fill(rng.pick(friend ? g.warmFriend : g.warm), v) },
    { id: 'wine', tone: 'wine', text: rng.pick(g.wine) },
    { id: 'cheese', tone: 'cheese', text: rng.pick(g.cheese) },
    { id: 'flatter', tone: 'flatter', text: rng.pick(g.flatter) },
    { id: 'hype', tone: 'hype', text: rng.pick(g.hype) },
    { id: 'blunt', tone: 'blunt', text: rng.pick(g.blunt) },
  ];
  let picks = pickN(rng, pool, 2);
  // Always leave a way to get it right, if this artist likes anything at all.
  if (!picks.some((o) => toneScore(artist, o.tone) > 0)) {
    const good = pool.filter((o) => toneScore(artist, o.tone) > 0);
    if (good.length) picks = [picks[0], rng.pick(good)];
  }
  return shuffle(rng, [...picks, { id: 'business', tone: 'business', text: rng.pick(g.business) }]);
}

function showOptions(artist: Artist, work: Artwork, rng: Rng): TalkOption[] {
  const own = new Set([...(work.tags ?? []), ...artist.tags]);
  const right = [...own].filter((t) => READS[t] && t !== 'painting' && t !== 'sculpture');
  const wrong = Object.keys(READS).filter((t) => !own.has(t) && t !== 'painting' && t !== 'sculpture');
  const s = LINES.show;
  const opts: TalkOption[] = [];
  if (right.length) {
    const tag = rng.pick(right);
    opts.push({ id: 'read', tone: 'read', text: READS[tag], tag });
  }
  if (wrong.length) {
    const tag = rng.pick(wrong);
    opts.push({ id: 'misread', tone: 'misread', text: READS[tag], tag });
  }
  const extra = rng.pick(['process', 'hype', 'flatter', 'blunt'] as const);
  const text = extra === 'process' ? s.process[work.form ?? 'painting'] : rng.pick(s[extra]);
  opts.push({ id: extra, tone: extra, text });
  return shuffle(rng, opts);
}

function dealOptions(state: GameState, call: ArtistCall): TalkOption[] {
  const [a, b] = call.workIds.map((id) => state.artworks[id]);
  const d = LINES.deal;
  const opts: TalkOption[] = [{ id: 'buy', tone: 'buy', text: fill(d.buy, { title: a.title, price: money(callPrice(state, call, [a.id])) }), workIds: [a.id] }];
  if (b) {
    opts.push({ id: 'buy2', tone: 'buy', text: fill(d.buy, { title: b.title, price: money(callPrice(state, call, [b.id])) }), workIds: [b.id] });
    opts.push({ id: 'both', tone: 'buy', text: fill(d.both, { price: money(callPrice(state, call, call.workIds)) }), workIds: [...call.workIds] });
  }
  if (!call.haggled) {
    const ask = Math.round((callPrice(state, call, [a.id]) * (1 - ARTIST_CALLS.haggleCut)) / 50) * 50;
    opts.push({ id: 'haggle', tone: 'haggle', text: fill(d.haggle, { price: money(ask) }) });
  }
  opts.push({ id: 'pass', tone: 'pass', text: d.pass });
  opts.push({ id: 'rudePass', tone: 'rudePass', text: d.rudePass });
  return opts;
}

/** Their reaction to your line, in their voice. Returns -1 / 0 / 1 for the transcript. */
function react(call: ArtistCall, artist: Artist, tone: TalkTone, rng: Rng): -1 | 0 | 1 {
  const score = toneScore(artist, tone);
  call.rapport += score;
  const v = VOICES[voiceOf(artist)];
  const feel = score > 0 ? 1 : score < 0 ? -1 : 0;
  if (tone === 'read' || tone === 'misread') say(call, rng.pick(tone === 'read' ? LINES.read.right : LINES.read.wrong));
  else say(call, rng.pick(feel > 0 ? v.up : feel < 0 ? v.down : v.flat));
  return feel;
}

/** You pick a line. They react and the conversation moves on. */
export function chooseTalk(state: GameState, optionId: string, rng: Rng): string | void {
  const call = state.artistCall;
  if (!call || call.stage === 'waiting' || call.stage === 'done') return 'Nobody’s talking to you.';
  const opt = call.options.find((o) => o.id === optionId);
  if (!opt) return 'You can’t say that now.';
  const artist = state.artists[call.artistId];
  const voice = VOICES[voiceOf(artist)];

  if (opt.tone === 'buy') {
    const ids = opt.workIds ?? [];
    const price = callPrice(state, call, ids);
    if (state.cash - price < RULES.overdraftLimit) return 'You can’t afford that.';
    const each = ids.map((id) => state.artworks[id]);
    const total = each.reduce((s, w) => s + w.price, 0) || 1;
    for (const w of each) {
      const paid = Math.round((price * w.price) / total);
      post(state, 'art', -paid, `Bought "${w.title}" from ${artist.name}`);
      w.acquiredFor = paid;
      w.price = Math.round((w.value * state.settings.defaultMarkup) / 50) * 50;
      w.status = 'storage';
      w.day = state.day;
      delete w.withArtist;
      call.bought.push(w.id);
    }
  }

  call.log.push({ who: 'you', text: opt.text });
  const feel = react(call, artist, opt.tone, rng);
  call.log[call.log.length - 2].feel = feel;

  switch (call.stage) {
    case 'greet': {
      call.stage = 'show';
      const work = state.artworks[call.workIds[0]];
      say(call, fill(rng.pick(voice.show), { title: work.title }));
      call.options = showOptions(artist, work, rng);
      return;
    }
    case 'show': {
      call.stage = 'deal';
      pitch(state, call, artist, rng);
      return;
    }
    case 'deal': {
      if (opt.tone === 'haggle') {
        call.haggled = true;
        const odds = clamp(ARTIST_CALLS.haggleBase + call.rapport * 0.06 - (artist.temperament - 1) * 0.4, 0.05, 0.9);
        if (rng.chance(odds)) {
          call.discount = ARTIST_CALLS.haggleCut;
          const price = money(callPrice(state, call, [call.workIds[0]]));
          // The reaction line was about the asking; swap it for their answer.
          call.log.pop();
          say(call, fill(rng.pick(voice.haggleYes), { price }));
        } else {
          call.rapport -= 1;
          call.log.pop();
          say(call, rng.pick(voice.haggleNo));
          call.log[call.log.length - 2].feel = -1;
        }
        call.options = dealOptions(state, call);
        return;
      }
      farewell(state, call, artist, rng);
      return;
    }
    case 'farewell': {
      if (opt.tone === 'sponsor') {
        const err = signPatron(state, artist.id, 'fair');
        call.log.pop();
        say(call, err ? `Oh. ${err}` : rng.pick(LINES.bye.sponsorYes));
        call.options = [{ id: 'bye', tone: 'bye', text: rng.pick(LINES.bye.bye) }];
        return;
      }
      walkOut(state, absHour(state) + 1);
      return;
    }
  }
}

function pitch(state: GameState, call: ArtistCall, artist: Artist, rng: Rng) {
  const voice = VOICES[voiceOf(artist)];
  const a = state.artworks[call.workIds[0]];
  let line = fill(rng.pick(voice.price), { title: a.title, price: money(callPrice(state, call, [a.id])) });
  if (call.workIds.length > 1) line += ' ' + fill(rng.pick(voice.pair), { price: money(callPrice(state, call, call.workIds)) });
  say(call, line);
  call.options = dealOptions(state, call);
}

/** The deal's done (or not): they tell you what they think of you, and the word gets round. */
function farewell(state: GameState, call: ArtistCall, artist: Artist, rng: Rng) {
  call.stage = 'farewell';
  const r = call.rapport;
  const relationship = adjustRelationship(state, artist.id, r * ARTIST_CALLS.relationshipPerRapport + (call.bought.length ? ARTIST_CALLS.boughtBonus : 0));
  // Artists talk. A good chat with a well-known artist does more for your name.
  let reputation = 0;
  if (r >= ARTIST_CALLS.repFrom) reputation = (r - ARTIST_CALLS.repFrom + 1) * ARTIST_CALLS.repPerRapport * (0.6 + artist.fame / 100);
  else if (r <= ARTIST_CALLS.repLossFrom) reputation = (r - ARTIST_CALLS.repLossFrom - 1) * ARTIST_CALLS.repPerRapport * 0.6;
  reputation = Math.round(reputation * 10) / 10;
  state.reputation = clamp(state.reputation + reputation, 0, 100);
  // Talking about the work counts toward knowing where their career is going.
  artist.studioVisits += 1;
  call.result = { relationship, reputation };
  const voice = VOICES[voiceOf(artist)];
  say(call, rng.pick(r >= 3 ? voice.byeGood : r >= 0 ? voice.byeOk : voice.byeBad));
  call.options = [{ id: 'bye', tone: 'bye', text: rng.pick(LINES.bye.bye) }];
  if (r >= 2 && !canSponsor(state, artist)) {
    call.options.unshift({ id: 'sponsor', tone: 'sponsor', text: fill(LINES.bye.sponsor, { price: money(stipendFor(artist, 'fair')) }) });
  }
  if (reputation > 0) notify(state, { kind: 'artist', text: `${first(artist)} is telling people good things about you. Reputation +${reputation}.` });
  else if (reputation < 0) notify(state, { kind: 'warn', text: `${first(artist)} is grumbling about you around town. Reputation ${reputation}.` });
}

/** You walk off mid-conversation. Rude, but sometimes you're busy. */
export function leaveTalk(state: GameState): string | void {
  const call = state.artistCall;
  if (!call || call.stage === 'done') return;
  if (call.stage === 'waiting') {
    // Not talking yet: they keep waiting.
    return;
  }
  if (call.stage !== 'farewell') {
    const artist = state.artists[call.artistId];
    adjustRelationship(state, call.artistId, -ARTIST_CALLS.walkAwayPenalty);
    notify(state, { kind: 'warn', text: `You walked off on ${first(artist)}. They packed up and left.` });
  }
  walkOut(state, absHour(state) + 1);
}

// ---- On the floor -------------------------------------------------------------

/** Where the visiting artist walks and stands, for the renderer. Same shape as a visit's timeline. */
export function callTimeline(call: ArtistCall, floor: FloorPlan): Segment[] {
  const segs: Segment[] = [];
  const door = { x: floor.entrance.x + 0.5, y: floor.entrance.y + 0.5 };
  let t = call.arrive;
  let pos = door;
  const walk = (to: { x: number; y: number }) => {
    for (const p of route(floor, pos, to, `artist${call.artistId}${t}`)) {
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d < 0.01) continue;
      const dur = d / GUESTS.walkTilesPerHour;
      segs.push({ anim: 'walk', start: t, end: t + dur, from: pos, to: p, faceLeft: p.x - pos.x - (p.y - pos.y) < 0 });
      t += dur;
      pos = p;
    }
  };
  walk(call.at);
  const until = call.leftAt ?? (call.stage === 'waiting' ? call.leaveBy : t + 10_000);
  if (until > t) {
    segs.push({ anim: call.stage === 'waiting' ? 'idle' : 'chat', start: t, end: until, from: pos, to: pos, faceLeft: call.faceLeft });
    t = until;
  }
  if (call.leftAt !== undefined) walk(door);
  return segs;
}
