import React from 'react';
import FocusTrap from 'focus-trap-react';

interface StartScreenProps {
  hasSave: boolean;
  onNewGame: () => void;
  onContinue: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export function StartScreen({ hasSave, onNewGame, onContinue, onSettings, onQuit }: StartScreenProps) {
  return (
    <FocusTrap focusTrapOptions={{ initialFocus: '#start-new-game-btn' }}>
      <div
        className="absolute inset-0 flex items-center justify-center bg-black/90 z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-screen-title"
      >
        <div className="border border-cyan-700 bg-gray-950 rounded-lg p-10 max-w-sm w-full text-center shadow-2xl">
          <h1
            id="start-screen-title"
            className="text-cyan-400 text-6xl font-bold font-mono tracking-widest mb-1"
          >
            LOAD
          </h1>
          <div className="text-gray-500 text-xs font-mono tracking-widest uppercase mb-10">
            Network Traffic Balancer
          </div>

          <div className="flex flex-col gap-3">
            <button
              id="start-new-game-btn"
              onClick={onNewGame}
              className="w-full px-5 py-3 bg-cyan-700 hover:bg-cyan-600 text-white font-bold rounded font-mono tracking-widest transition-colors"
            >
              NEW GAME
            </button>

            {hasSave && (
              <button
                onClick={onContinue}
                className="w-full px-5 py-3 bg-indigo-700 hover:bg-indigo-600 text-white font-bold rounded font-mono tracking-widest transition-colors"
              >
                CONTINUE
              </button>
            )}

            <button
              onClick={onSettings}
              disabled
              title="Coming soon"
              className="w-full px-5 py-3 bg-gray-800 text-gray-600 font-bold rounded font-mono tracking-widest cursor-not-allowed opacity-50"
              aria-disabled="true"
            >
              SETTINGS
            </button>

            <button
              onClick={onQuit}
              className="w-full px-5 py-3 bg-gray-800 hover:bg-gray-700 text-red-400 font-bold rounded font-mono tracking-widest transition-colors"
            >
              QUIT
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
