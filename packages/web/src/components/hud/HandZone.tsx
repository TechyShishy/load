import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ActionCard } from '@load/game-core';

interface HandZoneProps {
  hand: ActionCard[];
  disabled?: boolean;
  isCardDisabled?: (card: ActionCard) => boolean;
}

export function HandZone({ hand, disabled = false, isCardDisabled }: HandZoneProps) {
  return (
    <div
      role="group"
      aria-label="Hand"
      aria-live="polite"
      className="flex items-center gap-2 overflow-x-auto py-2 px-4 min-h-[80px]"
    >
      {hand.length === 0 && (
        <span className="text-gray-600 text-sm italic">No cards in hand</span>
      )}
      {hand.map((card, i) => (
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
        flex flex-col items-start gap-1 p-2 min-w-[120px] max-w-[140px]
        border rounded text-left select-none
        ${dragging
          ? 'border-cyan-400 bg-purple-900 shadow-xl shadow-cyan-900/60 cursor-grabbing'
          : 'border-purple-600 bg-purple-950'
        }
      `}
    >
      <span className="text-xs font-bold text-purple-300 leading-tight">{card.name}</span>
      <span className="text-xs text-yellow-400 font-mono">${card.cost.toLocaleString()}</span>
      <span className="text-xs text-gray-400 leading-tight line-clamp-2">{card.description}</span>
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
        flex flex-col items-start gap-1 p-2 min-w-[120px] max-w-[140px]
        border rounded text-left select-none
        ${disabled
          ? 'border-gray-700 bg-gray-900 opacity-40 cursor-not-allowed'
          : 'border-purple-600 bg-purple-950 hover:border-purple-400 hover:bg-purple-900 cursor-grab'
        }
      `}
    >
      <span className="text-xs font-bold text-purple-300 leading-tight">{card.name}</span>
      <span className="text-xs text-yellow-400 font-mono">${card.cost.toLocaleString()}</span>
      <span className="text-xs text-gray-400 leading-tight line-clamp-2">{card.description}</span>
    </div>
  );
}
