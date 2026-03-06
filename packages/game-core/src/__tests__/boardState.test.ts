import { describe, expect, it } from 'vitest';
import {
  createInitialTimeSlots,
  createInitialTracks,
  createVendorSlots,
  getAvailableSlots,
  resetSlotsForRound,
  stripWeeklyTemporarySlots,
} from '../boardState.js';
import { Period, SLOT_BASE_CAPACITY, Track } from '../types.js';

describe('createInitialTimeSlots', () => {
  it('creates 16 total slots (4+4+4+4)', () => {
    expect(createInitialTimeSlots()).toHaveLength(16);
  });

  it('all slots start with empty cards array', () => {
    const slots = createInitialTimeSlots();
    expect(slots.every((s) => s.cards.length === 0)).toBe(true);
  });

  it('all slots start with base capacity 1', () => {
    const slots = createInitialTimeSlots();
    expect(slots.every((s) => s.baseCapacity === SLOT_BASE_CAPACITY)).toBe(true);
  });

  it('overnight period has 4 slots', () => {
    const slots = createInitialTimeSlots();
    expect(slots.filter((s) => s.period === Period.Overnight)).toHaveLength(4);
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
  it('preserves cards on permanent slots during round reset', () => {
    const slots = createInitialTimeSlots();
    // Manually add a fake card object reference
    const withCards = slots.map((s, i) =>
      i === 0 ? { ...s, cards: [{ id: 'fake' } as never] } : s,
    );
    const reset = resetSlotsForRound(withCards);
    expect(reset[0]!.cards).toHaveLength(1);
    expect(reset[0]!.cards[0]).toEqual({ id: 'fake' });
    // Other slots remain empty
    expect(reset.slice(1).every((s) => s.cards.length === 0)).toBe(true);
  });

  it('strips temporary slots on reset', () => {
    const base = createInitialTimeSlots();
    const withTemporary = [
      ...base,
      { ...base[0]!, index: base.length, temporary: true as const },
    ];
    const reset = resetSlotsForRound(withTemporary);
    expect(reset.every((s) => !s.temporary)).toBe(true);
    expect(reset.length).toBe(base.length);
  });

  it('marks all slots available', () => {
    const slots = createInitialTimeSlots().map((s) => ({ ...s, unavailable: true }));
    const reset = resetSlotsForRound(slots);
    expect(reset.every((s) => !s.unavailable)).toBe(true);
  });
});

describe('stripWeeklyTemporarySlots', () => {
  it('removes slots with weeklyTemporary: true', () => {
    const base = createInitialTimeSlots();
    const withWeekly = [
      ...base,
      { ...base[0]!, index: base.length, weeklyTemporary: true as const },
    ];
    const result = stripWeeklyTemporarySlots(withWeekly);
    expect(result).toHaveLength(base.length);
    expect(result.every((s) => !s.weeklyTemporary)).toBe(true);
  });

  it('does not remove temporary (BoostSlotCapacity) slots', () => {
    const base = createInitialTimeSlots();
    const withTemporary = [
      ...base,
      { ...base[0]!, index: base.length, temporary: true as const },
    ];
    const result = stripWeeklyTemporarySlots(withTemporary);
    expect(result).toHaveLength(base.length + 1);
  });

  it('does not remove permanent slots', () => {
    const base = createInitialTimeSlots();
    const result = stripWeeklyTemporarySlots(base);
    expect(result).toHaveLength(base.length);
  });
});
