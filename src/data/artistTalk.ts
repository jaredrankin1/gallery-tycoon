import type { Id } from '../game/types';

// How each artist looks and sounds when they drop by the gallery with new work.
//
// LOOKS: for now every artist borrows one of the visitor sprite sheets, recoloured
// (variant 1-4 shifts clothes and hair, never skin) so they don't read as that
// visitor. When a new artist sheet arrives: slice it into src/assets/sprites/
// (<name>.png, <name>-portrait.png, an entry in sprites.json with the visitor
// animations), then point the artist at it here with variant 0. Nothing else changes.

export interface ArtistLook {
  sprite: string;
  variant: number;
}

export interface ArtistVoiceSeed {
  look: ArtistLook;
  /** First thing they say when you walk over. */
  greeting: string;
  /** Who actually turns up, when the artist is an estate or a studio. */
  speaker?: string;
}

export const ARTIST_TALK: Record<Id, ArtistVoiceSeed> = {
  'a-mara': { look: { sprite: 'rosa', variant: 2 }, greeting: 'Sorry, I came straight from the night bus. I had to show someone this while the varnish is still talking to me.' },
  'a-tobias': { look: { sprite: 'edmund', variant: 3 }, greeting: 'You’re not wearing a blazer. Good. I nearly turned round at the door.' },
  'a-junie': { look: { sprite: 'mei', variant: 4 }, greeting: 'Hiii. I posted that I was coming here, so, no pressure, but forty thousand people are waiting to hear how this goes.' },
  'a-hollis': { look: { sprite: 'theo', variant: 1 }, greeting: 'Hello there. I hope I’m not interrupting. I brought a little something from the coast.' },
  'a-sable': { look: { sprite: 'amara', variant: 3 }, greeting: 'The light in here is… acceptable. I’ve seen worse. Not often.' },
  'a-ines': { look: { sprite: 'beatrix', variant: 2 }, greeting: 'Your wall spacing is off by about four centimetres. I noticed on the way in. Anyway. Hello.' },
  'a-kiyo': { look: { sprite: 'kofi', variant: 3 }, greeting: 'I don’t usually come into the city. The block for this one took most of the autumn.' },
  'a-rook': { look: { sprite: 'fen', variant: 2 }, greeting: 'Whoa, great room. Bad playlist, but great room. I brought eyes. Lots of eyes.' },
  'a-wren': { look: { sprite: 'hana', variant: 1 }, greeting: 'Hi! I’ve been sketching your front window from the café across the street all week. Is that weird? That’s probably weird.' },
  'a-ottoline': { look: { sprite: 'victor', variant: 4 }, greeting: 'I measured your doorway. You can fit what I brought, with eleven millimetres to spare.' },
  'a-pilar': { look: { sprite: 'sunny', variant: 3 }, greeting: 'Hola. Your room has a nice hum to it. The stone likes it, I can tell.' },
  'a-dex': { look: { sprite: 'dot', variant: 1 }, greeting: 'Okay, don’t freak out, but I brought a toaster. It’s a shrine now. You’re welcome.' },
  'a-konrad': { look: { sprite: 'edmund', variant: 1 }, greeting: 'Your floor. Is it reinforced? Never mind. I brought the small one.' },
  'a-noor': { look: { sprite: 'rosa', variant: 4 }, greeting: 'Hello! I brought one of my frogs to meet you. His name is Gerald. He’s nervous.' },
  'a-tilde': { look: { sprite: 'beatrix', variant: 4 }, greeting: 'Hi hi. Don’t mind the knitting, my hands get bored. I brought you something soft.' },
  'a-juno': { look: { sprite: 'mei', variant: 2 }, greeting: 'Hey! This one’s from the new run. Number one of twelve. Glitter got everywhere, sorry.' },
  'a-ollie': { look: { sprite: 'fen', variant: 4 }, greeting: 'Hey. This little guy wanted to see your gallery. He looks annoyed, but that means he likes it.' },
  'a-castellani': {
    look: { sprite: 'victor', variant: 2 },
    speaker: 'Signora Castellani',
    greeting: 'Buongiorno. The family asked me to see where Great-uncle Aurelio might live next. He is very particular.',
  },
};

/** Look for an artist with no entry above (new seeds): a stable pick from the visitor sheets. */
const FALLBACK_SPRITES = ['amara', 'dot', 'edmund', 'fen', 'mei', 'rosa', 'theo', 'victor', 'kofi', 'hana', 'beatrix', 'sunny'];

export function artistLook(artistId: Id): ArtistLook {
  const known = ARTIST_TALK[artistId]?.look;
  if (known) return known;
  let h = 0;
  for (const c of artistId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { sprite: FALLBACK_SPRITES[h % FALLBACK_SPRITES.length], variant: 1 + (h % 4) };
}

// ---- Voices -------------------------------------------------------------------
// Every artist speaks in one of these voices, picked from their traits.

export type Voice = 'diva' | 'recluse' | 'social' | 'trendy' | 'snob' | 'easy';

export interface VoiceLines {
  /** Reacting to something you said: liked it, shrugged, didn't like it. */
  up: string[];
  flat: string[];
  down: string[];
  /** Showing the piece. {title} */
  show: string[];
  /** Naming a price. {title} {price} */
  price: string[];
  /** Both pieces. {price} is for the pair. */
  pair: string[];
  haggleYes: string[];
  haggleNo: string[];
  /** Goodbyes by how it went. */
  byeGood: string[];
  byeOk: string[];
  byeBad: string[];
}

export const VOICES: Record<Voice, VoiceLines> = {
  diva: {
    up: ['Finally, someone who understands.', 'Yes. You may continue.', 'Mm. You have some taste after all.'],
    flat: ['I suppose.', 'Hm.', 'If you say so.'],
    down: ['I’m going to pretend you didn’t say that.', 'How very… commercial of you.', 'I’ve walked out of bigger galleries for less.'],
    show: ['This is “{title}”. Take your time. Most people need it.', '“{title}”. Don’t touch. Just look.'],
    price: ['“{title}” is {price}. That is a gift, frankly.', 'For you, {price}. My dealer would weep.'],
    pair: ['Both? {price}. And you will hang them together.'],
    haggleYes: ['Fine. {price}. Don’t tell anyone.'],
    haggleNo: ['No. I don’t do discounts. I do art.', 'Haggling. How quaint. No.'],
    byeGood: ['I may let you show me again. We’ll see. Ciao.', 'You may tell people I came by. You will anyway.'],
    byeOk: ['Well. It was a visit.', 'I have another appointment. There is always another appointment.'],
    byeBad: ['Don’t call me. My people will not call you.', 'I knew I should have sent my assistant.'],
  },
  recluse: {
    up: ['…Yes. That’s right.', 'Huh. Not many people see that.', 'Okay. You actually looked.'],
    flat: ['Mm.', 'Sure.', '…Okay.'],
    down: ['I don’t really do that kind of talk.', 'That’s… not what it’s about.', 'I should get back to the studio.'],
    show: ['This is “{title}”. It took a while.', '“{title}.” You can look at it. I’ll wait.'],
    price: ['I need {price} for “{title}”. That covers the materials and the time.', '{price}. I worked it out. It’s fair.'],
    pair: ['Both for {price}. I’d rather they stayed together.'],
    haggleYes: ['…Fine. {price}. I just want it somewhere good.'],
    haggleNo: ['No. That’s what it costs.', 'I can’t go lower. Sorry.'],
    byeGood: ['This was… nice, actually. I’ll come back.', 'You can visit the studio sometime. If you want.'],
    byeOk: ['Okay. Bye.', 'I’ll head off, then.'],
    byeBad: ['I won’t be back.', 'This is why I don’t leave the studio.'],
  },
  social: {
    up: ['Ha! I like you.', 'Oh, we’re going to be friends.', 'See, THIS is why I came here.'],
    flat: ['Ha, sure, sure.', 'Fair enough!', 'Mm-hm!'],
    down: ['Oof. Okay.', 'Wow, tough crowd.', 'That’s a bit cold, isn’t it?'],
    show: ['Okay, okay, this is “{title}”. Tell me what you see!', 'Ta-da! “{title}”. I haven’t shown anyone yet.'],
    price: ['I was thinking {price} for “{title}”. Mates’ rates!', '{price} and it’s yours. I’ll even come to the opening.'],
    pair: ['Take both and I’ll do {price}. Can’t say fairer.'],
    haggleYes: ['Oh go on then. {price}. You owe me a drink.'],
    haggleNo: ['Ha, nice try. No.', 'Not a chance, friend. That’s already low.'],
    byeGood: ['This was brilliant. I’m telling everyone about this place!', 'Right, I’m off, but I’ll be back. With friends.'],
    byeOk: ['Good to meet you! See you around.', 'Right, places to be. Cheers!'],
    byeBad: ['Well. That was a waste of a bus fare.', 'I’ll show it somewhere friendlier.'],
  },
  trendy: {
    up: ['Okay that’s actually so real.', 'Wait, you get it. Love that.', 'Obsessed with that answer.'],
    flat: ['Cool cool.', 'Sure, yeah.', 'Okay, noted.'],
    down: ['That’s a bit… dated?', 'Yikes. Okay.', 'Not the vibe, honestly.'],
    show: ['So this is “{title}”. It’s from the new drop.', 'Okay, “{title}”. People are already asking about it.'],
    price: ['“{title}” is {price}. Honestly it’ll be double that next year.', '{price}. Collectors online were offering more.'],
    pair: ['Both for {price}. That’s a bundle deal, basically.'],
    haggleYes: ['Okay fine. {price}. But I’m posting that you got a deal.'],
    haggleNo: ['Nah, that’s the price. Demand is crazy right now.', 'Can’t. The market’s set it, not me.'],
    byeGood: ['I’m posting about this place tonight. Tagging you!', 'This was a vibe. Talk soon!'],
    byeOk: ['Okay, catch you later!', 'Cool, I’ve got another thing. Bye!'],
    byeBad: ['Yeah, I don’t think this is my scene.', 'Not posting about this one.'],
  },
  snob: {
    up: ['Ah. A person of some refinement.', 'Correct. Rarely heard, but correct.', 'Now that is a civilised remark.'],
    flat: ['Indeed.', 'Quite.', 'If one must.'],
    down: ['Good heavens.', 'I see the cheese was not the only thing that was cheap.', 'How disappointing.'],
    show: ['May I present “{title}”. Do look properly.', '“{title}”. It rewards attention. Most people lack it.'],
    price: ['“{title}”: {price}. Which is, I assure you, modest.', 'I would accept {price}. One doesn’t haggle over this sort of thing.'],
    pair: ['The pair, {price}. They were made to be seen together.'],
    haggleYes: ['Very well. {price}. Only because you were gracious.'],
    haggleNo: ['One does not haggle over this sort of thing.', 'No. And I’m surprised you asked.'],
    byeGood: ['A pleasure, truly. I shall recommend you.', 'Delightful. I may return.'],
    byeOk: ['Good day.', 'Well. Good day to you.'],
    byeBad: ['I shan’t be returning.', 'Good day. Truly, a day.'],
  },
  easy: {
    up: ['Oh, that’s kind of you.', 'Ha, I like that.', 'That made my day, honestly.'],
    flat: ['Sure, sure.', 'That’s fair.', 'Mm, could be.'],
    down: ['Oh. Well, alright.', 'Hm. Okay then.', 'That’s a little sharp.'],
    show: ['This is “{title}”. I hope you like it.', 'Here she is. “{title}”. Took me a while.'],
    price: ['I was hoping for {price} for “{title}”. Does that sound fair?', 'Would {price} work? I’d like it to go somewhere nice.'],
    pair: ['Both for {price}? They keep each other company.'],
    haggleYes: ['Oh, alright. {price} it is.'],
    haggleNo: ['I’m sorry, I really can’t go lower.', 'I’d love to, but I need that much.'],
    byeGood: ['This was lovely. Thank you for having me.', 'I’ll come back soon, if that’s alright.'],
    byeOk: ['Thanks for your time!', 'Well, I’ll be off. Bye now.'],
    byeBad: ['Oh well. Take care.', 'I’ll try somewhere else, I think.'],
  },
};

/** What you say about a piece, by the quality you notice. Matching the work's real tags is the right read. */
export const READS: Record<string, string> = {
  portrait: 'The face. You can tell exactly what they’re thinking.',
  figurative: 'The way the figure holds itself says everything.',
  moody: 'It’s so moody. It feels like three in the morning.',
  classic: 'There’s real old-school craft in this.',
  industrial: 'I love the industrial edge. It feels salvaged.',
  experimental: 'It’s properly experimental. I’ve never seen anything like it.',
  rough: 'The raw material is part of the point, isn’t it?',
  digital: 'The digital feel is so crisp. Every pixel counts.',
  colorful: 'That colour! It practically hums.',
  pop: 'It’s pure pop. Loud and confident.',
  landscape: 'You can almost feel the weather in that landscape.',
  quiet: 'It’s so quiet. It makes the whole room calm down.',
  minimal: 'Nothing wasted. Every line is there for a reason.',
  geometric: 'The geometry is so precise. It’s like a proof.',
  retro: 'It has that retro future feeling. Very 1962.',
  print: 'The printing is so careful. You can see the grain.',
  weird: 'It’s gloriously weird. I mean that as praise.',
  illustration: 'It feels like a page from a story I want to read.',
  fantasy: 'It’s a whole other world in there.',
  organic: 'It looks like it might breathe.',
  ceramic: 'The glaze is beautiful. It looks wet still.',
  textile: 'I want to touch it so badly. All that texture.',
  toy: 'It has so much character for something so small.',
  installation: 'It changes the whole space around it.',
  sculpture: 'It really owns the space it sits in.',
  painting: 'The brushwork is so confident.',
};

export const LINES = {
  greet: {
    warm: ['Come in, {first}! It’s really good to meet you.', 'Welcome! I’ve been hoping you’d stop by, {first}.'],
    warmFriend: ['{first}! Come in, it’s always good to see you.'],
    wine: ['Glass of wine? I just opened something nice.', 'You look like you could use a glass of red.'],
    cheese: ['There’s a board of aged comté in the back. Help yourself.', 'Can I tempt you with some cheese? Proper stuff, not supermarket.'],
    flatter: ['I’ve followed your work for years. This is an honour.', 'Honestly, I’m a little starstruck.'],
    hype: ['Your stuff is all over my feed lately.', 'Everyone’s talking about you right now.'],
    business: ['Let’s get straight to it. What did you bring?', 'Good to meet you. Shall we look at the work?'],
    blunt: ['We’re slammed today. You’ve got five minutes.', 'I wasn’t expecting anyone. Make it quick.'],
  },
  show: {
    process: { painting: 'Walk me through how you made it.', sculpture: 'How did you build this? I want to know everything.', hanging: 'How long did this take to make?' },
    hype: ['This would blow up online.', 'People are going to fight over this.'],
    flatter: ['It’s a masterpiece. Truly.', 'This is the best thing you’ve ever made.'],
    blunt: ['It’s fine. A bit safe, maybe.', 'Hm. I’ve seen a lot like it.'],
  },
  deal: {
    buy: 'I’ll take “{title}” for {price}.',
    both: 'I’ll take both for {price}.',
    haggle: 'Could you do {price}?',
    pass: 'Not this time, but I’m really glad you came by.',
    rudePass: 'That’s way too much for this.',
  },
  bye: {
    bye: ['Thanks for coming by.', 'Come back any time.'],
    sponsor: 'Would you take a stipend from us? {price} a week, and you send us new work.',
    sponsorYes: ['A stipend? …Yes. Yes! Thank you.'],
  },
  /** Reacting to a read of the work, right or wrong. */
  read: {
    right: ['Yes! Exactly. Nobody ever notices that.', 'That’s it. That’s the whole thing.', 'You actually see it. Thank you.'],
    wrong: ['…That’s not really what it’s about.', 'Huh. I don’t see that at all.', 'Did you look at the right piece?'],
  },
};
