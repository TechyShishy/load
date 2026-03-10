import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CardType, Period, getFilledTimeSlots, getTracks, getTrafficDiscard, getEventDiscard, getActionDiscard } from '@load/game-core';
import type { ActionCard, EventCard, GameContext, TrafficCard } from '@load/game-core';
import {
  computeDeckPileRect,
  computeSlotRect,
  computeTicketRect,
} from './canvasLayout.js';

const PERIOD_ORDER: Period[] = [Period.Morning, Period.Afternoon, Period.Evening, Period.Overnight];

// ── Flyout ───────────────────────────────────────────────────────────────────

type BoardCard = TrafficCard | EventCard | ActionCard;

function BoardCardFlyout({
  card,
  sourceRect,
  onDismiss,
}: {
  card: BoardCard;
  sourceRect: DOMRect;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  const flyoutWidth = 180;
  const gap = 8;
  const centerX = sourceRect.left + sourceRect.width / 2;
  const left = Math.max(
    16,
    Math.min(centerX - flyoutWidth / 2, window.innerWidth - flyoutWidth - 16),
  );
  // Open downward when the source is in the top half of the viewport so the
  // flyout never extends above the gameplay area (e.g. discard piles at top).
  const openDownward = sourceRect.top < window.innerHeight / 2;
  const verticalStyle = openDownward
    ? { top: sourceRect.bottom + gap }
    : { bottom: window.innerHeight - sourceRect.top + gap };

  const isTraffic = card.type === CardType.Traffic;
  const isAction = card.type === CardType.Action;

  return createPortal(
    <>
      {/* Transparent backdrop — click outside to dismiss */}
      <div
        data-testid="board-card-flyout-backdrop"
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={onDismiss}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${card.name} details`}
        tabIndex={-1}
        style={{
          position: 'fixed',
          left,
          ...verticalStyle,
          zIndex: 9999,
          width: flyoutWidth,
        }}
        className="flex flex-col border border-cyan-400 rounded bg-purple-950 shadow-2xl shadow-cyan-900/60"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-1.5 pt-1 border-b border-purple-700/30">
          <span
            className="font-bold text-purple-300 leading-tight flex-1 min-w-0 overflow-hidden whitespace-nowrap text-ellipsis"
            style={{ fontSize: '11px' }}
          >
            {card.name}
          </span>
          <button
            onClick={onDismiss}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Close card details"
            className="text-gray-400 hover:text-white leading-none ml-1 flex-shrink-0 cursor-pointer"
            style={{ fontSize: '14px' }}
          >
            ×
          </button>
        </div>

        {/* Art */}
        <img
          src={`./cards/${card.templateId}.svg`}
          alt=""
          aria-hidden="true"
          className="w-full object-cover bg-purple-900/40"
          style={{ height: '112px', imageRendering: 'pixelated' }}
        />

        {/* Body */}
        <div className="flex flex-col items-stretch p-2 gap-1">
          <p className="text-gray-300 leading-snug" style={{ fontSize: '10px' }}>
            {card.description}
          </p>
          {isTraffic ? (
            <div className="flex gap-2 flex-shrink-0" style={{ fontSize: '10px' }}>
              <span className="text-yellow-400 font-mono">
                ${card.revenue.toLocaleString()}
              </span>
            </div>
          ) : isAction ? (
            <span
              className="text-green-400 font-mono flex-shrink-0 border border-green-400/40 rounded px-1 self-start"
              style={{ fontSize: '9px' }}
            >
              Cost: ${card.cost.toLocaleString()}
            </span>
          ) : (
            <span
              className="text-orange-400 font-mono flex-shrink-0 border border-orange-400/40 rounded px-1 self-start"
              style={{ fontSize: '9px' }}
            >
              {card.label}
            </span>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Hit-zone components ───────────────────────────────────────────────────────

interface DiscardPileHitZoneProps {
  card: BoardCard;
  pileRect: { x: number; y: number; w: number; h: number };
  label: string;
  onActivate: (rect: DOMRect) => void;
}

function DiscardPileHitZone({ card, pileRect, label, onActivate }: DiscardPileHitZoneProps) {
  return (
    <div
      aria-label={`View ${label} discard pile — top card: ${card.name}`}
      role="button"
      tabIndex={0}
      style={{
        position: 'absolute',
        left: pileRect.x,
        top: pileRect.y,
        width: pileRect.w,
        height: pileRect.h,
        cursor: 'pointer',
        zIndex: 2,
      }}
      className="rounded"
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        onActivate(rect);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          onActivate(rect);
        }
      }}
    />
  );
}

interface SlotHitZoneProps {
  card: TrafficCard;
  slotRect: { x: number; y: number; w: number; h: number };
  onActivate: (rect: DOMRect) => void;
}

function SlotHitZone({ card, slotRect, onActivate }: SlotHitZoneProps) {
  return (
    <div
      aria-label={`View ${card.name} details`}
      role="button"
      tabIndex={0}
      style={{
        position: 'absolute',
        left: slotRect.x,
        top: slotRect.y,
        width: slotRect.w,
        height: slotRect.h,
        cursor: 'pointer',
        zIndex: 2,
      }}
      className="rounded"
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        onActivate(rect);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          onActivate(rect);
        }
      }}
    />
  );
}

interface TicketHitZoneProps {
  card: EventCard;
  ticketRect: { x: number; y: number; w: number; h: number };
  onActivate: (rect: DOMRect) => void;
}

function TicketHitZone({ card, ticketRect, onActivate }: TicketHitZoneProps) {
  return (
    <div
      aria-label={`View ${card.name} details`}
      role="button"
      tabIndex={0}
      style={{
        position: 'absolute',
        left: ticketRect.x,
        top: ticketRect.y,
        width: ticketRect.w,
        height: ticketRect.h,
        cursor: 'pointer',
        zIndex: 2,
      }}
      className="rounded"
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        onActivate(rect);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          onActivate(rect);
        }
      }}
    />
  );
}

// ── Root component ────────────────────────────────────────────────────────────

interface FlyoutState {
  card: BoardCard;
  rect: DOMRect;
  fromDiscard?: 'traffic' | 'event' | 'action';
}

export interface BoardCardOverlayProps {
  context: GameContext;
  containerRef: React.RefObject<HTMLDivElement>;
  /** Suppresses all hit zones while a card is being dragged. */
  activeCard?: ActionCard | null;
}

export function BoardCardOverlay({ context, containerRef, activeCard }: BoardCardOverlayProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [flyoutState, setFlyoutState] = useState<FlyoutState | null>(null);
  const timeSlots = useMemo(() => getFilledTimeSlots(context), [context]);
  const tracks = useMemo(() => getTracks(context), [context]);
  const trafficDiscard = useMemo(() => getTrafficDiscard(context), [context]);
  const eventDiscard = useMemo(() => getEventDiscard(context), [context]);
  const actionDiscard = useMemo(() => getActionDiscard(context), [context]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // Dismiss flyout if the card disappears (e.g. round resolved)
  useEffect(() => {
    if (flyoutState === null) return;
    const { card, fromDiscard } = flyoutState;
    if (fromDiscard !== undefined) {
      // Discard-pile flyout: dismiss when the top card changes.
      const discardMap = {
        traffic: trafficDiscard,
        event: eventDiscard,
        action: actionDiscard,
      } as const;
      const top = discardMap[fromDiscard].at(-1);
      if (top?.id !== card.id) setFlyoutState(null);
      return;
    }
    if (card.type === CardType.Traffic) {
      const stillPresent = timeSlots.some((s) =>
        s.card?.id === card.id,
      );
      if (!stillPresent) setFlyoutState(null);
    } else {
      const stillPresent = tracks.some((t) =>
        t.tickets.some((c) => c.id === card.id),
      );
      if (!stillPresent) setFlyoutState(null);
    }
  }, [timeSlots, tracks, trafficDiscard, eventDiscard, actionDiscard, flyoutState]);

  if (containerWidth === 0) return null;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: activeCard != null ? 'none' : 'auto',
          zIndex: 5,
        }}
      >
        {/* Slot hit zones — one per occupied time slot */}
        {timeSlots
          .filter((slot) => slot.card !== null)
          .map((slot) => {
            const topCard = slot.card;
            if (topCard === null) return null;
            const periodIndex = PERIOD_ORDER.indexOf(slot.period);
            const periodSlotCount = timeSlots.filter(
              (s) => s.period === slot.period,
            ).length;
            const rect = computeSlotRect(
              periodIndex,
              slot.index,
              containerWidth,
              periodSlotCount,
            );
            return (
              <SlotHitZone
                key={`slot-hit-${slot.period}-${slot.index}`}
                card={topCard}
                slotRect={rect}
                onActivate={(domRect) => setFlyoutState({ card: topCard, rect: domRect })}
              />
            );
          })}

        {/* Discard pile hit zones — one per non-empty discard pile */}
        {([
          { deckType: 'traffic' as const, top: trafficDiscard.at(-1), deckIndex: 0, label: 'Traffic' },
          { deckType: 'event'   as const, top: eventDiscard.at(-1),   deckIndex: 1, label: 'Event'   },
          { deckType: 'action'  as const, top: actionDiscard.at(-1),  deckIndex: 2, label: 'Action'  },
        ]).flatMap(({ deckType, top, deckIndex, label }) => {
          if (top == null) return [];
          const pileRect = computeDeckPileRect(deckIndex, 'discard', containerWidth);
          return [
            <DiscardPileHitZone
              key={`discard-hit-${deckType}`}
              card={top}
              pileRect={pileRect}
              label={label}
              onActivate={(domRect) =>
                setFlyoutState({ card: top, rect: domRect, fromDiscard: deckType })
              }
            />,
          ];
        })}

        {/* Ticket hit zones — one per event ticket in tracks */}
        {tracks.flatMap((track, ti) =>
          track.tickets.map((ticket, ki) => {
            const ticketRect = computeTicketRect(ti, ki, containerWidth);
            return (
              <TicketHitZone
                key={`ticket-hit-${track.track}-${ticket.id}`}
                card={ticket}
                ticketRect={ticketRect}
                onActivate={(domRect) => setFlyoutState({ card: ticket, rect: domRect })}
              />
            );
          }),
        )}
      </div>

      {/* Flyout portal — rendered outside the overlay div */}
      {flyoutState !== null && (
        <BoardCardFlyout
          card={flyoutState.card}
          sourceRect={flyoutState.rect}
          onDismiss={() => setFlyoutState(null)}
        />
      )}
    </>
  );
}
