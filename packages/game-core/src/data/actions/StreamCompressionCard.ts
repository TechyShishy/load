import { ActionCard, type GameContext, type Period } from '../../types.js';

export class StreamCompressionCard extends ActionCard {
  readonly templateId = 'action-stream-compression';
  readonly name = 'Stream Compression';
  readonly cost = 15_000;
  readonly description =
    'Remove up to 2 instances of the first duplicated Traffic type in a period, collecting their revenue. If no duplicates exist, removes 1 Traffic card instead.';
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

    const allCardsInPeriod = context.timeSlots
      .filter((s) => s.period === targetPeriod)
      .flatMap((s) => s.card ? [s.card] : []);

    if (allCardsInPeriod.length === 0) return context;

    // Count occurrences of each templateId in the period
    const counts = new Map<string, number>();
    for (const card of allCardsInPeriod) {
      counts.set(card.templateId, (counts.get(card.templateId) ?? 0) + 1);
    }

    // Find first templateId with a duplicate, in the order cards appear
    let typeToRemove: string | undefined;
    let removeCount = 1;
    for (const card of allCardsInPeriod) {
      const count = counts.get(card.templateId) ?? 0;
      if (count >= 2) {
        typeToRemove = card.templateId;
        removeCount = Math.min(count, 2);
        break;
      }
    }

    // Fallback: no duplicates — remove 1 of the first type
    if (typeToRemove === undefined) {
      typeToRemove = allCardsInPeriod[0]!.templateId;
      removeCount = 1;
    }

    let collectedRevenue = 0;
    let removedCount = 0;
    const removedCards: (typeof context.trafficDiscard) = [];

    context = {
      ...context,
      timeSlots: context.timeSlots.map((slot) => {
        if (slot.period !== targetPeriod || removedCount >= removeCount) return slot;
        if (slot.card && slot.card.templateId === typeToRemove && removedCount < removeCount) {
          collectedRevenue += slot.card.revenue;
          removedCards.push(slot.card);
          removedCount++;
          return { ...slot, card: null };
        }
        return slot;
      }),
    };

    if (removedCards.length > 0) {
      context = { ...context, trafficDiscard: [...context.trafficDiscard, ...removedCards] };
      for (const removed of removedCards) {
        if (removed.onPickUp) {
          context = removed.onPickUp(context, targetPeriod);
        }
      }
    }

    if (collectedRevenue > 0) {
      context = {
        ...context,
        budget: context.budget + collectedRevenue,
        pendingRevenue: context.pendingRevenue + collectedRevenue,
      };
    }

    // Remove any overload slots in the period that are now empty (traffic card was cleared).
    context = {
      ...context,
      timeSlots: context.timeSlots.filter(
        (s) => !(s.period === targetPeriod && s.overloaded === true && s.card === null),
      ),
    };

    return context;
  }
}
