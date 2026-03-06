import React, { useCallback, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useGame } from './hooks/useGame.js';
import { Period, Track } from '@load/game-core';
import type { ActionCard } from '@load/game-core';
import { GameCanvas } from './components/canvas/GameCanvas.js';
import { BoardDropZones } from './components/canvas/BoardDropZones.js';
import { BudgetBar } from './components/hud/BudgetBar.js';
import { SLAMeter } from './components/hud/SLAMeter.js';
import { PhaseIndicator } from './components/hud/PhaseIndicator.js';
import { HandZone, ActionCardPreview } from './components/hud/HandZone.js';
import { WinScreen, LoseScreen } from './components/overlays/EndScreens.js';
import { StartScreen } from './components/overlays/StartScreen.js';
import { EventModal } from './components/overlays/EventModal.js';
import { ResolutionSummary } from './components/overlays/ResolutionSummary.js';
import { ErrorBoundary } from 'react-error-boundary';
import { SoftErrorFallback } from './components/overlays/ErrorFallbacks.js';

export function App() {
  const { context, phase, advance, playAction, reset, isWon, isLost, hasSave } = useGame();
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<ActionCard | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleStartContinue = useCallback(() => {
    setShowStartScreen(false);
  }, []);

  const handleStartNewGame = useCallback(() => {
    reset();
    setShowStartScreen(false);
  }, [reset]);

  const handlePlayAgain = useCallback(() => {
    reset();
  }, [reset]);

  const handleQuit = useCallback(() => {
    const w = window as Window & { electronAPI?: { quit: () => void } };
    if (w.electronAPI) {
      w.electronAPI.quit();
    } else {
      window.close();
    }
  }, []);

  const showFeedback = useCallback(
    (msg: string) => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setActionFeedback(msg);
      feedbackTimerRef.current = setTimeout(() => setActionFeedback(null), 3500);
    },
    [],
  );

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const card = active.data.current?.card as ActionCard | undefined;
    setActiveCard(card ?? null);
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveCard(null);
      if (!over) return;
      const card = active.data.current?.card as ActionCard | undefined;
      if (!card) return;
      const zones = card.validDropZones;

      if (typeof over.id === 'string' && over.id.startsWith('period-')) {
        const period = over.id.slice('period-'.length) as Period;
        if (zones.includes('period')) {
          playAction(card, undefined, undefined, period);
          showFeedback(`${card.name}: Applied to ${period} (-$${card.cost.toLocaleString()})`);
        } else {
          showFeedback(`${card.name}: ${card.invalidZoneFeedback}`);
        }
      } else if (typeof over.id === 'string' && over.id.startsWith('slot-')) {
        // id format: "slot-Morning-0"
        const [, period, idxStr] = over.id.split('-') as [string, Period, string];
        const slotIndex = parseInt(idxStr ?? '0', 10);
        const slot = context.timeSlots.find((s) => s.period === period && s.index === slotIndex);
        if (!slot) return;

        if (zones.includes('occupied-slot')) {
          const firstCard = slot.cards[0];
          if (!firstCard) {
            showFeedback(`${card.name}: No traffic cards in this slot.`);
            return;
          }
          playAction(card, undefined, firstCard.id);
          showFeedback(`${card.name}: Removing traffic from slot (-$${card.cost.toLocaleString()})`);
        } else if (zones.includes('slot')) {
          playAction(card);
          showFeedback(`${card.name}: Mitigating the next pending event (-$${card.cost.toLocaleString()})`);
        } else {
          showFeedback(`${card.name}: ${card.invalidZoneFeedback}`);
        }
      } else if (typeof over.id === 'string' && over.id.startsWith('track-')) {
        const trackName = over.id.slice('track-'.length) as Track;
        if (zones.includes('track')) {
          playAction(card, undefined, undefined, undefined, trackName);
          // Cards that target only tracks (e.g. EmergencyMaintenance) get track-specific feedback;
          // cards that accept multiple zone types (e.g. SecurityPatch) treat the track as a fire trigger.
          if (zones.length === 1) {
            showFeedback(`${card.name}: Clearing a ticket from the ${trackName} track (-$${card.cost.toLocaleString()})`);
          } else {
            showFeedback(`${card.name}: Mitigating the next pending event (-$${card.cost.toLocaleString()})`);
          }
        } else {
          showFeedback(`${card.name}: ${card.invalidZoneFeedback}`);
        }
      } else {
        // board-area fallback
        if (zones.includes('board')) {
          playAction(card);
          showFeedback(`${card.name}: Mitigating the next pending event (-$${card.cost.toLocaleString()})`);
        } else {
          showFeedback(`${card.name}: ${card.invalidZoneFeedback}`);
        }
      }
    },
    [playAction, context.timeSlots, showFeedback],
  );

  const canAdvance = phase === 'scheduling' || phase === 'crisis' || phase === 'resolution';
  const canPlayCard = phase === 'scheduling' || phase === 'crisis';

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
    <ErrorBoundary FallbackComponent={SoftErrorFallback} resetKeys={[phase]}>
    <div role="main" className="relative flex flex-col w-full h-full overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0 flex-wrap">
        <div className="text-cyan-400 font-mono font-bold text-sm tracking-widest">LOAD</div>
        <BudgetBar budget={context.budget} />
        <SLAMeter slaCount={context.slaCount} />
        <div className="flex-1" />
        <PhaseIndicator currentPhase={phase} round={context.round} />
      </div>
      <div className="flex-1 relative overflow-hidden">
        <GameCanvas context={context} phase={phase} containerRef={canvasRef} />
        <BoardDropZones context={context} containerRef={canvasRef} activeCard={activeCard} />
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
            disabled={!canPlayCard}
            isCardDisabled={(card) => card.crisisOnly === true}
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
      {showStartScreen && (
        <StartScreen
          hasSave={hasSave}
          onNewGame={handleStartNewGame}
          onContinue={handleStartContinue}
          onSettings={() => {}}
          onQuit={handleQuit}
        />
      )}
      {phase === 'crisis' && context.pendingEvents.length > 0 && (
        <EventModal
          event={context.pendingEvents[0]!}
          hand={context.hand}
          onMitigate={(card) => playAction(card)}
          onAdvance={advance}
        />
      )}
      {phase === 'resolution' && context.lastRoundSummary !== null && (
        <ResolutionSummary summary={context.lastRoundSummary} />
      )}
      {isWon && <WinScreen context={context} onPlayAgain={handlePlayAgain} />}
      {isLost && <LoseScreen context={context} onPlayAgain={handlePlayAgain} />}
    </div>
    </ErrorBoundary>
    <DragOverlay dropAnimation={null}>
      {activeCard ? <ActionCardPreview card={activeCard} dragging /> : null}
    </DragOverlay>
    </DndContext>
  );
}
