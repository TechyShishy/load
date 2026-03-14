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

    // Iterate actors to find matching cards on the board in this period.
    // getSnapshot() is called per-iteration: prior SHIFT_SLOT events (from
    // shiftTrafficSlotsAfterRemoval below) may have updated c.slotIndex, so
    // each iteration sees the card's current position, not a stale snapshot.
    for (const [id, actor] of Object.entries(context.trafficCardActors)) {
      if (!actor) continue;
      if (removedCount >= removeCount) break;
      const snap = actor.getSnapshot();
      if (snap.value !== 'onSlot') continue;
      const c = snap.context;
      if (c.period !== targetPeriod) continue;
      const card = context.cardInstances[id];
      if (!card || (card as { templateId: string }).templateId !== typeToRemove) continue;

      if (c.slotIndex === undefined) continue;

      actor.send({ type: 'REMOVE' });
      // Shift subsequent cards and clean up any vacated overload slot.
      const shifted = shiftTrafficSlotsAfterRemoval(
        { ...context, slotLayout },
        targetPeriod,
        c.slotIndex,
      );
      slotLayout = shifted.slotLayout;
      // Spawned cards disappear on discard rather than cycling back through the deck.
      if (!context.spawnedTrafficIds.includes(id)) {
        trafficDiscardOrder = [...trafficDiscardOrder, id];
      }
      collectedRevenue += (card as { revenue?: number }).revenue ?? 0;

      // onPickUp hook.
      if ('onPickUp' in card && typeof (card as { onPickUp?: unknown }).onPickUp === 'function') {
        context = (card as { onPickUp: (ctx: GameContext, period: Period) => GameContext }).onPickUp(
          { ...context, slotLayout, trafficDiscardOrder },
          targetPeriod,
        );
        slotLayout = context.slotLayout;
        trafficDiscardOrder = context.trafficDiscardOrder;
      }

      removedCount++;
    }

    context = { ...context, slotLayout, trafficDiscardOrder };

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
