import { LoseReason } from '@load/game-core';
import React from 'react';
import FocusTrap from 'focus-trap-react';
import type { GameContext } from '@load/game-core';

interface WinScreenProps {
  context: GameContext;
  onPlayAgain: () => void;
}

export function WinScreen({ context, onPlayAgain }: WinScreenProps) {
  return (
    <FocusTrap focusTrapOptions={{ initialFocus: '#win-screen-play-again-btn' }}>
      <div
        className="absolute inset-0 flex items-center justify-center bg-black/80 z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="win-screen-title"
      >
        <div className="border border-green-500 bg-gray-950 rounded-lg p-8 max-w-md w-full text-center shadow-2xl">
          <h2 id="win-screen-title" className="text-green-400 text-4xl font-bold font-mono mb-2">NETWORK STABLE</h2>
          <div className="text-gray-400 text-sm mb-6">All 12 rounds complete. Infrastructure secured.</div>
          <dl className="grid grid-cols-3 gap-4 mb-6">
            <Stat label="Final Budget" value={`$${context.budget.toLocaleString()}`} color="text-green-400" />
            <Stat label="Rounds" value={`${context.round - 1} / 12`} color="text-cyan-400" />
            <Stat label="SLA Fails" value={`${context.slaCount}`} color="text-yellow-400" />
          </dl>
          <button
            id="win-screen-play-again-btn"
            onClick={onPlayAgain}
            className="px-6 py-2 bg-green-600 hover:bg-green-500 text-black font-bold rounded font-mono transition-colors"
          >
            PLAY AGAIN
          </button>
        </div>
      </div>
    </FocusTrap>
  );
}

interface LoseScreenProps {
  context: GameContext;
  onPlayAgain: () => void;
}

export function LoseScreen({ context, onPlayAgain }: LoseScreenProps) {
  const reason =
    context.loseReason === LoseReason.Bankrupt
      ? 'Budget exceeded critical threshold'
      : 'SLA violations reached maximum';

  return (
    <FocusTrap focusTrapOptions={{ initialFocus: '#lose-screen-try-again-btn' }}>
      <div
        className="absolute inset-0 flex items-center justify-center bg-black/80 z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lose-screen-title"
      >
        <div className="border border-red-500 bg-gray-950 rounded-lg p-8 max-w-md w-full text-center shadow-2xl">
          <h2 id="lose-screen-title" className="text-red-400 text-4xl font-bold font-mono mb-2">SYSTEM DOWN</h2>
          <div className="text-gray-400 text-sm mb-2">{reason}</div>
          <div className="text-gray-600 text-xs mb-6 italic">You have been terminated.</div>
          <dl className="grid grid-cols-3 gap-4 mb-6">
            <Stat label="Final Budget" value={`$${context.budget.toLocaleString()}`} color="text-red-400" />
            <Stat label="Reached Round" value={`${context.round}`} color="text-cyan-400" />
            <Stat label="SLA Fails" value={`${context.slaCount}`} color="text-orange-400" />
          </dl>
          <button
            id="lose-screen-try-again-btn"
            onClick={onPlayAgain}
            className="px-6 py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded font-mono transition-colors"
          >
            TRY AGAIN
          </button>
        </div>
      </div>
    </FocusTrap>
  );
}

interface StatProps {
  label: string;
  value: string;
  color: string;
}

function Stat({ label, value, color }: StatProps) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-gray-500 uppercase tracking-widest">{label}</dt>
      <dd className={`text-xl font-mono font-bold ${color}`}>{value}</dd>
    </div>
  );
}
