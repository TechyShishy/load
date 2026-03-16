import React from 'react';
import { getDayName, getWeekNumber, isWeekend } from '@load/game-core';

const PHASES: { id: string; label: string }[] = [
  { id: 'draw', label: 'Draw' },
  { id: 'scheduling', label: 'Schedule' },
  { id: 'crisis', label: 'Crisis' },
  { id: 'resolution', label: 'Resolve' },
  { id: 'end', label: 'End' },
];

interface PhaseIndicatorProps {
  currentPhase: string;
  round: number;
  onOpenCalendar: () => void;
}

export function PhaseIndicator({ currentPhase, round, onOpenCalendar }: PhaseIndicatorProps) {
  const activePhase = PHASES.find((p) => p.id === currentPhase);
  const dayName = getDayName(round);
  const weekNum = getWeekNumber(round);
  const weekend = isWeekend(round);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onOpenCalendar}
        aria-label="Open round calendar"
        className={`text-xs mr-2 font-mono rounded px-1 hover:bg-gray-800 transition-colors ${weekend ? 'text-amber-400 opacity-80' : 'opacity-50 hover:opacity-100'}`}
      >
        {dayName}, W{weekNum}
      </button>
      {weekend && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-800 text-amber-200 font-mono mr-1" aria-hidden="true">
          Weekend
        </span>
      )}
      {PHASES.map((phase) => {
        const isActive = currentPhase === phase.id;
        return (
          <div
            key={phase.id}
            aria-current={isActive ? 'step' : undefined}
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
      <span role="status" aria-live="polite" className="sr-only">
        {dayName}, Week {weekNum} – {activePhase?.label ?? currentPhase} phase
      </span>
    </div>
  );
}
