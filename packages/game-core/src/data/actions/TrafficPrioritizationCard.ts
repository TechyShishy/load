import { ActionCard, Period, type GameContext } from '../../types.js';
import { shiftTrafficSlotsAfterRemoval } from '../../boardState.js';

export class TrafficPrioritizationCard extends ActionCard {
  readonly templateId = 'action-traffic-prioritization';
  readonly name = 'Traffic Prioritization';
  readonly cost = 0;
  readonly description = 'Remove 1 Traffic card from the board, collecting its revenue.';
  override readonly flavorText = 'If everything is priority one, nothing is.';
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
    if (!targetTrafficCardId) return context;

    const pos = context.trafficSlotPositions[targetTrafficCardId];
    if (!pos) return context;

    const { period: actorPeriod, slotIndex } = pos;
    const removedCard = context.cardInstances[targetTrafficCardId];
    if (!removedCard) return context;

    // Remove card from the position map.
    const newTrafficSlotPositions = { ...context.trafficSlotPositions };
    delete newTrafficSlotPositions[targetTrafficCardId];
    context = { ...context, trafficSlotPositions: newTrafficSlotPositions };

    // Shift subsequent cards in the period up to fill the gap; removes the
    // vacated overload slot from the layout if one exists.
    context = shiftTrafficSlotsAfterRemoval(context, actorPeriod, slotIndex);

    // Spawned cards disappear on discard rather than cycling back through the deck.
    const isSpawned = context.spawnedTrafficIds.includes(targetTrafficCardId);
    context = {
      ...context,
      trafficDiscardOrder: isSpawned
        ? context.trafficDiscardOrder
        : [...context.trafficDiscardOrder, targetTrafficCardId],
    };

    // Call onPickUp hook (e.g. ViralTrafficSpike spawns a copy).
    if ('onPickUp' in removedCard && typeof (removedCard as { onPickUp?: unknown }).onPickUp === 'function') {
      context = (removedCard as { onPickUp: (ctx: GameContext, period: Period) => GameContext }).onPickUp(
        context,
        actorPeriod,
      );
    }

    const revenue = (removedCard as { revenue?: number }).revenue ?? 0;
    if (revenue > 0) {
      const boostedRevenue = Math.round(revenue * context.revenueBoostMultiplier);
      context = {
        ...context,
        budget: context.budget + boostedRevenue,
        pendingRevenue: context.pendingRevenue + boostedRevenue,
      };
    }

    return context;
  }
}
