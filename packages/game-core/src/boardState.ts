import {
  PERIOD_SLOT_COUNTS,
  Period,
  SlotType,
  type GameContext,
  type TimeSlotLayout,
  type VendorSlot,
} from './types.js';

/** Create the initial slot layout for all four periods (16 normal slots, no cards). */
export function createInitialSlotLayout(): TimeSlotLayout[] {
  const slots: TimeSlotLayout[] = [];
  for (const period of Object.values(Period)) {
    const count = PERIOD_SLOT_COUNTS[period];
    for (let i = 0; i < count; i++) {
      slots.push({ period, index: i, slotType: SlotType.Normal });
    }
  }
  return slots;
}

/** Create the 4 vendor placeholder slots */
export function createVendorSlots(): VendorSlot[] {
  return [0, 1, 2, 3].map((index) => ({ index, card: null }));
}

/**
 * Get all slot layouts for a given period.
 */
export function getAvailableSlotLayouts(layout: TimeSlotLayout[], period: Period): TimeSlotLayout[] {
  return layout.filter((s) => s.period === period);
}

/**
 * Reset per-round transient state on slot layout.
 * Temporary slots (added by BoostSlotCapacity) are removed.
 * Migration guard: 'weeklyTemporary' slots from saves predating the permanent-
 * slots rework are also removed here to prevent phantom slot accumulation.
 * Overloaded slots are swept separately during resolution, not here.
 */
export function resetSlotLayout(layout: TimeSlotLayout[]): TimeSlotLayout[] {
  return layout.filter(
    (s) => s.slotType !== SlotType.Temporary && s.slotType !== ('weeklyTemporary' as SlotType),
  );
}

/**
 * After a traffic card at (period, removedSlotIndex) has been removed (its actor
 * is already in inDiscard), compact the remaining cards in that period by shifting
 * every card at slotIndex > removedSlotIndex down by one index.
 *
 * Each shifted card's actor receives a SHIFT_SLOT event so its position context
 * stays authoritative.  The card's new slotType is read from the destination slot
 * in the layout — this is how an overloaded card "graduates" to a normal slot when
 * it shifts into a previously-normal position.
 *
 * After the shift, the slot with the highest index in the period has become vacant.
 * If that slot is Overloaded it is pruned from the layout (exactly one overload
 * entry disappears per removal, even when multiple overload cards are present).
 * Normal and Temporary slots are kept — they represent permanent capacity.
 */
export function shiftTrafficSlotsAfterRemoval(
  ctx: GameContext,
  period: Period,
  removedSlotIndex: number,
): GameContext {
  // Collect every actor still on a slot in this period above the removed index.
  const toShift: Array<{ id: string; slotIndex: number }> = [];
  for (const [id, actor] of Object.entries(ctx.trafficCardActors)) {
    if (!actor) continue;
    const snap = actor.getSnapshot();
    if (snap.value !== 'onSlot') continue;
    const c = snap.context;
    if (c.period !== period) continue;
    if (c.slotIndex === undefined || c.slotIndex <= removedSlotIndex) continue;
    toShift.push({ id, slotIndex: c.slotIndex });
  }

  // The slot that becomes vacant after all cards have shifted: the highest
  // index that had a card above the removal point (its card moved to index−1).
  // When nothing shifted, the removed slot itself is now vacant.
  const highestShiftedIndex =
    toShift.length > 0 ? Math.max(...toShift.map((x) => x.slotIndex)) : removedSlotIndex;

  // Send each actor its new position.  The destination slot type is looked up
  // from the current layout so overloaded→normal promotion happens automatically.
  for (const { id, slotIndex } of toShift) {
    const actor = ctx.trafficCardActors[id];
    if (!actor) continue;
    const newSlotIndex = slotIndex - 1;
    const destinationSlot = ctx.slotLayout.find(
      (s) => s.period === period && s.index === newSlotIndex,
    );
    const newSlotType = destinationSlot?.slotType ?? SlotType.Normal;
    actor.send({ type: 'SHIFT_SLOT', slotIndex: newSlotIndex, slotType: newSlotType });
  }

  // Prune the vacated slot if it is Overloaded; Normal/Temporary slots are kept.
  const vacatedSlot = ctx.slotLayout.find(
    (s) => s.period === period && s.index === highestShiftedIndex,
  );
  if (vacatedSlot?.slotType !== SlotType.Overloaded) {
    return ctx;
  }

  return {
    ...ctx,
    slotLayout: ctx.slotLayout.filter(
      (s) => !(s.period === period && s.index === highestShiftedIndex),
    ),
  };
}
