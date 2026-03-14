import React, { useCallback, useEffect, useState } from 'react';
import { GamePlayArea } from './components/GamePlayArea.js';
import { StartScreen } from './components/overlays/StartScreen.js';
import { loadGame, clearSave } from './save.js';
import { useAudio } from './audio/AudioContext.js';
import type { ContractDef } from '@load/game-core';

export function App() {
  const [savedContext] = useState(() => loadGame());
  const hasSave = savedContext !== null;
  const [gameStarted, setGameStarted] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractDef | null>(null);
  const audio = useAudio();

  // Unlock the AudioContext on the first pointer event anywhere in the document.
  // Browsers suspend AudioContext until a user gesture; this fires once on the
  // first click/tap anywhere in the window rather than requiring a specific button.
  useEffect(() => {
    const unlock = () => audio.unlock();
    document.addEventListener('click', unlock, { once: true });
    return () => document.removeEventListener('click', unlock);
  }, [audio]);

  // Start title music when the start screen is visible; stop it when the game begins.
  // Note: browsers suspend AudioContext until the first user interaction — the music
  // will begin playing on the first click/keypress rather than immediately on mount.
  useEffect(() => {
    if (!gameStarted) {
      audio.startMusic('titleTheme');
      return () => audio.stopMusic();
    }
  }, [gameStarted, audio]);

  const handleStartContinue = useCallback(() => { setGameStarted(true); }, []);
  const handleStartNewGame = useCallback((contract: ContractDef) => {
    clearSave();
    setSelectedContract(contract);
    setGameStarted(true);
  }, []);
  const handleReturnToMenu = useCallback(() => {
    setGameStarted(false);
    setSelectedContract(null);
  }, []);
  const handleQuit = useCallback(() => {
    const w = window as Window & { electronAPI?: { quit: () => void } };
    if (w.electronAPI) { w.electronAPI.quit(); } else { window.close(); }
  }, []);

  return (
    <div className="relative w-full h-full">
      {gameStarted && <GamePlayArea {...(selectedContract ? { contract: selectedContract } : {})} onReturnToMenu={handleReturnToMenu} />}
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
