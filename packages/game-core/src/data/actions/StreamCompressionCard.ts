import { ActionCard, Period, type GameContext } from '../../types.js';
import { getFilledTimeSlots } from '../../cardPositionViews.js';
import { shiftTrafficSlotsAfterRemoval } from '../../boardState.js';

export class StreamCompressionCard extends ActionCard {
  readonly templateId = 'action-stream-compression';
  readonly name = 'Stream Compression';
  readonly cost = 5_000;
  readonly description =
    'Remove up to 3 instances of the most-duplicated Traffic type in a period, collecting their revenue. If no duplicates exist, removes 1 Traffic card instead.';
  readonly allowedOnWeekend = false;
  readonly validDropZones = ['period'] as const;
  override readonly invalidZoneFeedback = 'Drop on a period column to compress traffic.';
  override readonly periodZoneVariant = 'remove' as const;

  constructor(public readonly id: string = 'action-stream-compression') {
    super();
  }

  apply(
    _ctx: GameContext,
    commit: () => GameContext,
    _targetEventId?: string,
    _targetTrafficCardId?: string,
    targetPeriod?: Period,
  ): GameContext {
    let context = commit();
    if (!targetPeriod) return context;

    const filledSlots = getFilledTimeSlots(context);
    const allCardsInPeriod = filledSlots
      .filter((s) => s.period === targetPeriod)
      .flatMap((s) => (s.card ? [s.card] : []));

    if (allCardsInPeriod.length === 0) return context;

    const counts = new Map<string, number>();
    for (const card of allCardsInPeriod) {
      counts.set(card.templateId, (counts.get(card.templateId) ?? 0) + 1);
    }

    let typeToRemove: string | undefined;
    let removeCount = 1;
    let maxCount = 0;
    for (const [templateId, count] of counts) {
      if (count >= 2 && count > maxCount) {
        maxCount = count;
        typeToRemove = templateId;
        removeCount = Math.min(count, 3);
      }
    }
    if (typeToRemove === undefined) {
      typeToRemove = allCardsInPeriod[0]!.templateId;
      removeCount = 1;
    }

    let removedCount = 0;
    let collectedRevenue = 0;
    let slotLayout = context.slotLayout;
    let trafficDiscardOrder = context.trafficDiscardOrder;
    let trafficSlotPositions = context.trafficSlotPositions;

    // Iterate a snapshot of the original position keys to find matching cards.
    // IMPORTANT: read the *live* slotIndex from trafficSlotPositions on each
    // iteration — prior shiftTrafficSlotsAfterRemoval calls update indices in the
    // live map, so using pos.slotIndex from the snapshot would pass a stale
    // removedSlotIndex for the second and later removals.
    const positionEntries = Object.entries(trafficSlotPositions);
    for (const [id, pos] of positionEntries) {
      if (removedCount >= removeCount) break;
      if (pos.period !== targetPeriod) continue;
      const card = context.cardInstances[id];
      if (!card || (card as { templateId: string }).templateId !== typeToRemove) continue;

      // Resolve the current (possibly shifted) slot index before removing.
      const currentPos = trafficSlotPositions[id];
      if (!currentPos) continue;
      const currentSlotIndex = currentPos.slotIndex;

      // Remove card from the position map.
      const newPositions = { ...trafficSlotPositions };
      delete newPositions[id];
      trafficSlotPositions = newPositions;

      // Shift subsequent cards and clean up any vacated overload slot.
      const shifted = shiftTrafficSlotsAfterRemoval(
        { ...context, slotLayout, trafficSlotPositions },
        targetPeriod,
        currentSlotIndex,
      );
      slotLayout = shifted.slotLayout;
      trafficSlotPositions = shifted.trafficSlotPositions;
      // Spawned cards disappear on discard rather than cycling back through the deck.
      if (!context.spawnedTrafficIds.includes(id)) {
        trafficDiscardOrder = [...trafficDiscardOrder, id];
      }
      collectedRevenue += (card as { revenue?: number }).revenue ?? 0;

      // onPickUp hook.
      if ('onPickUp' in card && typeof (card as { onPickUp?: unknown }).onPickUp === 'function') {
        context = (card as { onPickUp: (ctx: GameContext, period: Period) => GameContext }).onPickUp(
          { ...context, slotLayout, trafficDiscardOrder, trafficSlotPositions },
          targetPeriod,
        );
        slotLayout = context.slotLayout;
        trafficDiscardOrder = context.trafficDiscardOrder;
        trafficSlotPositions = context.trafficSlotPositions;
      }

      removedCount++;
    }

    context = { ...context, slotLayout, trafficDiscardOrder, trafficSlotPositions };

    if (collectedRevenue > 0) {
      const boostedRevenue = Math.round(collectedRevenue * context.revenueBoostMultiplier);
      context = {
        ...context,
        budget: context.budget + boostedRevenue,
        pendingRevenue: context.pendingRevenue + boostedRevenue,
      };
    }

    return context;
  }
}
