import React from 'react';

interface SLAMeterProps {
  slaCount: number;
  slaLimit: number;
}

export function SLAMeter({ slaCount, slaLimit }: SLAMeterProps) {
  return (
    <div
      role="meter"
      aria-label="SLA failures"
      aria-valuenow={slaCount}
      aria-valuemin={0}
      aria-valuemax={slaLimit}
      aria-live="assertive"
      className="flex items-center gap-2"
    >
      <span className="text-xs font-bold uppercase tracking-widest opacity-60" aria-hidden="true">SLA</span>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: slaLimit }).map((_, i) => (
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
      <span className={`text-sm font-mono ${slaCount >= slaLimit - 1 ? 'text-red-400' : 'text-gray-400'}`} aria-hidden="true">
        {slaCount}/{slaLimit}
      </span>
    </div>
  );
}
