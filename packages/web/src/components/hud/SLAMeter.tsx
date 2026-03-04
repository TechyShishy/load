import React from 'react';
import { MAX_SLA_FAILURES } from '@load/game-core';

interface SLAMeterProps {
  slaCount: number;
}

export function SLAMeter({ slaCount }: SLAMeterProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-widest opacity-60">SLA</span>
      <div className="flex gap-1">
        {Array.from({ length: MAX_SLA_FAILURES }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-sm border transition-all ${
              i < slaCount
                ? 'bg-red-500 border-red-400'
                : 'bg-gray-800 border-gray-600'
            }`}
          />
        ))}
      </div>
      <span className={`text-sm font-mono ${slaCount >= 2 ? 'text-red-400' : 'text-gray-400'}`}>
        {slaCount}/{MAX_SLA_FAILURES}
      </span>
    </div>
  );
}
