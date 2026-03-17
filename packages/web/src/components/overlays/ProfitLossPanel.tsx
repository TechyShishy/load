import React from 'react';
import FocusTrap from 'focus-trap-react';
import type { LedgerEntry, RoundSummary } from '@load/game-core';

interface ProfitLossPanelProps {
  summary: RoundSummary;
  onClose: () => void;
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}k`;
  return `$${amount}`;
}

function formatDelta(delta: number): string {
  const abs = Math.abs(delta);
  const sign = delta >= 0 ? '+' : '-';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${abs}`;
}

const KIND_META: Record<LedgerEntry['kind'], { label: string; color: string; sign: 1 | -1 }> = {
  'traffic-revenue': { label: 'Traffic', color: 'text-green-400', sign: 1 },
  'ticket-revenue':  { label: 'Ticket',  color: 'text-cyan-400',  sign: 1 },
  'action-spend':    { label: 'Action',  color: 'text-amber-400', sign: -1 },
  'vendor-spend':    { label: 'Vendor',  color: 'text-purple-400', sign: -1 },
  'crisis-penalty':  { label: 'Crisis',  color: 'text-red-400',   sign: -1 },
};

export function ProfitLossPanel({ summary, onClose }: ProfitLossPanelProps) {
  // Aggregate ledger by kind.
  const totals = React.useMemo(() => {
    const acc = { trafficRevenue: 0, ticketRevenue: 0, actionSpend: 0, vendorSpend: 0, crisisPenalty: 0 };
    for (const entry of summary.ledger) {
      if (entry.kind === 'traffic-revenue') acc.trafficRevenue += entry.amount;
      else if (entry.kind === 'ticket-revenue') acc.ticketRevenue += entry.amount;
      else if (entry.kind === 'action-spend') acc.actionSpend += entry.amount;
      else if (entry.kind === 'vendor-spend') acc.vendorSpend += entry.amount;
      else if (entry.kind === 'crisis-penalty') acc.crisisPenalty += entry.amount;
    }
    return acc;
  }, [summary]);

  return (
    <FocusTrap focusTrapOptions={{ initialFocus: '#pnl-close-btn', escapeDeactivates: false }}>
      <div
        className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/90"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pnl-title"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      >
        <div
          className="border border-gray-700 bg-gray-950 rounded-lg p-4 max-w-sm w-full shadow-2xl mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h2
              id="pnl-title"
              className="text-sm font-mono font-bold text-cyan-400 uppercase tracking-widest"
            >
              {`Round ${summary.round} — P&L`}
            </h2>
            <button
              id="pnl-close-btn"
              onClick={onClose}
              aria-label="Close P&L panel"
              className="text-gray-500 hover:text-gray-300 font-mono text-base px-2 py-1 rounded hover:bg-gray-800 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* No prior round */}
          <>
              {/* Summary totals */}
              <div className="grid grid-cols-2 gap-1 mb-3">
                <div className="rounded bg-gray-900 border border-gray-800 p-2">
                  <div className="text-[10px] font-mono text-gray-500 uppercase mb-0.5">Traffic revenue</div>
                  <div className="text-sm font-mono font-bold text-green-400">
                    {formatAmount(totals.trafficRevenue)}
                  </div>
                </div>
                <div className="rounded bg-gray-900 border border-gray-800 p-2">
                  <div className="text-[10px] font-mono text-gray-500 uppercase mb-0.5">Ticket revenue</div>
                  <div className="text-sm font-mono font-bold text-cyan-400">
                    {formatAmount(totals.ticketRevenue)}
                  </div>
                </div>
                <div className="rounded bg-gray-900 border border-gray-800 p-2">
                  <div className="text-[10px] font-mono text-gray-500 uppercase mb-0.5">Action spend</div>
                  <div className="text-sm font-mono font-bold text-amber-400">
                    {`-${formatAmount(totals.actionSpend)}`}
                  </div>
                </div>
                <div className="rounded bg-gray-900 border border-gray-800 p-2">
                  <div className="text-[10px] font-mono text-gray-500 uppercase mb-0.5">Vendor spend</div>
                  <div className="text-sm font-mono font-bold text-purple-400">
                    {`-${formatAmount(totals.vendorSpend)}`}
                  </div>
                </div>
                <div className="rounded bg-gray-900 border border-gray-800 p-2">
                  <div className="text-[10px] font-mono text-gray-500 uppercase mb-0.5">Crisis penalty</div>
                  <div className="text-sm font-mono font-bold text-red-400">
                    {`-${formatAmount(totals.crisisPenalty)}`}
                  </div>
                </div>
              </div>

              {/* Net delta */}
              <div className="flex items-center justify-between border-t border-gray-800 pt-2 mb-3">
                <span className="text-[10px] font-mono text-gray-500 uppercase">Net</span>
                <span
                  className={`text-sm font-mono font-bold tabular-nums ${
                    summary.budgetDelta > 0
                      ? 'text-green-400'
                      : summary.budgetDelta < 0
                      ? 'text-red-400'
                      : 'text-gray-400'
                  }`}
                >
                  {formatDelta(summary.budgetDelta)}
                </span>
              </div>

              {/* Per-entry play log */}
              {summary.ledger.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono text-gray-600 uppercase mb-1">Play log</div>
                  <ul className="space-y-0.5 max-h-48 overflow-y-auto pr-1" aria-label="Round play log">
                    {summary.ledger.map((entry, i) => {
                      const meta = KIND_META[entry.kind]!;
                      const signed = meta.sign === 1
                        ? `+${formatAmount(entry.amount)}`
                        : `-${formatAmount(entry.amount)}`;
                      return (
                        <li
                          key={`${entry.kind}-${i}`}
                          className="flex items-center justify-between text-[10px] font-mono"
                        >
                          <span className="text-gray-500 mr-2 shrink-0">[{meta.label}]</span>
                          <span className="text-gray-300 flex-1 truncate">{entry.label}</span>
                          <span className={`${meta.color} tabular-nums ml-2 shrink-0`}>{signed}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {summary.ledger.length === 0 && (
                <p className="text-[10px] font-mono text-gray-600 text-center py-1">
                  No actions played this round.
                </p>
              )}
          </>
        </div>
      </div>
    </FocusTrap>
  );
}
