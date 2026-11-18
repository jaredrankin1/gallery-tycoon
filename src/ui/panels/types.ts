import type { Action, EventKind, FixtureKind, GameState, HospitalityPlan, Id } from '../../game';

export type Tab = 'floor' | 'market' | 'artists' | 'events' | 'books';

export interface EventDraft {
  kind: EventKind;
  week: number;
  featured: Id[];
  hospitality: HospitalityPlan;
}

/** UI-only state. Never saved, never seen by game logic. */
export interface UiState {
  tab: Tab;
  selected: { x: number; y: number } | null;
  build: FixtureKind | null;
  draft: EventDraft | null;
}

export interface PanelCtx {
  state: GameState;
  ui: UiState;
  /** Runs an action; shows the error and returns false if it was refused. */
  act: (a: Action) => boolean;
  /** Re-render after a UI-only change. */
  refresh: () => void;
}
