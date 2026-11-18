import './styles.css';
import { clearSave, createNewGame, loadGame } from './game';
import { mountGame } from './ui/gameScreen';
import { renderNewGame } from './ui/newGame';
import { Store } from './ui/store';

const app = document.getElementById('app')!;
let unmount: (() => void) | null = null;

function showTitle() {
  unmount?.();
  unmount = null;
  app.replaceChildren(
    renderNewGame({
      canContinue: !!loadGame(),
      onContinue: () => {
        const saved = loadGame();
        if (saved) startGame(new Store(saved));
      },
      onStart: (c) => {
        clearSave();
        startGame(new Store(createNewGame(c)));
      },
    }),
  );
}

function startGame(store: Store) {
  unmount = mountGame(app, store, showTitle);
}

showTitle();
