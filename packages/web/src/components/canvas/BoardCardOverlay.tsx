import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CardType, Period, getFilledTimeSlots, getTracks, getTrafficDiscard, getEventDiscard, getActionDiscard } from '@load/game-core';
import type { ActionCard, EventCard, GameContext, TrafficCard, VendorCard } from '@load/game-core';
import {
  computeDeckPileRect,
  computeGearSlotRect,
  computeSlotRect,
  computeTicketRect,
  type SlotRect,
} from './canvasLayout.js';
import { computeFlyoutPosition } from '../flyoutPosition.js';
import { FitText, FitTextBlock } from '../FitText.js';

const PERIOD_ORDER: Period[] = [Period.Morning, Period.Afternoon, Period.Evening, Period.Overnight];

// ── Flyout ───────────────────────────────────────────────────────────────────

type BoardCard = TrafficCard | EventCard | ActionCard;

interface FlyoutTheme {
  border: string;       // e.g. "border-cyan-400"
  bg: string;           // e.g. "bg-purple-950"
  shadow: string;       // e.g. "shadow-cyan-900/60"
  headerBorder: string; // e.g. "border-purple-700/30"
  titleText: string;    // e.g. "text-purple-300"
  artBg: string;        // e.g. "bg-purple-900/40"
}

const BOARD_CARD_THEME: FlyoutTheme = {
  border: 'border-cyan-400',
  bg: 'bg-purple-950',
  shadow: 'shadow-cyan-900/60',
  headerBorder: 'border-purple-700/30',
  titleText: 'text-purple-300',
  artBg: 'bg-purple-900/40',
};

const VENDOR_CARD_THEME: FlyoutTheme = {
  border: 'border-amber-400',
  bg: 'bg-amber-950/90',
  shadow: 'shadow-amber-900/60',
  headerBorder: 'border-amber-700/30',
  titleText: 'text-amber-300',
  artBg: 'bg-amber-900/40',
};

interface CardFlyoutProps {
  card: { name: string; templateId: string; description: string; flavorText?: string };
  sourceRect: DOMRect;
  onDismiss: () => void;
  theme: FlyoutTheme;
  backdropTestId: string;
  stat: React.ReactNode;
}

function CardFlyout({ card, sourceRect, onDismiss, theme, backdropTestId, stat }: CardFlyoutProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Content-sized flyout: measure on first layout pass so the clamping math
  // uses the real height rather than an estimate. useLayoutEffect fires
  // synchronously before paint so the user never sees the interim position.
  const [flyoutHeight, setFlyoutHeight] = useState(200);
  useLayoutEffect(() => {
    if (!dialogRef.current) return;
    setFlyoutHeight(dialogRef.current.offsetHeight);
    dialogRef.current.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  const flyoutWidth = 180;
  const pos = computeFlyoutPosition(sourceRect, flyoutWidth, flyoutHeight);

  return createPortal(
    <>
      {/* Transparent backdrop — click outside to dismiss */}
      <div
        data-testid={backdropTestId}
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
          left: pos.left,
          top: pos.top,
          zIndex: 9999,
          width: flyoutWidth,
        }}
        className={`flex flex-col border rounded shadow-2xl ${theme.border} ${theme.bg} ${theme.shadow}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-1.5 pt-1 border-b ${theme.headerBorder}`}>
          <FitText className={`font-bold leading-tight flex-1 min-w-0 ${theme.titleText}`}>
            {card.name}
          </FitText>
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
          className={`w-full object-cover ${theme.artBg}`}
          style={{ height: '112px', imageRendering: 'pixelated' }}
        />

        {/* Body */}
        <div className="flex flex-col items-stretch p-2 gap-1">
          <FitTextBlock className="text-gray-300 leading-snug">{card.description}</FitTextBlock>
          {card.flavorText && (
            <em className="text-gray-500 leading-snug" style={{ fontSize: '9px', display: 'block' }}>{card.flavorText}</em>
          )}
          {stat}
        </div>
      </div>
    </>,
    document.body,
  );
}

function BoardCardFlyout({
  card,
  sourceRect,
  onDismiss,
}: {
  card: BoardCard;
  sourceRect: DOMRect;
  onDismiss: () => void;
}) {
  const isTraffic = card.type === CardType.Traffic;
  const isAction = card.type === CardType.Action;
  const stat = isTraffic ? (
    <div className="flex gap-2 flex-shrink-0" style={{ fontSize: '10px' }}>
      <span className="text-yellow-400 font-mono">
        ${(card as TrafficCard).revenue.toLocaleString()}
      </span>
    </div>
  ) : isAction ? (
    <span
      className="text-green-400 font-mono flex-shrink-0 border border-green-400/40 rounded px-1 self-start"
      style={{ fontSize: '9px' }}
    >
      Cost: ${(card as ActionCard).cost.toLocaleString()}
    </span>
  ) : (
    <span
      className="text-orange-400 font-mono flex-shrink-0 border border-orange-400/40 rounded px-1 self-start"
      style={{ fontSize: '9px' }}
    >
      {(card as EventCard).label}
    </span>
  );

  return (
    <CardFlyout
      card={card}
      sourceRect={sourceRect}
      onDismiss={onDismiss}
      theme={BOARD_CARD_THEME}
      backdropTestId="board-card-flyout-backdrop"
      stat={stat}
    />
  );
}

function VendorGearFlyout({
  card,
  sourceRect,
  onDismiss,
}: {
  card: VendorCard;
  sourceRect: DOMRect;
  onDismiss: () => void;
}) {
  const stat = (
    <span
      className="text-amber-400 font-mono flex-shrink-0 border border-amber-400/40 rounded px-1 self-start"
      style={{ fontSize: '9px' }}
    >
      Cost: ${card.cost.toLocaleString()}
    </span>
  );

  return (
    <CardFlyout
      card={card}
      sourceRect={sourceRect}
      onDismiss={onDismiss}
      theme={VENDOR_CARD_THEME}
      backdropTestId="vendor-card-flyout-backdrop"
      stat={stat}
    />
  );
}

// ── Hit-zone components ───────────────────────────────────────────────────────

interface GearSlotHitZoneProps {
  card: VendorCard;
  slotRect: SlotRect;
  onActivate: (rect: DOMRect) => void;
}

function GearSlotHitZone({ card, slotRect, onActivate }: GearSlotHitZoneProps) {
  return (
    <div
      aria-label={`View ${card.name} gear card details`}
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

interface GearFlyoutState {
  card: VendorCard;
  rect: DOMRect;
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
  const [gearFlyoutState, setGearFlyoutState] = useState<GearFlyoutState | null>(null);
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
          // Render back-to-front so ticket 0's div is last in DOM (on top) and
          // intercepts pointer events in the overlapping region.
          [...track.tickets].reverse().map((ticket, rii) => {
            const ki = track.tickets.length - 1 - rii;
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

        {/* Gear slot hit zones — one per occupied vendor slot */}
        {context.vendorSlots
          .filter((slot) => slot.card !== null)
          .map((slot) => {
            const vendorCard = slot.card!;
            const slotRect = computeGearSlotRect(slot.index, containerWidth);
            return (
              <GearSlotHitZone
                key={`gear-hit-${slot.index}`}
                card={vendorCard}
                slotRect={slotRect}
                onActivate={(domRect) => setGearFlyoutState({ card: vendorCard, rect: domRect })}
              />
            );
          })}
      </div>

      {/* Flyout portal — rendered outside the overlay div */}
      {flyoutState !== null && (
        <BoardCardFlyout
          card={flyoutState.card}
          sourceRect={flyoutState.rect}
          onDismiss={() => setFlyoutState(null)}
        />
      )}
      {gearFlyoutState !== null && (
        <VendorGearFlyout
          card={gearFlyoutState.card}
          sourceRect={gearFlyoutState.rect}
          onDismiss={() => setGearFlyoutState(null)}
        />
      )}
    </>
  );
}
