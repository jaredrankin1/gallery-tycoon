import { dispatch, saveGame, type Action, type GameState } from '../game';

type Listener = (state: GameState, prev: GameState | null) => void;

/** Holds the current game, routes actions through the reducer, autosaves. */
export class Store {
  private listeners = new Set<Listener>();
  constructor(public state: GameState) {}

  act(action: Action): { ok: true } | { ok: false; error: string } {
    const prev = this.state;
    const res = dispatch(prev, action);
    if (!res.ok) return { ok: false, error: res.error };
    this.state = res.state;
    saveGame(this.state);
    this.listeners.forEach((l) => l(this.state, prev));
    return { ok: true };
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
