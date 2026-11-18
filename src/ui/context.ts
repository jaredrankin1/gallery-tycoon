import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Action, EventKind, FixtureKind, GameState, HospitalityPlan, Id } from '../game';
import type { Store } from './store';

export type SheetId = 'collection' | 'people' | 'events' | 'books';
/** 'remove' is the bulldozer tool in the build tray. */
export type BuildTool = FixtureKind | 'remove';

export interface EventDraft {
  kind: EventKind;
  day: number;
  featured: Id[];
  hospitality: HospitalityPlan;
}

/** UI-only state. Never saved, never seen by game logic. */
export interface Ui {
  sheet: SheetId | null;
  build: BuildTool | null;
  /** Build tray is open (with or without a tool picked). */
  building: boolean;
  selected: { x: number; y: number } | null;
  draft: EventDraft | null;
  /** Guest tapped on the floor (shows their card). */
  guest: string | null;
  /** Which list the People sheet shows. */
  peopleTab: 'guests' | 'artists';
  /** First-run tip pointing at the Art button. */
  coach: boolean;
}

export interface GameCtx {
  store: Store;
  state: GameState;
  ui: Ui;
  setUi: (patch: Partial<Ui>) => void;
  /** Runs an action; toasts the error and returns false if refused. */
  act: (a: Action) => boolean;
  toast: (text: string, tone?: 'error' | 'info') => void;
}

export const Ctx = createContext<GameCtx>(null as unknown as GameCtx);
export const useGame = () => useContext(Ctx);
