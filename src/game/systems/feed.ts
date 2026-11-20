import { RULES } from '../config';
import type { FeedItem, GameState } from '../types';

/** Tell the player something happened. The UI turns new items into toasts and floating labels. */
export function notify(state: GameState, item: Omit<FeedItem, 'id' | 'day'>): void {
  state.feed.push({ ...item, id: ++state.feedSeq, day: state.day });
  if (state.feed.length > RULES.maxFeed) state.feed.splice(0, state.feed.length - RULES.maxFeed);
}
