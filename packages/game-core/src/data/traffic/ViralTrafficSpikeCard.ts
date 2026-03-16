import { Period, SlotType, TrafficCard, type GameContext } from '../../types.js';
import { getCardIdAtSlot } from '../../cardPositionViews.js';

export class ViralTrafficSpikeCard extends TrafficCard {
  readonly templateId = 'traffic-viral-spike';
  readonly name = 'Viral Traffic Spike';
  readonly revenue = 6_000;
  readonly description =
    'A sudden viral moment floods CDN nodes. Clearing it early only propagates the spike — a copy immediately appears in the next period.';
  override readonly flavorText = "You just HAD TO clear it. Now look what you've done.";
  // Viral content spreads during active daytime; Sunday morning is the exception (wholesome viral).
  override readonly weekTable = [
    Period.Afternoon, // Mon
    Period.Evening,   // Tue
    Period.Afternoon, // Wed
    Period.Evening,   // Thu
    Period.Afternoon, // Fri
    Period.Afternoon, // Sat — peak scroll time
    Period.Morning,   // Sun — wholesome early viral
  ] as const;

  constructor(public readonly id: string = 'traffic-viral-spike') {
    super();
  }

  override onPickUp(ctx: GameContext, sourcePeriod: Period): GameContext {
    if (sourcePeriod === Period.Overnight) return ctx;
    const copy = new ViralTrafficSpikeCard(crypto.randomUUID());
    const periodOrder = [Period.Morning, Period.Afternoon, Period.Evening, Period.Overnight];
    const nextPeriod = periodOrder[periodOrder.indexOf(sourcePeriod) + 1] ?? Period.Overnight;

    // Place the copy in the next period (the period after sourcePeriod).
    // This direct placement bypasses computeTrafficPlacements — the "next period"
    // override takes precedence over the card's weekTable.
    // If a free slot exists the copy lands normally. If the next period is full,
    // an overload slot is created. The copy is NOT registered in spawnedQueueOrder
    // (unlike DDoS), so an overloaded copy will be swept in the same resolution
    // as an SLA failure unless the player clears it first. However, it IS
    // registered in spawnedTrafficIds, so when swept it does NOT recycle into
    // trafficDiscardOrder — it simply disappears from the game.
    const newTrafficSlotPositions = { ...ctx.trafficSlotPositions };
    const freeSlot = ctx.slotLayout.find((s) => {
      if (s.period !== nextPeriod || s.slotType === SlotType.Overloaded) return false;
      return getCardIdAtSlot({ ...ctx, trafficSlotPositions: newTrafficSlotPositions }, s.period, s.index) === undefined;
    });

    const newCardInstances = { ...ctx.cardInstances, [copy.id]: copy };
    // Track the copy permanently so it is never recycled into the discard pile.
    const newSpawnedTrafficIds = [...ctx.spawnedTrafficIds, copy.id];

    if (freeSlot) {
      newTrafficSlotPositions[copy.id] = { period: freeSlot.period, slotIndex: freeSlot.index, slotType: freeSlot.slotType };
      return {
        ...ctx,
        cardInstances: newCardInstances,
        trafficSlotPositions: newTrafficSlotPositions,
        spawnedTrafficIds: newSpawnedTrafficIds,
      };
    }

    // No free slot — create an overload slot and place directly so the player
    // can see and potentially address it during scheduling.
    const overloadIndex = ctx.slotLayout.filter((s) => s.period === nextPeriod).length;
    newTrafficSlotPositions[copy.id] = { period: nextPeriod, slotIndex: overloadIndex, slotType: SlotType.Overloaded };
    return {
      ...ctx,
      cardInstances: newCardInstances,
      trafficSlotPositions: newTrafficSlotPositions,
      spawnedTrafficIds: newSpawnedTrafficIds,
      slotLayout: [
        ...ctx.slotLayout,
        { period: nextPeriod, index: overloadIndex, slotType: SlotType.Overloaded },
      ],
    };
  }
}
