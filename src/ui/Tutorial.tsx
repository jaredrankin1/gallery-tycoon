import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ASSISTANT, fixtureAt, type GameState } from '../game';
import { portraitUrl } from '../render/sprites';
import { useGame, type SheetId, type Ui } from './context';
import { Icon } from './icons';

/** Counts taken when a task starts, so "do X" means doing it now, not having done it before. */
interface Base {
  display: number;
  spots: number;
  owned: number;
  booked: number;
  staff: number;
  calls: number;
  /** An artist was already at the door (or mid-chat) when the task started. */
  callOpen: boolean;
  shops: number;
}

interface View {
  state: GameState;
  ui: Ui;
}

export interface TutorialStep {
  id: string;
  /** Short name for the task list. */
  task: string;
  /** What Marisol says, given where you are right now. */
  say: (v: View) => ComponentChildren;
  /** Dock button to point at, when that's where you need to go. */
  pulse?: (v: View) => SheetId | 'build' | null;
  /** Finished once this is true. Steps without one wait for "Got it". */
  done?: (v: View, base: Base) => boolean;
  /** Label for the "Got it" button. Action steps get a quieter "Skip this one". */
  gotIt?: string;
}

const isDisplay = (k: string) => k === 'wallHang' || k === 'pedestal';
const hiredCount = (s: GameState) => Object.values(s.staff?.hired ?? {}).filter(Boolean).length;

function measure(s: GameState): Base {
  const works = Object.values(s.artworks);
  return {
    display: works.filter((w) => w.status === 'display').length,
    spots: s.floor.fixtures.filter((f) => isDisplay(f.kind)).length,
    owned: works.filter((w) => w.status === 'storage' || w.status === 'display' || w.status === 'sold').length,
    booked: s.events.filter((e) => e.kind !== 'auction').length + (s.exhibition ? 1 : 0),
    staff: hiredCount(s),
    calls: s.artistCalls?.count ?? 0,
    callOpen: !!s.artistCall && s.artistCall.stage !== 'done',
    shops: s.floor.fixtures.filter((f) => f.kind === 'shop').length,
  };
}

/** Is the tapped tile a wall spot or pedestal with a work on it? */
const lookingAtArt = ({ state, ui }: View) => {
  if (!ui.selected) return false;
  const f = fixtureAt(state.floor, ui.selected.x, ui.selected.y);
  return !!f?.artworkId;
};

/**
 * Opening week, in nine tasks. Each one is a real thing you do in the game; Marisol
 * talks you through it and changes her line as you open the right sheet.
 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'hang',
    task: 'Hang a piece',
    say: (v) =>
      lookingAtArt(v) ? (
        <>That card is the piece: who made it, what it’s worth, and its price tag. You can change the price or take it down from here.</>
      ) : v.ui.sheet === 'collection' ? (
        <>Open <b>Yours</b>, pick something in storage and tap <b>Hang</b>. Or close this and tap a work that’s already up.</>
      ) : (
        <>First, the walls. Tap <b>Art</b> and hang something from storage, or just tap a piece that’s already up to see what it’s worth.</>
      ),
    pulse: (v) => (lookingAtArt(v) ? null : 'collection'),
    done: (v, b) => measure(v.state).display > b.display || lookingAtArt(v),
  },
  {
    id: 'build',
    task: 'Build a wall spot',
    say: (v) =>
      v.ui.building ? (
        v.ui.build ? (
          <>Now tap a free tile on the floor. Wall spots go against a wall, pedestals anywhere in the open.</>
        ) : (
          <>Pick <b>Wall spot</b> or <b>Pedestal</b> from the tray, then tap the floor where it should go.</>
        )
      ) : (
        <>More art needs more room. Tap <b>Build</b> and add a wall spot or a pedestal.</>
      ),
    pulse: (v) => (v.ui.building ? null : 'build'),
    done: (v, b) => measure(v.state).spots > b.spots,
  },
  {
    id: 'buy',
    task: 'Buy from a dealer',
    say: (v) =>
      v.ui.sheet === 'collection' ? (
        <>The <b>Dealers</b> tab is always open. Pricey, but it’s there today. Find something you can afford and tap <b>Buy</b>.</>
      ) : (
        <>Dealers always have something. Tap <b>Art</b> and buy a piece. {v.state.staff?.autoHang !== false && 'I’ll hang it for you.'}</>
      ),
    pulse: (v) => (v.ui.sheet === 'collection' ? null : 'collection'),
    done: (v, b) => measure(v.state).owned > b.owned,
  },
  {
    id: 'auction',
    task: 'Check the auction',
    say: (v) =>
      v.ui.sheet === 'collection' ? (
        <>The <b>Auction</b> tab shows this week’s lots. Bids go up live on sale day, and you can find real bargains. Or host an auction night yourself, from the Calendar.</>
      ) : (
        <>Cheaper art turns up at auction once a week. Tap <b>Art</b>, then the <b>Auction</b> tab, to see what’s coming.</>
      ),
    pulse: (v) => (v.ui.sheet === 'collection' ? null : 'collection'),
    gotIt: 'Got it',
  },
  {
    id: 'artist',
    task: 'Talk to an artist',
    say: (v) =>
      v.state.artistCall && v.state.artistCall.stage !== 'done' ? (
        <>Someone’s at the door with a portfolio. Tap <b>Talk</b> on their card. Say what they like to hear and you’ll get a better price, and a friend.</>
      ) : (
        <>Artists drop by with new work every few days, and sell for less than the dealers. When one turns up, tap them to talk. Charm counts.</>
      ),
    // Done once a chat has actually ended: they've said goodbye and you've closed it.
    done: (v, b) => {
      const c = v.state.artistCall;
      return !!c?.result && !v.ui.talk && (measure(v.state).calls > b.calls || b.callOpen);
    },
    gotIt: 'I’ll watch for them',
  },
  {
    id: 'event',
    task: 'Plan an event',
    say: (v) =>
      v.ui.sheet === 'calendar' ? (
        v.ui.draft ? (
          <>Pick a night, the wine and the cheese, and how many to invite. Good food keeps guests happy; empty glasses send them home. Then <b>Book it</b>.</>
        ) : (
          <>Tap a free day (or <b>Plan an event</b>) for an opening night, or scroll down to put on a themed <b>show</b>. Either brings in collectors and critics.</>
        )
      ) : (
        <>Parties sell art. Tap <b>Calendar</b> and plan an opening night, or put on a themed show.</>
      ),
    pulse: (v) => (v.ui.sheet === 'calendar' ? null : 'calendar'),
    done: (v, b) => measure(v.state).booked > b.booked,
  },
  {
    id: 'staff',
    task: 'Hire some help',
    say: (v) =>
      v.ui.sheet === 'people' ? (
        v.ui.peopleTab === 'staff' ? (
          <>A guard stops theft, an appraiser haggles dealers down, a curator makes shows land, and an intern is cheap help. Wages go out with the weekly bills.</>
        ) : (
          <>Tap <b>Staff</b>. One hire per job, so choose well.</>
        )
      ) : v.ui.sheet === 'inbox' ? (
        <>Under <b>Your people</b>, tap <b>Staff</b> to see who’s applied.</>
      ) : (
        <>I can’t do everything myself. Tap <b>Inbox</b>, then <b>Staff</b>, and look at who’s applied. Even one hire helps.</>
      ),
    pulse: (v) => (v.ui.sheet === 'people' || v.ui.sheet === 'inbox' ? null : 'inbox'),
    done: (v, b) => measure(v.state).staff > b.staff,
  },
  {
    id: 'shop',
    task: 'Open a gift shop',
    say: (v) =>
      measure(v.state).shops > 0 ? (
        v.ui.sheet === 'shop' ? (
          <>Postcards, prints, keychains, t-shirts. Order stock and set prices here; everyone who walks past might buy something.</>
        ) : (
          <>The counter’s up. Tap it on the floor to stock the shelves.</>
        )
      ) : v.ui.building ? (
        <>Pick the <b>Gift shop</b> counter from the tray and put it near the door.</>
      ) : (
        <>Not everyone buys a painting, but everyone buys a postcard. Tap <b>Build</b> and put in a gift shop counter.</>
      ),
    pulse: (v) => (measure(v.state).shops > 0 ? null : v.ui.building ? null : 'build'),
    done: (v, b) => measure(v.state).shops > b.shops || (b.shops > 0 && v.ui.sheet === 'shop'),
  },
  {
    id: 'books',
    task: 'Read the books',
    say: (v) =>
      v.ui.sheet === 'books' ? (
        <>Money in, money out, and when the bills land. Keep an eye on that number and we’ll do fine.</>
      ) : (
        <>Last one. Tap your <b>cash</b>, top right, to open the books. Rent and wages go out every week.</>
      ),
    pulse: (v) => (v.ui.sheet === 'books' ? null : 'books'),
    done: (v) => v.ui.sheet === 'books',
  },
];

/**
 * Marisol's task card. Sits above the dock when nothing else is up; under the top bar while a
 * sheet is open; just its title line (slim) while another card or the build tray has the floor.
 */
export function TutorialCard({ low, slim = false }: { low: boolean; slim?: boolean }) {
  const { state, ui, act } = useGame();
  const t = state.tutorial;
  const at = t?.step ?? 0;
  const step = t?.status === 'on' ? TUTORIAL_STEPS[at] : undefined;
  const base = useRef<{ step: number; base: Base } | null>(null);
  if (step && base.current?.step !== at) base.current = { step: at, base: measure(state) };

  const v: View = { state, ui };
  const finished = !!step?.done && !!base.current && step.done(v, base.current.base);
  useEffect(() => {
    if (!finished) return;
    // A beat to read the line that confirms it, then on to the next task.
    const id = setTimeout(() => act({ type: 'tutorial', to: 'next' }), 1400);
    return () => clearTimeout(id);
  }, [finished, at]);

  if (!step) return null;
  return (
    <div class={`mission ${low ? 'low' : 'high'} ${slim ? 'slim' : ''} ${finished ? 'ticked' : ''}`} key={step.id}>
      <div class="mission-head">
        <span class="mission-tag">Opening week · {at + 1}/{TUTORIAL_STEPS.length}</span>
        <b>{finished ? '✓ ' : ''}{step.task}</b>
        <button class="mission-skip" onClick={() => act({ type: 'tutorial', to: 'skip' })}>
          Skip tour
        </button>
      </div>
      {/* While building, just the task: the tray has the how-to, and the walls need to stay visible. */}
      {(!slim || finished) && <div class="mission-body">
        <img src={portraitUrl(ASSISTANT.sprite)} alt="" />
        <p>{finished ? 'Perfect. That’s exactly it.' : step.say(v)}</p>
      </div>}
      {!finished && !slim && (low || step.gotIt) && (
        <div class="mission-foot">
          <span class="mission-bar">
            {TUTORIAL_STEPS.map((_, i) => (
              <i class={i < at ? 'on' : i === at ? 'now' : ''} />
            ))}
          </span>
          {step.gotIt ? (
            <button class="btn primary" onClick={() => act({ type: 'tutorial', to: 'next' })}>
              {step.gotIt}
            </button>
          ) : (
            <button class="mission-later" onClick={() => act({ type: 'tutorial', to: 'next', passed: true })}>
              Skip this one <Icon name="close" size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Which dock button the current task points at, if any. */
export function tutorialPulse(state: GameState, ui: Ui): SheetId | 'build' | null {
  if (state.tutorial?.status !== 'on') return null;
  const step = TUTORIAL_STEPS[state.tutorial.step];
  return step?.pulse?.({ state, ui }) ?? null;
}
