import React from 'react';
import type { RoundSummary } from '@load/game-core';

interface ResolutionSummaryProps {
  summary: RoundSummary;
}

export function ResolutionSummary({ summary }: ResolutionSummaryProps) {
  const budgetSign = summary.budgetDelta >= 0 ? '+' : '';

  return (
    <div
      className="absolute inset-x-0 bottom-16 z-40 mx-4 border border-gray-700 bg-gray-950/95 rounded-lg p-3 shadow-xl"
      aria-live="polite"
      aria-label="Round resolution summary"
    >
      <div className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-2">
        Round {summary.round} Summary
      </div>
      <div className="grid grid-cols-4 gap-3 text-xs font-mono mb-2">
        <div>
          <div className="text-gray-500">Served</div>
          <div className="text-green-400 font-bold">{summary.resolvedCount}</div>
        </div>
        <div>
          <div className="text-gray-500">Failed</div>
          <div className={summary.failedCount > 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
            {summary.failedCount}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Budget</div>
          <div
            className={
              summary.budgetDelta >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'
            }
          >
            {budgetSign}${summary.budgetDelta.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Overloads</div>
          <div
            className={
              summary.overloadPenalties > 0 ? 'text-orange-400 font-bold' : 'text-gray-400'
            }
          >
            {summary.overloadPenalties > 0
              ? `-$${summary.overloadPenalties.toLocaleString()}`
              : '—'}
          </div>
        </div>
      </div>
      {summary.spawnedTrafficCount > 0 && (
        <div className="text-xs font-mono text-yellow-400 border-t border-gray-800 pt-2">
          ⚠ {summary.spawnedTrafficCount} traffic card
          {summary.spawnedTrafficCount !== 1 ? 's' : ''} spawned by event — now visible on board
        </div>
      )}
    </div>
  );
}
