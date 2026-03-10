import {
  PERIOD_SLOT_COUNTS,
  Period,
  SlotType,
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


