import React from 'react';

interface BudgetBarProps {
  budget: number;
}

export function BudgetBar({ budget }: BudgetBarProps) {
  const isNegative = budget < 0;
  const isDanger = budget < 100_000;
  const isWarning = budget < 250_000 && !isDanger;

  const colorClass = isNegative
    ? 'text-red-400 border-red-500'
    : isDanger
      ? 'text-orange-400 border-orange-500'
      : isWarning
        ? 'text-yellow-400 border-yellow-500'
        : 'text-green-400 border-green-500';

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(budget);

  return (
    <div className={`flex items-center gap-2 border rounded px-3 py-1 ${colorClass}`}>
      <span className="text-xs font-bold uppercase tracking-widest opacity-60">Budget</span>
      <span className="text-lg font-mono font-bold">{formatted}</span>
    </div>
  );
}
