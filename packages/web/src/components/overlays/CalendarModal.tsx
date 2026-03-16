import React from 'react';
import FocusTrap from 'focus-trap-react';
import type { RoundSummary } from '@load/game-core';
import { isWeekend, MAX_ROUNDS } from '@load/game-core';

interface CalendarModalProps {
  roundHistory: RoundSummary[];
  currentRound: number;
  onClose: () => void;
}

function formatDelta(delta: number): string {
  const abs = Math.abs(delta);
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${abs}`;
}

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function CalendarModal({ roundHistory, currentRound, onClose }: CalendarModalProps) {
  const summaryByRound = new Map<number, RoundSummary>(
    roundHistory.map((s) => [s.round, s]),
  );

  return (
    <FocusTrap focusTrapOptions={{ initialFocus: '#calendar-modal-close-btn', escapeDeactivates: false }}>
      <div
        className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/90"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-modal-title"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      >
        <div
          className="border border-gray-700 bg-gray-950 rounded-lg p-4 max-w-2xl w-full shadow-2xl mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <h2
              id="calendar-modal-title"
              className="text-sm font-mono font-bold text-cyan-400 uppercase tracking-widest"
            >
              Round Calendar
            </h2>
            <button
              id="calendar-modal-close-btn"
              onClick={onClose}
              aria-label="Close calendar"
              className="text-gray-500 hover:text-gray-300 font-mono text-base px-2 py-1 rounded hover:bg-gray-800 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {/* Column headers */}
            {DAY_HEADERS.map((day) => (
              <div
                key={day}
                className={`text-center text-xs font-mono font-bold py-1 ${
                  day === 'Sat' || day === 'Sun' ? 'text-amber-500' : 'text-gray-400'
                }`}
              >
                {day}
              </div>
            ))}

            {/* Day cells — rounds 1–28 */}
            {Array.from({ length: MAX_ROUNDS }, (_, i) => {
              const round = i + 1;
              const summary = summaryByRound.get(round);
              const isCurrent = round === currentRound;
              const isFuture = round > currentRound;
              const weekend = isWeekend(round);
              const prevSummary = summaryByRound.get(round - 1);
              const slaBreachesThisRound = summary
                ? summary.newSlaCount - (prevSummary?.newSlaCount ?? 0)
                : 0;

              // TODO-0020: clicking a completed day should open a per-day round detail flyout

              return (
                <div
                  key={round}
                  className={[
                    'rounded p-1.5 min-h-[3.5rem] flex flex-col gap-0.5 border',
                    isCurrent
                      ? 'border-cyan-600 bg-cyan-950/40'
                      : isFuture
                      ? 'border-gray-800 bg-transparent'
                      : 'border-gray-800 bg-gray-900/60',
                  ].join(' ')}
                >
                  <span
                    className={`text-[10px] font-mono font-bold leading-none ${
                      isCurrent
                        ? 'text-cyan-400'
                        : weekend
                        ? 'text-amber-600'
                        : 'text-gray-600'
                    }`}
                  >
                    R{round}
                  </span>

                  {summary && (
                    <>
                      <span
                        className={`text-[10px] font-mono leading-none tabular-nums ${
                          summary.budgetDelta > 0
                            ? 'text-green-400'
                            : summary.budgetDelta < 0
                            ? 'text-red-400'
                            : 'text-gray-400'
                        }`}
                      >
                        {formatDelta(summary.budgetDelta)}
                      </span>
                      {slaBreachesThisRound > 0 && (
                        <span className="text-[10px] font-mono leading-none text-red-500">
                          {slaBreachesThisRound} SLA
                        </span>
                      )}
                    </>
                  )}

                  {isCurrent && !summary && (
                    <span className="text-[9px] font-mono leading-none text-cyan-700">now</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-4 text-[10px] font-mono text-gray-600">
            <span>
              <span className="text-cyan-400">■</span> current
            </span>
            <span>
              <span className="text-green-400">■</span> gain
            </span>
            <span>
              <span className="text-gray-400">■</span> break-even
            </span>
            <span>
              <span className="text-red-400">■</span> loss / SLA
            </span>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
