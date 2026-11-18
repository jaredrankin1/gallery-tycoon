import { useState } from 'preact/hooks';
import { DIFFICULTY, VENUE, type Difficulty, type VenueType } from '../game';
import { money } from './bits';

export interface NewGameChoice {
  name: string;
  difficulty: Difficulty;
  venue: VenueType;
}

export function Title({ canContinue, onStart, onContinue }: { canContinue: boolean; onStart: (c: NewGameChoice) => void; onContinue: () => void }) {
  const [venue, setVenue] = useState<VenueType>('gallery');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [name, setName] = useState('');

  return (
    <div class="title">
      <div class="title-inner">
        <div class="logo">
          <span>Art Gallery</span>
          <b>Tycoon</b>
        </div>

        {canContinue && (
          <button class="btn ghost wide" onClick={onContinue}>
            Continue saved game
          </button>
        )}

        <label class="field">
          <span class="label">Name your space</span>
          <input
            id="venue-name"
            value={name}
            maxLength={28}
            placeholder={venue === 'museum' ? 'The New Museum' : 'Untitled Gallery'}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </label>

        <span class="label">What are you opening?</span>
        <div class="pick-row two">
          {(Object.keys(VENUE) as VenueType[]).map((v) => (
            <button class={`pick ${venue === v ? 'on' : ''}`} onClick={() => setVenue(v)}>
              <b>{VENUE[v].label}</b>
              <small>{VENUE[v].tagline}</small>
              <small class="muted">{v === 'gallery' ? 'Earn by selling works' : 'Earn from ticket sales'}</small>
            </button>
          ))}
        </div>

        <span class="label">Difficulty</span>
        <div class="pick-row three">
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
            <button class={`pick ${difficulty === d ? 'on' : ''}`} onClick={() => setDifficulty(d)}>
              <b>{DIFFICULTY[d].label}</b>
              <small>{money(DIFFICULTY[d].startingCash)}</small>
            </button>
          ))}
        </div>

        <button class="btn primary wide big" onClick={() => onStart({ name, difficulty, venue })}>
          Open the doors
        </button>
      </div>
    </div>
  );
}
