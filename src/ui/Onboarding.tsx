import { useState } from 'preact/hooks';
import { ASSISTANT, clearSave, COLLECTION, createNewGame, DIFFICULTY, loadGame, saveGame, VENUE, type Difficulty, type StartingCollection, type VenueType } from '../game';
import { portraitUrl } from '../render/sprites';
import { money } from './bits';
import { useGame } from './context';

/** Seed for the room you look at while choosing, so it doesn't reshuffle on every tap. */
export const PREVIEW_SEED = 7;

const MONEY: { id: Difficulty; title: string; note: string }[] = [
  { id: 'easy', title: 'A trust fund', note: 'Room to make mistakes. Your name opens doors.' },
  { id: 'normal', title: 'Savings and a bank loan', note: 'Enough to start right, not enough to waste.' },
  { id: 'hard', title: 'Whatever’s under the mattress', note: 'Every bottle of wine counts. Nobody knows you yet.' },
];

const NAMES: Record<VenueType, string[]> = {
  gallery: ['Salt & Linen', 'Gallery Nine', 'The Back Room', 'Hanging Garden'],
  museum: ['The Harbor Museum', 'Museum of Small Hours', 'The Lantern House', 'Hall of Quiet Things'],
};

type Step = 'welcome-back' | 'venue' | 'money' | 'collection' | 'name';
type Collection = Exclude<StartingCollection, 'none'>;

/**
 * First run, told over the live room: Marisol, your gallery assistant, walks you through
 * one choice at a time, and the room behind updates as you pick.
 */
export function Onboarding({ onDone }: { onDone: (fresh: boolean) => void }) {
  const { store } = useGame();
  const [save] = useState(() => loadGame());
  const [step, setStep] = useState<Step>(save ? 'welcome-back' : 'venue');
  const [venue, setVenue] = useState<VenueType>(store.state.venue);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [name, setName] = useState('');
  const [collection, setCollection] = useState<Collection | null>(null);

  const preview = (v: VenueType, d: Difficulty, c: Collection | null = collection) => {
    setVenue(v);
    setDifficulty(d);
    setCollection(c);
    store.load(createNewGame({ name: '', difficulty: d, venue: v, seed: PREVIEW_SEED, collection: c ?? 'none' }), 0);
  };

  /** What each collection would hand you, for the cards. */
  const worth = (c: Collection) => {
    const g = createNewGame({ name: '', difficulty, venue, seed: PREVIEW_SEED, collection: c });
    const works = Object.values(g.artworks).filter((w) => w.source === c);
    return { works: works.length, value: works.reduce((t, w) => t + w.value, 0), cash: g.cash };
  };

  const open = () => {
    clearSave();
    const game = createNewGame({ name, difficulty, venue, autoHang: true, collection: collection ?? 'personal' });
    store.autosave = true;
    store.load(game, 1);
    saveGame(game);
    onDone(true);
  };

  const steps: Step[] = ['venue', 'money', 'collection', 'name'];
  const at = steps.indexOf(step);
  const back = at > 0 ? () => setStep(steps[at - 1]) : save && step !== 'welcome-back' ? () => setStep('welcome-back') : null;

  return (
    <div class="onboard">
      <div class="onboard-top">
        <div class="logo small">
          <span>Art Gallery</span>
          <b>Tycoon</b>
        </div>
      </div>

      <div class="onboard-card" key={step}>
        <div class="speaker">
          <img src={portraitUrl(ASSISTANT.sprite)} alt="" />
          <div>
            <b>{ASSISTANT.name}</b>
            <small class="muted">{ASSISTANT.title}</small>
          </div>
          {at >= 0 && (
            <span class="dots">
              {steps.map((_, i) => (
                <i class={i <= at ? 'on' : ''} />
              ))}
            </span>
          )}
        </div>

        {step === 'welcome-back' && save && (
          <>
            <p class="line">
              Welcome back, boss. <b>{save.name}</b> is right where you left it: day {save.day}, {money(save.cash)} in the bank.
            </p>
            <button
              class="btn primary wide big"
              onClick={() => {
                store.autosave = true;
                store.load(save, 1);
                onDone(false);
              }}
            >
              Pick up where I left off
            </button>
            <button class="btn ghost wide" onClick={() => setStep('venue')}>
              Start somewhere new
            </button>
          </>
        )}

        {step === 'venue' && (
          <>
            <p class="line">Hi boss, I’m Marisol. I’ll be running the floor for you. So: bare walls, good light. What are we opening?</p>
            <div class="choices">
              {(Object.keys(VENUE) as VenueType[]).map((v) => (
                <button class={`choice ${venue === v ? 'on' : ''}`} onClick={() => preview(v, difficulty)}>
                  <b>A {VENUE[v].label.toLowerCase()}</b>
                  <small>{v === 'gallery' ? 'Buy art, hang it, sell it to collectors for more.' : 'Build a collection. Visitors pay at the door.'}</small>
                </button>
              ))}
            </div>
            <button class="btn primary wide" onClick={() => setStep('money')}>
              {venue === 'gallery' ? 'A gallery it is' : 'A museum it is'}
            </button>
          </>
        )}

        {step === 'money' && (
          <>
            <p class="line">Art isn’t cheap, and neither is the wine. How are we paying for all this?</p>
            <div class="choices">
              {MONEY.map((m) => (
                <button class={`choice ${difficulty === m.id ? 'on' : ''}`} onClick={() => preview(venue, m.id)}>
                  <span class="choice-row">
                    <b>{m.title}</b>
                    <b class="amount">{money(DIFFICULTY[m.id].startingCash)}</b>
                  </span>
                  <small>{m.note}</small>
                </button>
              ))}
            </div>
            <button class="btn primary wide" onClick={() => setStep('collection')}>
              That'll do
            </button>
          </>
        )}

        {step === 'collection' && (
          <>
            <p class="line">And the walls? We can start with what you already own, or open up the family storeroom.</p>
            <div class="choices">
              {(Object.keys(COLLECTION) as Collection[]).map((c) => {
                const w = worth(c);
                return (
                  <button class={`choice ${collection === c ? 'on' : ''}`} onClick={() => preview(venue, difficulty, c)}>
                    <span class="choice-row">
                      <b>{COLLECTION[c].label}</b>
                      <b class="amount">{w.works} works</b>
                    </span>
                    <small>{COLLECTION[c].note}</small>
                    <small class="choice-row">
                      <span>Art worth about {money(w.value)}</span>
                      <span>Cash {money(w.cash)}</span>
                    </small>
                  </button>
                );
              })}
            </div>
            <p class="hint">Anything else comes from dealers (pricey), the weekly auction, or the artists themselves.</p>
            <button class="btn primary wide" disabled={!collection} onClick={() => setStep('name')}>
              {collection === 'family' ? 'Open the storeroom' : collection ? 'Hang my pieces' : 'Pick one'}
            </button>
          </>
        )}

        {step === 'name' && (
          <>
            <p class="line">Last thing. I need something to put on the invitations. What’s it called?</p>
            <input
              class="name-input"
              value={name}
              maxLength={28}
              placeholder={venue === 'museum' ? 'The New Museum' : 'Untitled Gallery'}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
            <div class="chips">
              {NAMES[venue].map((n) => (
                <button class={`chip ${name === n ? 'on' : ''}`} onClick={() => setName(n)}>
                  {n}
                </button>
              ))}
            </div>
            <button class="btn primary wide big" onClick={open}>
              Open the doors
            </button>
          </>
        )}

        {back && (
          <button class="back-link" onClick={back}>
            ‹ Back
          </button>
        )}
      </div>
    </div>
  );
}
