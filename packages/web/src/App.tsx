import React, { useCallback, useState } from 'react';
import { GamePlayArea } from './components/GamePlayArea.js';
import { StartScreen } from './components/overlays/StartScreen.js';
import { loadGame, clearSave } from './save.js';

export function App() {
  const [savedContext] = useState(() => loadGame());
  const hasSave = savedContext !== null;
  const [gameStarted, setGameStarted] = useState(false);

  const handleStartContinue = useCallback(() => {
    setGameStarted(true);
  }, []);

  const handleStartNewGame = useCallback(() => {
    clearSave();
    setGameStarted(true);
  }, []);

  const handleQuit = useCallback(() => {
    const w = window as Window & { electronAPI?: { quit: () => void } };
    if (w.electronAPI) {
      w.electronAPI.quit();
    } else {
      window.close();
    }
  }, []);

  return (
    <div className="relative w-full h-full">
      {gameStarted && <GamePlayArea />}
      {!gameStarted && (
        <StartScreen
          hasSave={hasSave}
          onNewGame={handleStartNewGame}
          onContinue={handleStartContinue}
          onSettings={() => {}}
          onQuit={handleQuit}
        />
      )}
    </div>
  );
}
