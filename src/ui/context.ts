import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Action, EventKind, FixtureKind, GameState, HospitalityPlan, Id } from '../game';
import type { Store } from './store';

/** Dock sheets (art, calendar, inbox), plus books (tap the cash), the shop (tap the counter) and people (from the inbox or the floor). */
export type SheetId = 'collection' | 'calendar' | 'inbox' | 'people' | 'books' | 'shop';
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
  /** Which list the People sheet shows (each opens as its own sheet, no tabs). */
  peopleTab: 'guests' | 'artists' | 'staff';
  /** Which works the Art sheet lists. */
  artTab: 'market' | 'auction' | 'owned';
  /** Talking to the artist who dropped by. */
  talk: boolean;
}

export interface GameCtx {
  store: Store;
  state: GameState;
  ui: Ui;
  setUi: (patch: Partial<Ui>) => void;
  /** Runs an action; toasts the error and returns false if refused. */
  act: (a: Action) => boolean;
  /** Puts a line in the news ticker (errors flash red). */
  toast: (text: string, tone?: 'error' | 'info') => void;
}

export const Ctx = createContext<GameCtx>(null as unknown as GameCtx);
export const useGame = () => useContext(Ctx);
