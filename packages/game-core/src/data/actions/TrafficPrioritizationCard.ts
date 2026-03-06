import { ActionCard, type GameContext } from '../../types.js';

export class TrafficPrioritizationCard extends ActionCard {
  readonly templateId = 'action-traffic-prioritization';
  readonly name = 'Traffic Prioritization';
  readonly cost = 10_000;
  readonly description = 'Remove 1 Traffic card from the board, collecting its revenue.';
  readonly allowedOnWeekend = false;
  readonly validDropZones = ['occupied-slot'] as const;
  override readonly invalidZoneFeedback = 'Drop on an occupied slot to remove a traffic card.';

  constructor(public readonly id: string = 'action-traffic-prioritization') {
    super();
  }

  apply(
    _ctx: GameContext,
    commit: () => GameContext,
    _targetEventId?: string,
    targetTrafficCardId?: string,
  ): GameContext {
    let context = commit();
    if (targetTrafficCardId) {
      let collectedRevenue = 0;
      let removedCard: (typeof context.trafficDiscard)[number] | undefined;
      context = {
        ...context,
        timeSlots: context.timeSlots
          .map((slot) => {
            const cardToRemove = slot.cards.find((c) => c.id === targetTrafficCardId);
            if (cardToRemove) {
              collectedRevenue += cardToRemove.revenue;
              removedCard = cardToRemove;
              return { ...slot, cards: slot.cards.filter((c) => c.id !== targetTrafficCardId) };
            }
            return slot;
          })
          // If the traffic card was the last card in an overload slot, remove that slot entirely.
          .filter((slot) => !(slot.overloaded === true && slot.cards.length === 0)),
      };
      if (removedCard !== undefined) {
        context = { ...context, trafficDiscard: [...context.trafficDiscard, removedCard] };
      }
      if (collectedRevenue > 0) {
        context = {
          ...context,
          budget: context.budget + collectedRevenue,
          pendingRevenue: context.pendingRevenue + collectedRevenue,
        };
      }
    }
    return context;
  }
}
