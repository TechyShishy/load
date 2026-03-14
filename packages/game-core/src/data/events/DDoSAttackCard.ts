import { EventCard, Period, SlotType, type GameContext } from '../../types.js';
import { DDoSTrafficCard } from '../traffic/DDoSTrafficCard.js';
import { getCardIdAtSlot } from '../../cardPositionViews.js';

export class DDoSAttackCard extends EventCard {
  readonly templateId = 'event-ddos-attack';
  readonly name = 'DDoS Attack';
  readonly label = 'TRAFFIC SPIKE';
  readonly description =
    'A volumetric attack floods your edge nodes — one malicious traffic card drops into every period. Each can be cleared for $1,500, but ties up slots that legitimate traffic could fill.';

  constructor(public readonly id: string = 'event-ddos-attack') {
    super();
  }

  onCrisis(ctx: GameContext, mitigated: boolean): GameContext {
    if (mitigated) return ctx;

    const periods = [Period.Morning, Period.Afternoon, Period.Evening, Period.Overnight] as const;
    const newCardInstances = { ...ctx.cardInstances };
    const newTrafficSlotPositions = { ...ctx.trafficSlotPositions };
    let newSlotLayout = [...ctx.slotLayout];
    const newIds: string[] = [];

    for (const period of periods) {
      const card = new DDoSTrafficCard(crypto.randomUUID());

      // Find the first free non-overloaded slot in this period.
      // Pass the growing newTrafficSlotPositions so already-placed DDoS cards in
      // earlier periods are visible and not double-counted as free.
      const freeSlot = newSlotLayout.find(
        (s) =>
          s.period === period &&
          s.slotType !== SlotType.Overloaded &&
          getCardIdAtSlot({ ...ctx, trafficSlotPositions: newTrafficSlotPositions }, s.period, s.index) === undefined,
      );

      if (freeSlot) {
        newTrafficSlotPositions[card.id] = { period: freeSlot.period, slotIndex: freeSlot.index, slotType: freeSlot.slotType };
      } else {
        // Period is full — create an overload slot.
        const overloadIndex = newSlotLayout.filter((s) => s.period === period).length;
        newSlotLayout = [...newSlotLayout, { period, index: overloadIndex, slotType: SlotType.Overloaded }];
        newTrafficSlotPositions[card.id] = { period, slotIndex: overloadIndex, slotType: SlotType.Overloaded };
      }

      newCardInstances[card.id] = card;
      newIds.push(card.id);
    }

    // Register placed IDs so performResolution passes them as spawnedIds to
    // resolveRound — gives player one scheduling turn to clear overloaded DDoS cards.
    // Contrast with ViralTrafficSpikeCard overflows, which are NOT registered and
    // therefore swept in the same resolution as an SLA failure.
    const newSpawnedQueueOrder = [...ctx.spawnedQueueOrder, ...newIds];
    // Track all spawned IDs permanently so they are never recycled into the discard pile.
    const newSpawnedTrafficIds = [...ctx.spawnedTrafficIds, ...newIds];

    return {
      ...ctx,
      cardInstances: newCardInstances,
      trafficSlotPositions: newTrafficSlotPositions,
      slotLayout: newSlotLayout,
      spawnedQueueOrder: newSpawnedQueueOrder,
      spawnedTrafficIds: newSpawnedTrafficIds,
    };
  }
}
