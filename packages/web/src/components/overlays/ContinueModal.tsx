import React from 'react';

interface ContinueModalProps {
  onContinue: () => void;
  onNewGame: () => void;
}

export function ContinueModal({ onContinue, onNewGame }: ContinueModalProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50">
      <div className="border border-cyan-700 bg-gray-950 rounded-lg p-8 max-w-sm w-full text-center shadow-2xl">
        <div className="text-cyan-400 text-xl font-bold font-mono mb-2">RESUME SESSION</div>
        <div className="text-gray-400 text-sm mb-6">A saved game was found.</div>
        <div className="flex gap-4 justify-center">
          <button
            onClick={onContinue}
            className="px-5 py-2 bg-cyan-700 hover:bg-cyan-600 text-white font-bold rounded font-mono transition-colors"
          >
            CONTINUE
          </button>
          <button
            onClick={onNewGame}
            className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded font-mono transition-colors"
          >
            NEW GAME
          </button>
        </div>
      </div>
    </div>
  );
}
