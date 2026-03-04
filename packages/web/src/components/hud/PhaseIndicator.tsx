import React from 'react';
import { PhaseId } from '@load/game-core';

const PHASES: { id: string; label: string }[] = [
  { id: 'draw', label: 'Draw' },
  { id: 'scheduling', label: 'Schedule' },
  { id: 'execution', label: 'Execute' },
  { id: 'crisis', label: 'Crisis' },
  { id: 'resolution', label: 'Resolve' },
  { id: 'end', label: 'End' },
];

interface PhaseIndicatorProps {
  currentPhase: string;
  round: number;
}

export function PhaseIndicator({ currentPhase, round }: PhaseIndicatorProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs opacity-50 mr-2 font-mono">R{round}</span>
      {PHASES.map((phase) => {
        const isActive = currentPhase === phase.id;
        return (
          <div
            key={phase.id}
            className={`text-xs px-2 py-0.5 rounded font-mono transition-all ${
              isActive
                ? 'bg-cyan-500 text-black font-bold'
                : 'bg-gray-800 text-gray-500'
            }`}
          >
            {phase.label}
          </div>
        );
      })}
    </div>
  );
}
