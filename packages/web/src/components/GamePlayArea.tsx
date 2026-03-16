import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, Modifier } from '@dnd-kit/core';
import { useGame } from '../hooks/useGame.js';
import { useDrawAnimationState } from '../hooks/useDrawAnimationState.js';
import { useSettings } from '../settings/SettingsContext.js';
import { BUILT_IN_CONTRACTS, Period, Track, getFilledTimeSlots, getHand, getPendingEvents } from '@load/game-core';
import type { ActionCard, ContractDef } from '@load/game-core';
import { GameCanvas } from './canvas/GameCanvas.js';
import { BoardDropZones } from './canvas/BoardDropZones.js';
import { BoardCardOverlay } from './canvas/BoardCardOverlay.js';
import { BudgetBar } from './hud/BudgetBar.js';
import { SLAMeter } from './hud/SLAMeter.js';
import { PhaseIndicator } from './hud/PhaseIndicator.js';
import { HandZone, ActionCardPreview } from './hud/HandZone.js';
import { WinScreen, LoseScreen } from './overlays/EndScreens.js';
import { EventModal } from './overlays/EventModal.js';
import { CalendarModal } from './overlays/CalendarModal.js';
import { ErrorBoundary } from 'react-error-boundary';
import { SoftErrorFallback } from './overlays/ErrorFallbacks.js';

/**
 * When dragging from the expanded-card flyout the draggable node is 180×240 but the
 * DragOverlay preview is 90×120.  This modifier shifts the overlay so its centre
 * (45 px, 60 px) sits exactly under the cursor, but only for flyout drags.
 */
const snapFlyoutToCursor: Modifier = ({ transform, activatorEvent, draggingNodeRect, active }) => {
  if (!active?.id.toString().endsWith('-flyout')) return transform;
  if (!activatorEvent || !draggingNodeRect) return transform;
  const { clientX, clientY } = activatorEvent as PointerEvent;
  return {
    ...transform,
    x: transform.x + clientX - draggingNodeRect.left - 45,
    y: transform.y + clientY - draggingNodeRect.top - 60,
  };
};

export function GamePlayArea({ contract, onReturnToMenu, onOpenSettings }: { contract?: ContractDef; onReturnToMenu: () => void; onOpenSettings: () => void }) {
  const { context, phase, advance, drawComplete, playAction, isWon, isLost } = useGame(contract);
  const { settings } = useSettings();
  const timeSlots = useMemo(() => getFilledTimeSlots(context), [context]);
  const hand = useMemo(() => getHand(context), [context]);
  const pendingEvents = useMemo(() => getPendingEvents(context), [context]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<ActionCard | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  useEffect(() => { if (isWon || isLost) setIsCalendarOpen(false); }, [isWon, isLost]);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeContractName = BUILT_IN_CONTRACTS.find((c) => c.id === context.contractId)?.name ?? context.contractId;

  // Use the settings-controlled reducedMotion flag which already initialises
  // from the OS preference on first load.
  const prefersReducedMotion = settings.reducedMotion;

  const { arrivedCardIds, markArrived, allTrafficIds, allEventIds, allActionIds, speedMult } = useDrawAnimationState({
    drawLog: context.drawLog ?? null,
    round: context.round,
    prefersReducedMotion,
    onComplete: drawComplete,
  });

  // When prefers-reduced-motion is active, animations are skipped and markArrived
  // is never called, leaving arrivedCardIds empty. Treat all cards as arrived so
  // they are not suppressed from the hand or board.
  const suppressedCardIds = useMemo(
    () => prefersReducedMotion ? new Set<string>() : new Set([
      ...allTrafficIds.filter((id) => !arrivedCardIds.has(id)),
      ...allActionIds.filter((id) => !arrivedCardIds.has(id)),
    ]),
    [prefersReducedMotion, allTrafficIds, allActionIds, arrivedCardIds],
  );

  // When prefers-reduced-motion is set, card animations are skipped and
  // markArrived is never called — treat crisis as done immediately in that case.
  const crisisAnimsDone =
    prefersReducedMotion ||
    allEventIds.length === 0 ||
    allEventIds.every((id) => arrivedCardIds.has(id));

  const handlePlayAgain = useCallback(() => {
    onReturnToMenu();
  }, [onReturnToMenu]);

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
        const slot = timeSlots.find((s) => s.period === period && s.index === slotIndex);
        if (!slot) return;

        if (zones.includes('occupied-slot')) {
          const firstCard = slot.card;
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
      } else if (typeof over.id === 'string' && over.id.startsWith('ticket-')) {
        const ticketId = over.id.slice('ticket-'.length);
        if (zones.includes('ticket')) {
          playAction(card, ticketId);
          showFeedback(`${card.name}: Working ticket (-$${card.cost.toLocaleString()})`);
        } else {
          showFeedback(`${card.name}: ${card.invalidZoneFeedback}`);
        }
      } else if (typeof over.id === 'string' && over.id.startsWith('track-')) {
        const trackName = over.id.slice('track-'.length) as Track;
        if (zones.includes('track')) {
          playAction(card, undefined, undefined, undefined, trackName);
          // Cards that target only tracks (e.g. a hypothetical future TrackClear card)
          // get track-specific feedback; cards that accept multiple zone types
          // treat the track as a fire trigger.
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
    [playAction, timeSlots, showFeedback],
  );

  const canAdvance = phase === 'scheduling' || phase === 'crisis';
  const canPlayCard = phase === 'scheduling' || phase === 'crisis';

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
    <ErrorBoundary FallbackComponent={SoftErrorFallback} resetKeys={[phase]}>
    <div role="main" data-phase={phase} className="relative flex flex-col w-full h-full overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0 flex-wrap">
        <div className="text-cyan-400 font-mono font-bold text-sm tracking-widest">LOAD</div>
        <span className="text-gray-500 text-xs font-mono tracking-widest uppercase">{activeContractName}</span>
        <BudgetBar budget={context.budget} />
        <SLAMeter slaCount={context.slaCount} slaLimit={context.slaLimit} />
        <div className="flex-1" />
        <PhaseIndicator currentPhase={phase} round={context.round} onOpenCalendar={() => setIsCalendarOpen(true)} />
        <button
          onClick={onOpenSettings}
          aria-label="Open settings"
          className="ml-2 text-gray-500 hover:text-gray-300 font-mono text-base px-2 py-1 rounded hover:bg-gray-800 transition-colors"
        >
          ⚙
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <GameCanvas
          context={context}
          phase={phase}
          containerRef={canvasRef}
          drawLog={context.drawLog}
          suppressedCardIds={suppressedCardIds}
          onCardArrived={markArrived}
          speedMult={speedMult}
          reducedMotion={settings.reducedMotion}
        />
        <BoardDropZones context={context} containerRef={canvasRef} activeCard={activeCard} />
        <BoardCardOverlay context={context} containerRef={canvasRef} activeCard={activeCard} />
      </div>
      <div className="flex items-center gap-2 px-4 border-t border-gray-800 bg-gray-900 flex-shrink-0">
        <div className="flex-1 overflow-x-auto min-w-0" aria-live="polite" aria-atomic="true">
          {actionFeedback && (
            <div className="px-3 py-1 mb-1 rounded text-xs font-mono bg-purple-900 border border-purple-600 text-purple-200 animate-pulse">
              ✓ {actionFeedback}
            </div>
          )}
          <HandZone
            hand={hand}
            disabled={!canPlayCard}
            isCardDisabled={(card) => card.crisisOnly === true && phase === 'scheduling'}
            suppressedCardIds={suppressedCardIds}
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
      {phase === 'crisis' && pendingEvents.length > 0 && crisisAnimsDone && (
        <EventModal
          event={pendingEvents[0]!}
          hand={hand}
          onMitigate={(card) => playAction(card)}
          onAdvance={advance}
        />
      )}
      {isWon && <WinScreen context={context} onPlayAgain={handlePlayAgain} />}
      {isLost && <LoseScreen context={context} onPlayAgain={handlePlayAgain} />}
      {isCalendarOpen && (
        <CalendarModal
          roundHistory={context.roundHistory}
          currentRound={context.round}
          onClose={() => setIsCalendarOpen(false)}
        />
      )}
    </div>
    </ErrorBoundary>
    <DragOverlay dropAnimation={null} modifiers={[snapFlyoutToCursor]}>
      {activeCard ? <ActionCardPreview card={activeCard} dragging /> : null}
    </DragOverlay>
    </DndContext>
  );
}
