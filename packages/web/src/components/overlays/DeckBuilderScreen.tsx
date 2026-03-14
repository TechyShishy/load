import React, { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { ACTION_CARDS, DEFAULT_ACTION_DECK, MIN_DECK_SIZE, validateDeckSpec } from '@load/game-core';
import type { DeckSpec } from '@load/game-core';
import { ActionCardPreview } from '../hud/HandZone.js';
import { loadDeckConfig, saveDeckConfig } from '../../save.js';

interface DeckBuilderScreenProps {
  onBack: () => void;
  /** Called after saving the current deck; App transitions to the contract screen. */
  onStart: () => void;
}

function initialCounts(): Record<string, number> {
  const saved = loadDeckConfig();
  const spec = saved ?? DEFAULT_ACTION_DECK;
  // Seed every known card at zero so unrepresented entries still appear in the UI.
  const counts: Record<string, number> = {};
  for (const card of ACTION_CARDS) {
    counts[card.templateId] = 0;
  }
  for (const entry of spec) {
    if (Object.prototype.hasOwnProperty.call(counts, entry.templateId)) {
      counts[entry.templateId] = entry.count;
    }
  }
  return counts;
}

function defaultCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const card of ACTION_CARDS) {
    counts[card.templateId] = 0;
  }
  for (const entry of DEFAULT_ACTION_DECK) {
    counts[entry.templateId] = entry.count;
  }
  return counts;
}

export function DeckBuilderScreen({ onBack, onStart }: DeckBuilderScreenProps) {
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);

  const currentSpec: DeckSpec[] = ACTION_CARDS.map((card) => ({
    templateId: card.templateId,
    count: counts[card.templateId] ?? 0,
  }));
  const { valid: isValid, total } = validateDeckSpec(currentSpec);

  const adjust = (templateId: string, delta: number) => {
    setCounts((prev) => ({
      ...prev,
      [templateId]: Math.max(0, (prev[templateId] ?? 0) + delta),
    }));
  };

  const handleReset = () => {
    setCounts(defaultCounts());
  };

  const handleSave = () => {
    if (!isValid) return;
    saveDeckConfig(currentSpec);
  };

  const handleStart = () => {
    if (!isValid) return;
    saveDeckConfig(currentSpec);
    onStart();
  };

  return (
    <FocusTrap focusTrapOptions={{ initialFocus: '#deck-builder-back-btn', escapeDeactivates: false }}>
      <div
        className="absolute inset-0 flex flex-col bg-black/95 z-50 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-builder-title"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-6 pb-4 border-b border-cyan-900">
          <button
            id="deck-builder-back-btn"
            onClick={onBack}
            className="text-gray-400 hover:text-cyan-400 font-mono text-sm tracking-widest transition-colors"
          >
            ← BACK
          </button>
          <h1
            id="deck-builder-title"
            className="text-cyan-400 text-xl font-bold font-mono tracking-widest"
          >
            DECK BUILDER
          </h1>
          <button
            onClick={handleReset}
            className="text-gray-500 hover:text-gray-300 font-mono text-xs tracking-widest transition-colors"
          >
            RESET TO DEFAULT
          </button>
        </div>

        {/* Card grid */}
        <div className="flex-1 p-6">
          <div className="flex flex-wrap gap-5 justify-center max-w-4xl mx-auto">
            {ACTION_CARDS.map((card) => {
              const count = counts[card.templateId] ?? 0;
              return (
                <div key={card.templateId} className="flex flex-col items-center gap-2">
                  <ActionCardPreview card={card} />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => adjust(card.templateId, -1)}
                      disabled={count === 0}
                      aria-label={`Remove one ${card.name}`}
                      className="w-7 h-7 flex items-center justify-center rounded border border-purple-700 text-purple-300 hover:bg-purple-800 disabled:opacity-30 disabled:cursor-not-allowed font-bold font-mono transition-colors"
                    >
                      −
                    </button>
                    <span
                      className="w-8 text-center font-mono text-white text-sm"
                      aria-label={`${count} copies of ${card.name}`}
                    >
                      {count}
                    </span>
                    <button
                      onClick={() => adjust(card.templateId, 1)}
                      aria-label={`Add one ${card.name}`}
                      // TODO-0016: cap this button by the player's owned count once card ownership is implemented
                      className="w-7 h-7 flex items-center justify-center rounded border border-purple-700 text-purple-300 hover:bg-purple-800 font-bold font-mono transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer: total + actions */}
        <div className="flex-shrink-0 border-t border-cyan-900 px-6 py-4 flex items-center justify-between gap-4">
          <div
            className={`font-mono text-sm tracking-widest ${isValid ? 'text-green-400' : 'text-red-400'}`}
            aria-live="polite"
          >
            {total} CARDS
            {isValid
              ? <span className="ml-2 text-xs text-gray-500">(min {MIN_DECK_SIZE})</span>
              : <span className="ml-2 text-xs">(need {MIN_DECK_SIZE - total} more)</span>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={!isValid}
              className="px-5 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded font-mono tracking-widest transition-colors text-sm"
            >
              SAVE
            </button>
            <button
              onClick={handleStart}
              disabled={!isValid}
              className="px-5 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded font-mono tracking-widest transition-colors text-sm"
            >
              START →
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
