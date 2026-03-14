import React, { useCallback, useEffect, useState } from 'react';
import { GamePlayArea } from './components/GamePlayArea.js';
import { StartScreen } from './components/overlays/StartScreen.js';
import { SettingsModal } from './components/overlays/SettingsModal.js';
import { loadGame, clearSave } from './save.js';
import { useAudio } from './audio/AudioContext.js';
import type { ContractDef } from '@load/game-core';

export function App() {
  const [hasSave, setHasSave] = useState(() => loadGame() !== null);
  const [gameStarted, setGameStarted] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractDef | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    // Refresh hasSave in case the game created a save during the session.
    setHasSave(loadGame() !== null);
  }, []);
  const handleQuit = useCallback(() => {
    if (window.electronAPI) { window.electronAPI.quit(); } else { window.close(); }
  }, []);
  const handleClearSave = useCallback(() => {
    clearSave();
    setHasSave(false);
  }, []);

  // Escape toggles the settings modal from anywhere (start screen or mid-game).
  // Registered once with [] — functional updater avoids stale closure.
  // SettingsModal's FocusTrap has escapeDeactivates: false so this is the
  // sole Escape handler; no risk of double-firing.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative w-full h-full">
      {gameStarted && (
        <GamePlayArea
          {...(selectedContract ? { contract: selectedContract } : {})}
          onReturnToMenu={handleReturnToMenu}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      {!gameStarted && (
        <StartScreen
          hasSave={hasSave}
          onNewGame={handleStartNewGame}
          onContinue={handleStartContinue}
          onSettings={() => setSettingsOpen(true)}
          onQuit={handleQuit}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          midGame={gameStarted}
          hasSave={hasSave}
          onClearSave={handleClearSave}
        />
      )}
    </div>
  );
}
