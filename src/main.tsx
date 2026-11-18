import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { clearSave, createNewGame, loadGame, type GameState } from './game';
import './styles.css';
import { Game } from './ui/Game';
import { Store } from './ui/store';
import { Title } from './ui/Title';

function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const store = useMemo(() => (game ? new Store(game) : null), [game]);

  useEffect(() => {
    if (!store) return;
    store.start();
    return () => store.stop();
  }, [store]);

  if (!store) {
    return (
      <Title
        canContinue={!!loadGame()}
        onContinue={() => setGame(loadGame())}
        onStart={(c) => {
          clearSave();
          setGame(createNewGame(c));
        }}
      />
    );
  }
  return <Game key={game!.name + game!.rng} store={store} onQuit={() => setGame(null)} />;
}

render(<App />, document.getElementById('app')!);
