import React from 'react';
import type { GameContext } from '@load/game-core';

interface WinScreenProps {
  context: GameContext;
  onPlayAgain: () => void;
}

export function WinScreen({ context, onPlayAgain }: WinScreenProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
      <div className="border border-green-500 bg-gray-950 rounded-lg p-8 max-w-md w-full text-center shadow-2xl">
        <div className="text-green-400 text-4xl font-bold font-mono mb-2">NETWORK STABLE</div>
        <div className="text-gray-400 text-sm mb-6">All 12 rounds complete. Infrastructure secured.</div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Stat label="Final Budget" value={`$${context.budget.toLocaleString()}`} color="text-green-400" />
          <Stat label="Rounds" value={`${context.round - 1} / 12`} color="text-cyan-400" />
          <Stat label="SLA Fails" value={`${context.slaCount}`} color="text-yellow-400" />
        </div>
        <button
          onClick={onPlayAgain}
          className="px-6 py-2 bg-green-600 hover:bg-green-500 text-black font-bold rounded font-mono transition-colors"
        >
          PLAY AGAIN
        </button>
      </div>
    </div>
  );
}

interface LoseScreenProps {
  context: GameContext;
  onPlayAgain: () => void;
}

export function LoseScreen({ context, onPlayAgain }: LoseScreenProps) {
  const reason =
    context.loseReason === 'Bankrupt'
      ? 'Budget exceeded critical threshold'
      : 'SLA violations reached maximum';

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
      <div className="border border-red-500 bg-gray-950 rounded-lg p-8 max-w-md w-full text-center shadow-2xl">
        <div className="text-red-400 text-4xl font-bold font-mono mb-2">SYSTEM DOWN</div>
        <div className="text-gray-400 text-sm mb-2">{reason}</div>
        <div className="text-gray-600 text-xs mb-6 italic">You have been terminated.</div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Stat label="Final Budget" value={`$${context.budget.toLocaleString()}`} color="text-red-400" />
          <Stat label="Reached Round" value={`${context.round}`} color="text-cyan-400" />
          <Stat label="SLA Fails" value={`${context.slaCount}`} color="text-orange-400" />
        </div>
        <button
          onClick={onPlayAgain}
          className="px-6 py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded font-mono transition-colors"
        >
          TRY AGAIN
        </button>
      </div>
    </div>
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
      <span className="text-xs text-gray-500 uppercase tracking-widest">{label}</span>
      <span className={`text-xl font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}
