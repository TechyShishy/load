import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GamePlayArea } from './components/GamePlayArea.js';
import { StartScreen } from './components/overlays/StartScreen.js';
import type { StartScreenStep } from './components/overlays/StartScreen.js';
import { SettingsModal } from './components/overlays/SettingsModal.js';
import { DeckBuilderScreen } from './components/overlays/DeckBuilderScreen.js';
import { loadGame, clearSave } from './save.js';
import { useAudio } from './audio/AudioContext.js';
import type { ContractDef } from '@load/game-core';

export function App() {
  const [hasSave, setHasSave] = useState(() => loadGame() !== null);
  const [gameStarted, setGameStarted] = useState(false);
  const [showDeckBuilder, setShowDeckBuilder] = useState(false);
  const [startStep, setStartStep] = useState<StartScreenStep>('menu');
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
  const handleOpenDeckBuilder = useCallback(() => { setShowDeckBuilder(true); }, []);
  const handleCloseDeckBuilder = useCallback(() => { setShowDeckBuilder(false); }, []);
  const handleDeckBuilderStart = useCallback(() => {
    // Deck was saved inside DeckBuilderScreen before calling this.
    // Transition to contract selection so the player can pick which contract to play.
    setShowDeckBuilder(false);
    setStartStep('contract');
  }, []);
  const handleReturnToMenu = useCallback(() => {
    setGameStarted(false);
    setSelectedContract(null);
    setStartStep('menu');
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

  // Refs let the stable Escape listener read current state without re-registering.
  const settingsOpenRef = useRef(settingsOpen);
  const gameStartedRef = useRef(gameStarted);
  const showDeckBuilderRef = useRef(showDeckBuilder);
  const startStepRef = useRef(startStep);
  useEffect(() => { settingsOpenRef.current = settingsOpen; }, [settingsOpen]);
  useEffect(() => { gameStartedRef.current = gameStarted; }, [gameStarted]);
  useEffect(() => { showDeckBuilderRef.current = showDeckBuilder; }, [showDeckBuilder]);
  useEffect(() => { startStepRef.current = startStep; }, [startStep]);

  // Escape behaviour depends on context:
  //   settings open                    → close settings
  //   deck builder open                → close deck builder
  //   start screen, contract panel     → back to menu panel
  //   mid-game, no modal               → open settings
  //   start screen, menu panel         → quit (Electron IPC / window.close)
  // SettingsModal's FocusTrap has escapeDeactivates: false, so this is
  // the sole Escape handler — no risk of double-firing.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (settingsOpenRef.current) {
        setSettingsOpen(false);
      } else if (showDeckBuilderRef.current) {
        setShowDeckBuilder(false);
      } else if (!gameStartedRef.current && startStepRef.current === 'contract') {
        setStartStep('menu');
      } else if (gameStartedRef.current) {
        setSettingsOpen(true);
      } else {
        if (window.electronAPI) { window.electronAPI.quit(); } else { window.close(); }
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
          step={startStep}
          onStepChange={setStartStep}
          onNewGame={handleStartNewGame}
          onContinue={handleStartContinue}
          onDeckBuilder={handleOpenDeckBuilder}
          onSettings={() => setSettingsOpen(true)}
          onQuit={handleQuit}
        />
      )}
      {showDeckBuilder && (
        <DeckBuilderScreen
          onBack={handleCloseDeckBuilder}
          onStart={handleDeckBuilderStart}
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
