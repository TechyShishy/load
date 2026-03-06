import React from 'react';
import FocusTrap from 'focus-trap-react';
import type { ActionCard, EventCard } from '@load/game-core';

interface EventModalProps {
  event: EventCard;
  hand: ActionCard[];
  onMitigate: (card: ActionCard) => void;
  onAdvance: () => void;
}

export function EventModal({ event, hand, onMitigate, onAdvance }: EventModalProps) {
  const mitigateCards = hand.filter(
    (c) => c.templateId === 'action-security-patch',
  );

  return (
    <FocusTrap focusTrapOptions={{ initialFocus: '#event-modal-advance-btn' }}>
      <div
        className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/90"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
      >
        <div className="border border-red-700 bg-gray-950 rounded-lg p-6 max-w-sm w-full shadow-2xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-900 border border-red-700 text-red-300 uppercase tracking-widest">
              {event.label}
            </span>
          </div>
          <h2
            id="event-modal-title"
            className="text-red-400 text-xl font-bold font-mono mb-1"
          >
            {event.name}
          </h2>
          <p className="text-gray-400 text-sm mb-4">{event.description}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono mb-4">
          </dl>
          {mitigateCards.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-mono text-gray-500 mb-2 uppercase tracking-widest">
                Mitigate with:
              </div>
              <div className="flex flex-col gap-2">
                {mitigateCards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => onMitigate(card)}
                    className="text-left px-3 py-2 rounded border border-purple-700 bg-purple-900/40 hover:bg-purple-800/60 transition-colors"
                  >
                    <span className="text-purple-300 font-mono font-bold text-sm">
                      {card.name}
                    </span>
                    <span className="text-gray-400 text-xs ml-2">
                      -${card.cost.toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            id="event-modal-advance-btn"
            onClick={onAdvance}
            className="w-full px-4 py-2 rounded font-mono font-bold text-sm bg-cyan-600 hover:bg-cyan-500 text-black transition-colors active:scale-95"
          >
            ADVANCE →
          </button>
        </div>
      </div>
    </FocusTrap>
  );
}
