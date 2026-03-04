/// <reference types="vitest" />
import { describe, expect, it } from 'vitest';
import {
  createInitialTimeSlots,
  createInitialTracks,
  createVendorSlots,
  effectiveCapacity,
  getAvailableSlots,
  resetSlotsForRound,
} from '../boardState.js';
import { Period, SLOT_BASE_CAPACITY, Track } from '../types.js';

describe('createInitialTimeSlots', () => {
  it('creates 20 total slots (4+4+4+8)', () => {
    expect(createInitialTimeSlots()).toHaveLength(20);
  });

  it('all slots start with empty cards array', () => {
    const slots = createInitialTimeSlots();
    expect(slots.every((s) => s.cards.length === 0)).toBe(true);
  });

  it('all slots start with base capacity 3', () => {
    const slots = createInitialTimeSlots();
    expect(slots.every((s) => s.baseCapacity === SLOT_BASE_CAPACITY)).toBe(true);
  });

  it('overnight period has 8 slots', () => {
    const slots = createInitialTimeSlots();
    expect(slots.filter((s) => s.period === Period.Overnight)).toHaveLength(8);
  });
});

describe('createInitialTracks', () => {
  it('creates 3 tracks', () => {
    expect(createInitialTracks()).toHaveLength(3);
  });

  it('contains all three track types', () => {
    const tracks = createInitialTracks();
    expect(tracks.map((t) => t.track).sort()).toEqual(
      [Track.BreakFix, Track.Maintenance, Track.Projects].sort(),
    );
  });
});

describe('createVendorSlots', () => {
  it('creates 4 vendor slots', () => {
    expect(createVendorSlots()).toHaveLength(4);
  });

  it('all vendor slots have null card', () => {
    expect(createVendorSlots().every((s) => s.card === null)).toBe(true);
  });
});

describe('effectiveCapacity', () => {
  it('returns base capacity when no boost', () => {
    const slot = createInitialTimeSlots()[0]!;
    expect(effectiveCapacity(slot)).toBe(SLOT_BASE_CAPACITY);
  });

  it('includes capacity boost', () => {
    const slot = { ...createInitialTimeSlots()[0]!, capacityBoost: 2 };
    expect(effectiveCapacity(slot)).toBe(SLOT_BASE_CAPACITY + 2);
  });
});

describe('getAvailableSlots', () => {
  it('returns only slots for the given period', () => {
    const slots = createInitialTimeSlots();
    const morning = getAvailableSlots(slots, Period.Morning);
    expect(morning.every((s) => s.period === Period.Morning)).toBe(true);
  });

  it('excludes unavailable slots', () => {
    const slots = createInitialTimeSlots().map((s, i) =>
      s.period === Period.Morning && i === 0 ? { ...s, unavailable: true } : s,
    );
    const available = getAvailableSlots(slots, Period.Morning);
    expect(available.every((s) => !s.unavailable)).toBe(true);
  });
});

describe('resetSlotsForRound', () => {
  it('clears cards from all slots', () => {
    const slots = createInitialTimeSlots();
    // Manually add a fake card object reference
    const withCards = slots.map((s, i) =>
      i === 0 ? { ...s, cards: [{ id: 'fake' } as never] } : s,
    );
    const reset = resetSlotsForRound(withCards);
    expect(reset.every((s) => s.cards.length === 0)).toBe(true);
  });

  it('resets capacity boosts', () => {
    const slots = createInitialTimeSlots().map((s) => ({ ...s, capacityBoost: 2 }));
    const reset = resetSlotsForRound(slots);
    expect(reset.every((s) => s.capacityBoost === 0)).toBe(true);
  });

  it('marks all slots available', () => {
    const slots = createInitialTimeSlots().map((s) => ({ ...s, unavailable: true }));
    const reset = resetSlotsForRound(slots);
    expect(reset.every((s) => !s.unavailable)).toBe(true);
  });
});
