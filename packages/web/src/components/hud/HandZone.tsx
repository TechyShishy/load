import React from 'react';
import type { ActionCard } from '@load/game-core';

interface HandZoneProps {
  hand: ActionCard[];
  onPlayCard: (card: ActionCard) => void;
  disabled?: boolean;
}

export function HandZone({ hand, onPlayCard, disabled = false }: HandZoneProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2 px-4 min-h-[80px]">
      {hand.length === 0 && (
        <span className="text-gray-600 text-sm italic">No cards in hand</span>
      )}
      {hand.map((card, i) => (
        <ActionCardView
          key={`${card.id}-${i}`}
          card={card}
          onPlay={() => onPlayCard(card)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

interface ActionCardViewProps {
  card: ActionCard;
  onPlay: () => void;
  disabled: boolean;
}

function ActionCardView({ card, onPlay, disabled }: ActionCardViewProps) {
  return (
    <button
      onClick={onPlay}
      disabled={disabled}
      title={card.description}
      className={`
        flex flex-col items-start gap-1 p-2 min-w-[120px] max-w-[140px]
        border rounded text-left transition-all select-none
        ${disabled
          ? 'border-gray-700 bg-gray-900 opacity-40 cursor-not-allowed'
          : 'border-purple-600 bg-purple-950 hover:border-purple-400 hover:bg-purple-900 cursor-pointer active:scale-95'
        }
      `}
    >
      <span className="text-xs font-bold text-purple-300 leading-tight">{card.name}</span>
      <span className="text-xs text-yellow-400 font-mono">
        ${card.cost.toLocaleString()}
      </span>
      <span className="text-xs text-gray-400 leading-tight line-clamp-2">{card.description}</span>
    </button>
  );
}
