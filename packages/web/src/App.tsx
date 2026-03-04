import React, { useCallback, useRef, useState } from 'react';
import { useGame } from './hooks/useGame.js';
import { ActionEffectType } from '@load/game-core';
import type { ActionCard } from '@load/game-core';
import { GameCanvas } from './components/canvas/GameCanvas.js';
import { BudgetBar } from './components/hud/BudgetBar.js';
import { SLAMeter } from './components/hud/SLAMeter.js';
import { PhaseIndicator } from './components/hud/PhaseIndicator.js';
import { HandZone } from './components/hud/HandZone.js';
import { WinScreen, LoseScreen } from './components/overlays/EndScreens.js';
import { ContinueModal } from './components/overlays/ContinueModal.js';

export function App() {
  const { context, phase, advance, playAction, reset, isWon, isLost, hasSave } = useGame();
  const [showContinue, setShowContinue] = useState(() => hasSave);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleContinue = useCallback(() => {
    setShowContinue(false);
  }, []);

  const handleNewGame = useCallback(() => {
    reset();
    setShowContinue(false);
  }, [reset]);

  const handlePlayAgain = useCallback(() => {
    reset();
  }, [reset]);

  const handlePlayCard = useCallback(
    (card: ActionCard, targetTrafficCardId?: string) => {
      // For RemoveTrafficCard: use provided targetTrafficCardId (future DnD path)
      // or auto-pick the first available traffic card on the board as a stub.
      // TODO-0005: replace auto-pick with DnD selection
      const resolvedTarget =
        card.effectType === ActionEffectType.RemoveTrafficCard
          ? (targetTrafficCardId ?? context.timeSlots.flatMap((s) => s.cards)[0]?.id)
          : undefined;
      playAction(card, undefined, resolvedTarget);
      const messages: Record<string, string> = {
        [ActionEffectType.ClearTicket]: `Cleared 1 ticket from ${card.targetTrack ?? 'track'} track.`,
        [ActionEffectType.RemoveTrafficCard]: `Removing 1 traffic card and collecting its revenue.`,
        [ActionEffectType.BoostSlotCapacity]: `+${card.effectValue} capacity for ${card.targetPeriod ?? 'period'} slots.`,
        [ActionEffectType.MitigateDDoS]: `Mitigating the next pending event.`,
        [ActionEffectType.AddOvernightSlots]: `+${card.effectValue} overnight slots added.`,
      };
      const msg = `${card.name}: ${messages[card.effectType] ?? card.description} (-$${card.cost.toLocaleString()})`;
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setActionFeedback(msg);
      feedbackTimerRef.current = setTimeout(() => setActionFeedback(null), 3500);
    },
    [playAction, context.timeSlots],
  );

  const canAdvance = phase === 'scheduling' || phase === 'crisis';
  const canPlayCard = phase === 'scheduling' || phase === 'crisis';

  return (
    <div role="main" className="relative flex flex-col w-full h-full overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0 flex-wrap">
        <div className="text-cyan-400 font-mono font-bold text-sm tracking-widest">LOAD</div>
        <BudgetBar budget={context.budget} />
        <SLAMeter slaCount={context.slaCount} />
        <div className="flex-1" />
        <PhaseIndicator currentPhase={phase} round={context.round} />
      </div>
      <div className="flex-1 relative overflow-hidden">
        <GameCanvas context={context} phase={phase} />
      </div>
      <div className="flex items-center gap-2 px-4 border-t border-gray-800 bg-gray-900 flex-shrink-0">
        <div className="flex-1 overflow-x-auto min-w-0" aria-live="polite" aria-atomic="true">
          {actionFeedback && (
            <div className="px-3 py-1 mb-1 rounded text-xs font-mono bg-purple-900 border border-purple-600 text-purple-200 animate-pulse">
              ✓ {actionFeedback}
            </div>
          )}
          <HandZone
            hand={context.hand}
            onPlayCard={handlePlayCard}
            disabled={!canPlayCard}
          />
        </div>
        <button
          onClick={advance}
          disabled={!canAdvance}
          aria-disabled={!canAdvance}
          aria-label={canAdvance ? "Advance to next phase" : "Cannot advance yet"}
          className={`
            px-5 py-2 rounded font-mono font-bold text-sm transition-all flex-shrink-0
            ${canAdvance
              ? 'bg-cyan-600 hover:bg-cyan-500 text-black cursor-pointer active:scale-95'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }
          `}
        >
          ADVANCE →
        </button>
      </div>
      {showContinue && !isWon && !isLost && (
        <ContinueModal onContinue={handleContinue} onNewGame={handleNewGame} />
      )}
      {isWon && <WinScreen context={context} onPlayAgain={handlePlayAgain} />}
      {isLost && <LoseScreen context={context} onPlayAgain={handlePlayAgain} />}
    </div>
  );
}
