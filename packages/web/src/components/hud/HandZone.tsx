import React, { useLayoutEffect, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ActionCard } from '@load/game-core';

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

interface HandZoneProps {
  hand: ActionCard[];
  disabled?: boolean;
  isCardDisabled?: (card: ActionCard) => boolean;
  /** Card IDs currently mid-animation — suppressed from rendering until arrival. */
  suppressedCardIds?: ReadonlySet<string>;
}

export function HandZone({ hand, disabled = false, isCardDisabled, suppressedCardIds }: HandZoneProps) {
  const visibleHand = suppressedCardIds ? hand.filter((c) => !suppressedCardIds.has(c.id)) : hand;
  return (
    <div
      role="group"
      aria-label="Hand"
      aria-live="polite"
      className="flex items-center gap-2 overflow-x-auto py-2 px-4 min-h-[130px]"
    >
      {visibleHand.length === 0 && (
        <span className="text-gray-600 text-sm italic">No cards in hand</span>
      )}
      {visibleHand.map((card, i) => (
        <ActionCardView
          key={`${card.id}-${i}`}
          dragId={`${card.id}-${i}`}
          card={card}
          disabled={disabled || (isCardDisabled?.(card) ?? false)}
        />
      ))}
    </div>
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
        src={`/cards/${card.templateId}.svg`}
        alt=""
        aria-hidden="true"
        className="w-full h-[56px] object-cover bg-purple-900/40"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="flex flex-col flex-1 items-start p-1 min-h-0">
        <span className="text-gray-400 leading-tight line-clamp-3" style={{ fontSize: '5px' }}>{card.description}</span>
        <span className="text-yellow-400 font-mono mt-auto" style={{ fontSize: '5px' }}>${card.cost.toLocaleString()}</span>
      </div>
    </div>
  );
}

interface ActionCardViewProps {
  card: ActionCard;
  dragId: string;
  disabled: boolean;
}

function ActionCardView({ card, dragId, disabled }: ActionCardViewProps) {
  const { isDragging, setNodeRef, listeners, attributes, transform } = useDraggable({
    id: dragId,
    data: { card },
    disabled,
  });

  const style: React.CSSProperties = {
    // Hide the source element entirely while dragging — DragOverlay in App
    // renders the visible preview above the PixiJS canvas instead.
    opacity: isDragging ? 0 : 1,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      aria-label={`${card.name} – Cost $${card.cost.toLocaleString()} – ${card.description}`}
      aria-disabled={disabled}
      className={`
        flex flex-col w-[90px] h-[120px] flex-shrink-0
        border rounded text-left select-none overflow-hidden
        ${disabled
          ? 'border-gray-700 bg-gray-900 opacity-40 cursor-not-allowed'
          : 'border-purple-600 bg-purple-950 hover:border-purple-400 hover:bg-purple-900 cursor-grab'
        }
      `}
    >
      <FitText className="font-bold text-purple-300 px-1 pt-0.5 border-b border-purple-700/30">{card.name}</FitText>
      <img
        src={`/cards/${card.templateId}.svg`}
        alt=""
        aria-hidden="true"
        className="w-full h-[56px] object-cover bg-purple-900/40"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="flex flex-col flex-1 items-start p-1 min-h-0">
        <span className="text-gray-400 leading-tight line-clamp-3" style={{ fontSize: '5px' }}>{card.description}</span>
        <span className="text-yellow-400 font-mono mt-auto" style={{ fontSize: '5px' }}>${card.cost.toLocaleString()}</span>
      </div>
    </div>
  );
}
