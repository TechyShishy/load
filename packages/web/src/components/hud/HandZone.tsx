import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import type { ActionCard } from '@load/game-core';
import { computeFlyoutPosition } from '../flyoutPosition.js';

/**
 * Single-line text that auto-shrinks its font size to fit the container width.
 * Maximum is 10pt (≈ 13.33px); minimum is 6px.
 */
function FitText({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset to max before measuring
    el.style.fontSize = '13.33px';
    // Step down by 0.5px until it fits or we hit the floor
    while (el.scrollWidth > el.offsetWidth && parseFloat(el.style.fontSize) > 6) {
      el.style.fontSize = `${(parseFloat(el.style.fontSize) - 0.5).toFixed(2)}px`;
    }
  }, [children]);
  return (
    <span
      ref={ref}
      className={className}
      style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden' }}
    >
      {children}
    </span>
  );
}

/**
 * Multi-line text that auto-shrinks its font size to fit the container height.
 * Maximum is 11px; minimum is 6px. The wrapping div takes flex-1 so it fills
 * whatever height the parent flex layout allocates.
 */
function FitTextBlock({ children, className }: { children: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;
    text.style.fontSize = '11px';
    while (text.scrollHeight > container.offsetHeight && parseFloat(text.style.fontSize) > 4) {
      text.style.fontSize = `${(parseFloat(text.style.fontSize) - 0.5).toFixed(2)}px`;
    }
  }, [children]);
  return (
    <div ref={containerRef} className="flex-1 min-h-0 w-full">
      <span ref={textRef} className={className} style={{ display: 'block' }}>
        {children}
      </span>
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

  const flyoutWidth = 180;
  const flyoutHeight = 240;
  const pos = computeFlyoutPosition(sourceRect, flyoutWidth, flyoutHeight);

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
        style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999, width: flyoutWidth, height: flyoutHeight, touchAction: 'none', opacity: isDragging ? 0 : 1 }}
        className="flex flex-col border border-cyan-400 rounded bg-purple-950 shadow-2xl shadow-cyan-900/60 cursor-grab"
      >
        <div className="flex items-center justify-between px-1.5 pt-1 border-b border-purple-700/30">
          <FitText className="font-bold text-purple-300 leading-tight flex-1 min-w-0">{card.name}</FitText>
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
        <img
          src={`./cards/${card.templateId}.svg`}
          alt=""
          aria-hidden="true"
          className="w-full object-cover bg-purple-900/40"
          style={{ height: '112px', imageRendering: 'pixelated' }}
        />
        <div className="flex flex-col flex-1 items-stretch p-2 min-h-0">
          <FitTextBlock className="text-gray-300 leading-snug">{card.description}</FitTextBlock>
          <span className="text-yellow-400 font-mono flex-shrink-0" style={{ fontSize: '11px' }}>
            ${card.cost.toLocaleString()}
          </span>
        </div>
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
        flex flex-col w-[90px] h-[120px] flex-shrink-0
        border rounded text-left select-none overflow-hidden
        ${dragging
          ? 'border-cyan-400 bg-purple-900 shadow-xl shadow-cyan-900/60 cursor-grabbing'
          : 'border-purple-600 bg-purple-950'
        }
      `}
    >
      <FitText className="font-bold text-purple-300 px-1 pt-0.5 border-b border-purple-700/30">{card.name}</FitText>
      <img
        src={`./cards/${card.templateId}.svg`}
        alt=""
        aria-hidden="true"
        className="w-full h-[56px] object-cover bg-purple-900/40"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="flex flex-col flex-1 items-start p-1 min-h-0">
        <FitTextBlock className="text-gray-400 leading-tight">{card.description}</FitTextBlock>
        <span className="text-yellow-400 font-mono flex-shrink-0" style={{ fontSize: '5px' }}>${card.cost.toLocaleString()}</span>
      </div>
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

  // TODO-0009: Keyboard expand — pressing Enter/Space on a focused ActionCardView should open the
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
        flex flex-col w-[90px] h-[120px] flex-shrink-0
        border rounded text-left select-none overflow-hidden
        ${disabled
          ? 'border-gray-700 bg-gray-900 opacity-40 cursor-not-allowed'
          : isExpanded && !isDragging
            ? 'border-cyan-400 bg-purple-900 cursor-grab'
            : 'border-purple-600 bg-purple-950 hover:border-purple-400 hover:bg-purple-900 cursor-grab'
        }
      `}
    >
      <FitText className="font-bold text-purple-300 px-1 pt-0.5 border-b border-purple-700/30">{card.name}</FitText>
      <img
        src={`./cards/${card.templateId}.svg`}
        alt=""
        aria-hidden="true"
        className="w-full h-[56px] object-cover bg-purple-900/40"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="flex flex-col flex-1 items-start p-1 min-h-0">
        <FitTextBlock className="text-gray-400 leading-tight">{card.description}</FitTextBlock>
        <span className="text-yellow-400 font-mono flex-shrink-0" style={{ fontSize: '5px' }}>${card.cost.toLocaleString()}</span>
      </div>
    </div>
  );
}
