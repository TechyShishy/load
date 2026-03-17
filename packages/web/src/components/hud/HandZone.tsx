import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import type { ActionCard } from '@load/game-core';
import { computeFlyoutPosition } from '../flyoutPosition.js';
import { FitText, FitTextBlock } from '../FitText.js';

// ── Canonical card dimensions ─────────────────────────────────────────────────
// All card surfaces (hand, flyout, deck-builder) render through ActionCardFace
// at these dimensions. Scaled views apply a CSS transform on the outside.
export const CARD_W = 180;
export const CARD_H = 240;
// Image height preserving the 160×100 SVG canvas aspect ratio at CARD_W.
export const CARD_IMG_H = Math.round(CARD_W * (100 / 160)); // 112

/**
 * Canonical card face. Always rendered at CARD_W × CARD_H.
 * Does not include a border — callers provide their own frame.
 *
 * `className`        — additional Tailwind classes. Must include a `bg-*` value.
 * `titleSlot`        — optional element rendered in the right side of the title bar
 *                     (e.g. a close button). FitText shrinks to accommodate it.
 * `maxTitleFontSize` — max font size passed to FitText. Default 13.33 (≈ 10pt).
 *                     When the card is inside a CSS scale-0.5 wrapper, pass 27
 *                     so the visual size is still ~13 px after downscale.
 */
export function ActionCardFace({
  card,
  className = '',
  titleSlot,
  maxTitleFontSize = 13.33,
}: {
  card: ActionCard;
  className?: string;
  titleSlot?: React.ReactNode;
  maxTitleFontSize?: number;
}) {
  return (
    <div
      className={`flex flex-col ${className}`}
      style={{ width: CARD_W, height: CARD_H }}
    >
      <div className="flex items-center justify-between px-1.5 pt-1 border-b border-purple-700/30">
        <FitText className="font-bold text-purple-300 leading-tight flex-1 min-w-0" maxFontSize={maxTitleFontSize}>{card.name}</FitText>
        {titleSlot}
      </div>
      <img
        src={`./cards/${card.templateId}.svg`}
        alt=""
        aria-hidden="true"
        className="w-full object-cover bg-purple-900/40"
        style={{ height: CARD_IMG_H, imageRendering: 'pixelated' }}
      />
      <div className="flex flex-col flex-1 items-stretch p-2 min-h-0">
        <FitTextBlock maxFontSize={22} className="text-gray-300 leading-snug">{card.description}</FitTextBlock>
        {card.flavorText && (
          <em className="text-gray-500 leading-snug flex-shrink-0" style={{ fontSize: '9px', display: 'block' }}>
            {card.flavorText}
          </em>
        )}
        <span
          className="text-green-400 font-mono flex-shrink-0 border border-green-400/40 rounded px-1 self-start"
          style={{ fontSize: '9px' }}
        >
          Cost: ${card.cost.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

interface ExpandedState {
  dragId: string;
  card: ActionCard;
  rect: DOMRect;
}

function ExpandedCardFlyout({
  card,
  dragId,
  disabled,
  sourceRect,
  onDismiss,
}: {
  card: ActionCard;
  dragId: string;
  disabled: boolean;
  sourceRect: DOMRect;
  onDismiss: () => void;
}) {
  const { isDragging, setNodeRef, listeners } = useDraggable({
    id: `${dragId}-flyout`,
    data: { card },
    disabled,
  });

  // Stay mounted while dragging so DnD kit keeps the draggable registered throughout the
  // operation. Dismiss after the drag ends (isDragging flips back to false).
  const dragStartedRef = useRef(false);
  const selfRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    selfRef.current?.focus();
  }, []);
  useEffect(() => {
    if (isDragging) {
      dragStartedRef.current = true;
    } else if (dragStartedRef.current) {
      dragStartedRef.current = false;
      onDismiss();
    }
  }, [isDragging, onDismiss]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  const pos = computeFlyoutPosition(sourceRect, CARD_W, CARD_H);

  return createPortal(
    <>
      {/* Transparent backdrop — click outside to dismiss */}
      <div
        data-testid="card-flyout-backdrop"
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={onDismiss}
      />
      {/* Expanded card flyout — stays mounted during drag so useDraggable stays registered */}
      <div
        ref={(el: HTMLDivElement | null) => { setNodeRef(el); selfRef.current = el; }}
        role="dialog"
        aria-modal="true"
        aria-label={`${card.name} details`}
        tabIndex={-1}
        {...listeners}
        style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999, touchAction: 'none', opacity: isDragging ? 0 : 1 }}
        className="rounded overflow-hidden border border-cyan-400 shadow-2xl shadow-cyan-900/60 cursor-grab"
      >
        <ActionCardFace
          card={card}
          className="bg-purple-950"
          titleSlot={
            <button
              onClick={onDismiss}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Close card details"
              className="text-gray-400 hover:text-white leading-none ml-1 flex-shrink-0 cursor-pointer"
              style={{ fontSize: '14px' }}
            >
              ×
            </button>
          }
        />
      </div>
    </>,
    document.body,
  );
}

interface HandZoneProps {
  hand: ActionCard[];
  disabled?: boolean;
  isCardDisabled?: (card: ActionCard) => boolean;
  /** Card IDs currently mid-animation — suppressed from rendering until arrival. */
  suppressedCardIds?: ReadonlySet<string>;
}

export function HandZone({ hand, disabled = false, isCardDisabled, suppressedCardIds }: HandZoneProps) {
  const visibleHand = suppressedCardIds ? hand.filter((c) => !suppressedCardIds.has(c.id)) : hand;
  const [expandedState, setExpandedState] = useState<ExpandedState | null>(null);

  // Auto-dismiss when the expanded card is no longer in the visible hand (e.g. it was played)
  useEffect(() => {
    if (expandedState !== null && !visibleHand.some((c) => c.id === expandedState.card.id)) {
      setExpandedState(null);
    }
  }, [visibleHand, expandedState]);

  return (
    <>
      <div
        role="group"
        aria-label="Hand"
        aria-live="polite"
        className="flex items-center gap-2 overflow-x-auto py-2 px-4 min-h-[130px]"
      >
        {visibleHand.length === 0 && (
          <span className="text-gray-600 text-sm italic">No cards in hand</span>
        )}
        {visibleHand.map((card, i) => {
          const dragId = `${card.id}-${i}`;
          return (
            <ActionCardView
              key={dragId}
              dragId={dragId}
              card={card}
              disabled={disabled || (isCardDisabled?.(card) ?? false)}
              isExpanded={expandedState?.dragId === dragId}
              onActivate={(rect) => setExpandedState({ dragId, card, rect })}
              onDeactivate={() => setExpandedState(null)}
            />
          );
        })}
      </div>
      {expandedState !== null && (
        <ExpandedCardFlyout
          card={expandedState.card}
          dragId={expandedState.dragId}
          disabled={disabled}
          sourceRect={expandedState.rect}
          onDismiss={() => setExpandedState(null)}
        />
      )}
    </>
  );
}

/**
 * Pure visual representation of an action card — no DnD logic.
 * Used by HandZone internally and by the DragOverlay in App.
 */
export function ActionCardPreview({ card, dragging = false }: { card: ActionCard; dragging?: boolean }) {
  return (
    <div
      className={`
        w-[90px] h-[120px] flex-shrink-0 rounded overflow-hidden transform-gpu
        border select-none
        ${dragging
          ? 'border-cyan-400 shadow-xl shadow-cyan-900/60'
          : 'border-purple-600'
        }
      `}
    >
      <ActionCardFace
        card={card}
        className={`scale-50 origin-top-left ${dragging ? 'bg-purple-900' : 'bg-purple-950'}`}
        maxTitleFontSize={27}
      />
    </div>
  );
}

interface ActionCardViewProps {
  card: ActionCard;
  dragId: string;
  disabled: boolean;
  isExpanded: boolean;
  onActivate: (rect: DOMRect) => void;
  onDeactivate: () => void;
}

function ActionCardView({ card, dragId, disabled, isExpanded, onActivate, onDeactivate }: ActionCardViewProps) {
  const { isDragging, setNodeRef, listeners, attributes } = useDraggable({
    id: dragId,
    data: { card },
    disabled,
  });

  // Combine DnD kit's setNodeRef with our own ref so we can call getBoundingClientRect()
  const cardRef = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  // Collapse the flyout when this card starts being dragged
  useEffect(() => {
    if (isDragging && isExpanded) {
      onDeactivate();
    }
  }, [isDragging, isExpanded, onDeactivate]);

  // TODO-0009 (#34): Keyboard expand — pressing Enter/Space on a focused ActionCardView should open the
  // ExpandedCardFlyout (DnD kit already spreads role="button" tabIndex={0}; add onKeyDown alongside onClick)
  // Allow flyout even when disabled (e.g. crisisOnly cards during scheduling) — drag is
  // separately blocked by passing disabled to useDraggable.
  const handleClick = useCallback(() => {
    if (isExpanded) {
      onDeactivate();
    } else if (cardRef.current) {
      onActivate(cardRef.current.getBoundingClientRect());
    }
  }, [isExpanded, onActivate, onDeactivate]);

  const style: React.CSSProperties = {
    // Hide the source element entirely while dragging — DragOverlay in App
    // renders the visible preview above the PixiJS canvas instead.
    opacity: isDragging ? 0 : 1,
    touchAction: 'none',
  };

  return (
    <div
      ref={setRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      aria-label={`${card.name} – Cost $${card.cost.toLocaleString()} – ${card.description}`}
      aria-disabled={disabled}
      className={`
        w-[90px] h-[120px] flex-shrink-0 rounded overflow-hidden transform-gpu
        border select-none
        ${disabled
          ? 'border-gray-700 opacity-40 cursor-not-allowed'
          : isExpanded && !isDragging
            ? 'border-cyan-400 cursor-grab'
            : 'border-purple-600 hover:border-purple-400 cursor-grab group'
        }
      `}
    >
      <ActionCardFace
        card={card}
        className={`scale-50 origin-top-left ${
          disabled
            ? 'bg-gray-900'
            : isExpanded && !isDragging
              ? 'bg-purple-900'
              : 'bg-purple-950 group-hover:bg-purple-900'
        }`}
        maxTitleFontSize={27}
      />
    </div>
  );
}
