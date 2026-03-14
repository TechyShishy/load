import React, { useLayoutEffect } from 'react';
import FocusTrap from 'focus-trap-react';
import { BUILT_IN_CONTRACTS } from '@load/game-core';
import type { ContractDef } from '@load/game-core';

export type StartScreenStep = 'menu' | 'contract';

interface StartScreenProps {
  hasSave: boolean;
  step: StartScreenStep;
  onStepChange: (step: StartScreenStep) => void;
  onNewGame: (contract: ContractDef) => void;
  onContinue: () => void;
  onDeckBuilder: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export function StartScreen({ hasSave, step, onStepChange, onNewGame, onContinue, onDeckBuilder, onSettings, onQuit }: StartScreenProps) {

  // Move focus to the active panel before the browser paints so that the
  // outgoing panel's aria-hidden never covers a focused element.
  useLayoutEffect(() => {
    const id = step === 'contract' ? 'contract-back-btn' : 'start-new-game-btn';
    document.getElementById(id)?.focus();
  }, [step]);

  return (
    <FocusTrap focusTrapOptions={{ initialFocus: step === 'menu' ? '#start-new-game-btn' : '#contract-back-btn', escapeDeactivates: false }}>
      <div
        className="absolute inset-0 flex items-center justify-center bg-black/90 z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-screen-title"
      >
        <div className="border border-cyan-700 bg-gray-950 rounded-lg p-10 max-w-sm w-full text-center shadow-2xl">
          <h1
            id="start-screen-title"
            className="text-cyan-400 text-6xl font-bold font-mono tracking-widest mb-1"
          >
            LOAD
          </h1>
          <div className="text-gray-500 text-xs font-mono tracking-widest uppercase mb-10">
            Network Traffic Balancer
          </div>

          {/* Animated panel container */}
          <div className="relative">
            {/* Menu panel */}
            <div
              aria-hidden={step !== 'menu'}
              className={`flex flex-col gap-3 transition-all duration-300 ${
                step === 'menu'
                  ? 'opacity-100 translate-x-0'
                  : 'opacity-0 -translate-x-8 pointer-events-none absolute inset-0'
              }`}
            >
              <button id="start-new-game-btn" onClick={() => onStepChange('contract')}
                className="w-full px-5 py-3 bg-cyan-700 hover:bg-cyan-600 text-white font-bold rounded font-mono tracking-widest transition-colors">
                NEW GAME
              </button>
              {hasSave && (
                <button onClick={onContinue}
                  className="w-full px-5 py-3 bg-indigo-700 hover:bg-indigo-600 text-white font-bold rounded font-mono tracking-widest transition-colors">
                  CONTINUE
                </button>
              )}
              <button onClick={onDeckBuilder}
                className="w-full px-5 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded font-mono tracking-widest transition-colors">
                DECK BUILDER
              </button>
              <button onClick={onSettings}
                className="w-full px-5 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded font-mono tracking-widest transition-colors">
                SETTINGS
              </button>
              <button onClick={onQuit}
                className="w-full px-5 py-3 bg-gray-800 hover:bg-gray-700 text-red-400 font-bold rounded font-mono tracking-widest transition-colors">
                QUIT
              </button>
            </div>

            {/* Contract selection panel */}
            <div
              aria-hidden={step !== 'contract'}
              className={`flex flex-col gap-3 transition-all duration-300 ${
                step === 'contract'
                  ? 'opacity-100 translate-x-0'
                  : 'opacity-0 translate-x-8 pointer-events-none absolute inset-0'
              }`}
            >
              <div className="text-gray-400 text-xs font-mono tracking-widest uppercase mb-1">Select Contract</div>
              {BUILT_IN_CONTRACTS.map((c, i) => (
                <button
                  key={c.id}
                  id={i === 0 ? 'contract-first-btn' : undefined}
                  onClick={() => onNewGame(c)}
                  className="w-full text-left px-4 py-3 border border-cyan-900 rounded bg-gray-900 hover:bg-gray-800 hover:border-cyan-700 transition-colors"
                >
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-cyan-400 font-mono font-bold text-sm tracking-widest">{c.name.toUpperCase()}</span>
                    <span className="text-gray-500 text-xs font-mono">{c.slaLimit} SLA max</span>
                  </div>
                  <p className="text-gray-400 text-xs mb-2 leading-relaxed">{c.description}</p>
                  <span className="text-green-400 text-xs font-mono">${(c.startingBudget / 1_000).toFixed(0)}k starting</span>
                </button>
              ))}
              <button
                id="contract-back-btn"
                onClick={() => onStepChange('menu')}
                className="w-full px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 font-bold rounded font-mono tracking-widest transition-colors text-sm mt-1"
              >
                ← BACK
              </button>
            </div>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
