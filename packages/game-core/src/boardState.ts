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
 * Get all slots for a given period.
 */
export function getAvailableSlots(slots: TimeSlot[], period: Period): TimeSlot[] {
  return slots.filter((s) => s.period === period);
}

/**
 * Reset per-round transient state on all time slots.
 * Temporary slots (added by BoostSlotCapacity) are removed entirely;
 * permanent slots have their availability restored and cards preserved (carry-over).
 */
export function resetSlotsForRound(slots: TimeSlot[]): TimeSlot[] {
  return slots.filter((s) => !s.temporary);
}

/**
 * Strip weekly-temporary slots added by AddPeriodSlots (Data Center Expansion).
 * Called at the start of performDraw only on Monday rounds.
 */
export function stripWeeklyTemporarySlots(slots: TimeSlot[]): TimeSlot[] {
  return slots.filter((s) => !s.weeklyTemporary);
}
