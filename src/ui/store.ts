import { useEffect, useState } from 'preact/hooks';
import { dispatch, isNight, saveGame, TIME, type Action, type GameState } from '../game';

type Listener = () => void;

/**
 * Holds the running game. Routes actions through the reducer, runs the
 * real-time clock, and autosaves. Components read it through useStore().
 */
export class Store {
  private listeners = new Set<Listener>();
  private raf = 0;
  private last = 0;
  /** Fraction of an hour accumulated since the last tick. */
  private carry = 0;
  /** Index into TIME.speeds. 0 = paused. */
  speedIndex = 1;
  /** Off while the first-run preview is showing, so it never overwrites a real save. */
  autosave = true;
  /** 0..1 progress through the current hour, for smooth clock hands. */
  hourProgress = 0;

  constructor(public state: GameState) {}

  act(action: Action): { ok: true } | { ok: false; error: string } {
    const res = dispatch(this.state, action);
    if (!res.ok) return { ok: false, error: res.error };
    const dayChanged = res.state.day !== this.state.day;
    this.state = res.state;
    if (this.autosave && (action.type !== 'tick' || dayChanged)) saveGame(this.state);
    if (this.state.status !== 'playing') this.speedIndex = 0;
    this.emit();
    return { ok: true };
  }

  /** Swap in a different game (new game, loaded save, setup preview). */
  load(state: GameState, speedIndex = this.speedIndex) {
    this.state = state;
    this.speedIndex = speedIndex;
    this.carry = 0;
    this.emit();
  }

  setSpeed(i: number) {
    this.speedIndex = i;
    this.emit();
  }

  get speed() {
    return TIME.speeds[this.speedIndex];
  }

  start() {
    const loop = (t: number) => {
      const dt = this.last ? Math.min(0.25, (t - this.last) / 1000) : 0;
      this.last = t;
      if (this.speed > 0 && this.state.status === 'playing') {
        // Quiet night hours fly by; daytime runs at the normal pace.
        const hour = (TIME.openHour + this.state.tick) % 24;
        const secondsPerHour = TIME.secondsPerHour / (isNight(hour) ? TIME.nightSpeedup : 1);
        this.carry += (dt * this.speed) / secondsPerHour;
        const hours = Math.floor(this.carry);
        if (hours > 0) {
          this.carry -= hours;
          this.act({ type: 'tick', hours });
        }
        this.hourProgress = this.carry;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    if (this.autosave) saveGame(this.state);
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

/** Re-renders the calling component whenever the store changes. */
export function useStore(store: Store): GameState {
  const [, setN] = useState(0);
  useEffect(() => store.subscribe(() => setN((n) => n + 1)), [store]);
  return store.state;
}
