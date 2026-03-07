import { ActionCard, Period, type GameContext } from '../../types.js';

export class TrafficPrioritizationCard extends ActionCard {
  readonly templateId = 'action-traffic-prioritization';
  readonly name = 'Traffic Prioritization';
  readonly cost = 0;
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
      let sourcePeriod: Period = Period.Morning;
      context = {
        ...context,
        timeSlots: context.timeSlots
          .map((slot) => {
            if (slot.card?.id === targetTrafficCardId) {
              collectedRevenue += slot.card.revenue;
              removedCard = slot.card;
              sourcePeriod = slot.period;
              return { ...slot, card: null };
            }
            return slot;
          })
          // If the overload slot is now empty, remove it entirely.
          .filter((slot) => !(slot.overloaded === true && slot.card === null)),
      };
      if (removedCard !== undefined) {
        context = { ...context, trafficDiscard: [...context.trafficDiscard, removedCard] };
        if (removedCard.onPickUp) {
          context = removedCard.onPickUp(context, sourcePeriod);
        }
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
