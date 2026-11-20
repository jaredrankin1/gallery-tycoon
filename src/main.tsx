import { sound } from './audio/sound';
import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { createNewGame, saveGame } from './game';
import './styles.css';
import { Game } from './ui/Game';
import { PREVIEW_SEED } from './ui/Onboarding';
import { Store } from './ui/store';

/** The empty room you see behind the first-run questions. */
const preview = () => createNewGame({ name: '', difficulty: 'normal', venue: 'gallery', seed: PREVIEW_SEED });

function App() {
  const store = useMemo(() => {
    const s = new Store(preview());
    s.speedIndex = 0;
    s.autosave = false;
    return s;
  }, []);
  const [onboarding, setOnboarding] = useState(true);

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  return (
    <Game
      store={store}
      onboarding={onboarding}
      onSetupDone={() => setOnboarding(false)}
      onQuit={() => {
        saveGame(store.state);
        store.autosave = false;
        store.load(preview(), 0);
        setOnboarding(true);
      }}
    />
  );
}

sound.install();
render(<App />, document.getElementById('app')!);
