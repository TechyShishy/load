import { ActionCard, Period, SlotType, type GameContext } from '../../types.js';

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
    if (!targetTrafficCardId) return context;

    const targetActor = context.trafficCardActors[targetTrafficCardId];
    if (!targetActor) return context;
    const snap = targetActor.getSnapshot();
    if (snap.value !== 'onSlot') return context;

    const { period: actorPeriod, slotIndex, slotType } =
      snap.context;
    const removedCard = context.cardInstances[targetTrafficCardId];
    if (!removedCard || actorPeriod === undefined) return context;

    // Transition actor: onSlot → inDiscard.
    targetActor.send({ type: 'REMOVE' });

    // Remove the overload slot from layout if that's what it was.
    let slotLayout = context.slotLayout;
    if (slotType === SlotType.Overloaded) {
      slotLayout = slotLayout.filter(
        (s) => !(s.period === actorPeriod && s.index === slotIndex),
      );
    }

    // Spawned cards disappear on discard rather than cycling back through the deck.
    const isSpawned = context.spawnedTrafficIds.includes(targetTrafficCardId);
    context = {
      ...context,
      slotLayout,
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
