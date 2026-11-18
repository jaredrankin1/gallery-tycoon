import { DIFFICULTY, VENUE, type Difficulty, type VenueType } from '../game';
import { h, money } from './dom';

export interface NewGameChoice {
  name: string;
  difficulty: Difficulty;
  venue: VenueType;
}

export function renderNewGame(opts: { canContinue: boolean; onStart: (c: NewGameChoice) => void; onContinue: () => void }) {
  const choice: NewGameChoice = { name: '', difficulty: 'normal', venue: 'gallery' };
  const root = h('div', { class: 'screen title' });

  const draw = () => {
    root.replaceChildren(h('div', { class: 'title-inner' },
      h('div', { class: 'logo' }, h('span', {}, 'Art Gallery'), h('b', {}, 'Tycoon')),
      opts.canContinue ? h('button', { class: 'btn ghost wide', onclick: opts.onContinue }, 'Continue saved game') : null,
      h('label', { class: 'field' }, 'Name your space',
        h('input', {
          value: choice.name,
          placeholder: choice.venue === 'museum' ? 'The New Museum' : 'Untitled Gallery',
          maxlength: 28,
          oninput: (e: Event) => (choice.name = (e.target as HTMLInputElement).value),
        }),
      ),
      h('div', { class: 'label' }, 'What are you opening?'),
      h('div', { class: 'cards two' },
        ...(Object.keys(VENUE) as VenueType[]).map((v) =>
          h('button', { class: `card pick ${choice.venue === v ? 'on' : ''}`, onclick: () => { choice.venue = v; draw(); } },
            h('b', {}, VENUE[v].label),
            h('small', {}, VENUE[v].tagline),
            h('small', { class: 'muted' }, v === 'gallery' ? 'Earn by selling works' : 'Earn from ticket sales'),
          ),
        ),
      ),
      h('div', { class: 'label' }, 'Difficulty'),
      h('div', { class: 'cards three' },
        ...(Object.keys(DIFFICULTY) as Difficulty[]).map((d) =>
          h('button', { class: `card pick ${choice.difficulty === d ? 'on' : ''}`, onclick: () => { choice.difficulty = d; draw(); } },
            h('b', {}, DIFFICULTY[d].label),
            h('small', {}, money(DIFFICULTY[d].startingCash)),
          ),
        ),
      ),
      h('button', { class: 'btn primary wide big', onclick: () => opts.onStart(choice) }, 'Open the doors'),
    ));
  };
  draw();
  return root;
}
