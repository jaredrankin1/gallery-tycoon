import { TUTORIAL } from '../config';
import type { GameState, TutorialProgress } from '../types';
import { notify } from './feed';
import { post } from './ledger';

/**
 * Marisol's opening-week mission: a short, skippable tour of the core loop.
 * The game only keeps where you are in it (so a reload picks up on the same task)
 * and pays the small reward once at the end. What each task asks for, and how the
 * UI notices you did it, lives in src/ui/Tutorial.tsx.
 */
export const tutorialOn = (state: GameState) => state.tutorial?.status === 'on';

export function startTutorial(state: GameState): void {
  // Replaying the tour never pays out twice.
  const rewarded = state.tutorial?.rewarded ?? false;
  state.tutorial = { status: 'on', step: 0, rewarded, skipped: 0 };
}

export function advanceTutorial(state: GameState, steps: number, passed = false): void {
  const t = state.tutorial;
  if (!t || t.status !== 'on') return;
  if (passed) t.skipped = (t.skipped ?? 0) + 1;
  t.step += 1;
  if (t.step >= steps) finishTutorial(state, t);
}

export function skipTutorial(state: GameState): void {
  const t = state.tutorial;
  if (!t || t.status !== 'on') return;
  t.status = 'skipped';
}

function finishTutorial(state: GameState, t: TutorialProgress): void {
  t.status = 'done';
  if (t.rewarded) return;
  if ((t.skipped ?? 0) > TUTORIAL.maxPassedForReward) {
    notify(state, { kind: 'event', text: 'That’s the tour, boss. Give the jobs we skipped a go when you’re ready.' });
    return;
  }
  t.rewarded = true;
  post(state, 'donations', TUTORIAL.rewardCash, 'Welcome gift (opening week)');
  state.reputation = Math.min(100, state.reputation + TUTORIAL.rewardReputation);
  notify(state, { kind: 'event', text: `Mission complete: +$${TUTORIAL.rewardCash.toLocaleString('en-US')} and a little reputation. The place is yours, boss.` });
}
