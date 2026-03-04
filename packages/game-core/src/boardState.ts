import {
  PERIOD_SLOT_COUNTS,
  SLOT_BASE_CAPACITY,
  Period,
  Track,
  type TimeSlot,
  type TrackSlot,
  type VendorSlot,
} from './types.js';

/** Create the initial set of time slots for all four periods */
export function createInitialTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (const period of Object.values(Period)) {
    const count = PERIOD_SLOT_COUNTS[period];
    for (let i = 0; i < count; i++) {
      slots.push({
        period,
        index: i,
        baseCapacity: SLOT_BASE_CAPACITY,
        cards: [],
        capacityBoost: 0,
        unavailable: false,
      });
    }
  }
  return slots;
}

/** Create the initial track rows */
export function createInitialTracks(): TrackSlot[] {
  return Object.values(Track).map((track) => ({ track, tickets: [] }));
}

/** Create the 4 vendor placeholder slots */
export function createVendorSlots(): VendorSlot[] {
  return [0, 1, 2, 3].map((index) => ({ index, card: null }));
}

/**
 * Get all slots for a given period, filtering out unavailable slots.
 */
export function getAvailableSlots(slots: TimeSlot[], period: Period): TimeSlot[] {
  return slots.filter((s) => s.period === period && !s.unavailable);
}

/**
 * Get the effective capacity of a slot (base + any boost from Action cards).
 */
export function effectiveCapacity(slot: TimeSlot): number {
  return slot.baseCapacity + slot.capacityBoost;
}

/**
 * Reset per-round transient state on all time slots (capacity boosts, clear cards).
 */
export function resetSlotsForRound(slots: TimeSlot[]): TimeSlot[] {
  return slots.map((s) => ({
    ...s,
    cards: [],
    capacityBoost: 0,
    unavailable: false,
  }));
}
