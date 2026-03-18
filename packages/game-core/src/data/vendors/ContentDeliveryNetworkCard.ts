import { VendorCard, CardType, SlotType, Period, type GameContext, type LedgerEntry, type TrafficCard } from '../../types.js';
import { shiftTrafficSlotsAfterRemoval } from '../../boardState.js';

export class ContentDeliveryNetworkCard extends VendorCard {
  readonly templateId = 'vendor-content-delivery-network';
  readonly id: string;
  readonly name = 'Content Delivery Network';
  readonly cost = 55_000;
  readonly description =
    'Each round at resolution, automatically clears the highest-revenue traffic card from the most congested period, earning 75% of its revenue.';
  override readonly flavorText =
    'The SLA promises four nines uptime. The asterisk promises something else entirely.';

  constructor(instanceId = 'vendor-content-delivery-network') {
    super();
    this.id = instanceId;
  }

  onResolve(ctx: GameContext): GameContext {
    // Count non-overloaded traffic cards per period (overloaded cards are already
    // swept by resolveRound before onResolve is called).
    const periodCards: Partial<Record<Period, string[]>> = {};
    for (const [id, pos] of Object.entries(ctx.trafficSlotPositions)) {
      if (pos.slotType === SlotType.Overloaded) continue;
      if (!periodCards[pos.period]) periodCards[pos.period] = [];
      periodCards[pos.period]!.push(id);
    }

    // Most congested period — ties go to the first period encountered in iteration order.
    let mostCongestedPeriod: Period | undefined;
    let maxCount = 0;
    for (const [period, ids] of Object.entries(periodCards) as [Period, string[]][]) {
      if (ids.length > maxCount) {
        maxCount = ids.length;
        mostCongestedPeriod = period;
      }
    }

    if (!mostCongestedPeriod) return ctx; // board is empty

    // Highest-revenue card in that period.
    const candidateIds = periodCards[mostCongestedPeriod]!;
    let bestId: string | undefined;
    let bestRevenue = -1;
    for (const id of candidateIds) {
      const card = ctx.cardInstances[id];
      if (!card || card.type !== CardType.Traffic) continue;
      const rev = (card as TrafficCard).revenue;
      if (rev > bestRevenue) {
        bestRevenue = rev;
        bestId = id;
      }
    }

    if (!bestId) return ctx;

    const pos = ctx.trafficSlotPositions[bestId]!;
    const card = ctx.cardInstances[bestId] as TrafficCard;
    const cardName = card.name;

    // Remove from the position map and compact the period so slot indices stay
    // contiguous — same pattern as TrafficPrioritizationCard.apply().
    const newPositions = { ...ctx.trafficSlotPositions };
    delete newPositions[bestId];
    let next: GameContext = { ...ctx, trafficSlotPositions: newPositions };
    next = shiftTrafficSlotsAfterRemoval(next, pos.period, pos.slotIndex);

    // Spawned cards disappear on discard; deck-origin cards cycle back.
    const isSpawned = ctx.spawnedTrafficIds.includes(bestId);
    next = {
      ...next,
      trafficDiscardOrder: isSpawned
        ? next.trafficDiscardOrder
        : [...next.trafficDiscardOrder, bestId],
    };

    // 75% of base revenue × the current multiplier (stacks with ADC).
    const earned = Math.round(bestRevenue * 0.75 * ctx.revenueBoostMultiplier);
    return {
      ...next,
      budget: next.budget + earned,
      pendingLedger: [
        ...next.pendingLedger,
        { kind: 'vendor-revenue', amount: earned, label: cardName } satisfies LedgerEntry,
      ],
    };
  }
}
