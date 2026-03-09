import { describe, expect, it } from 'vitest';
import {
  createInitialSlotLayout,
  createVendorSlots,
  getAvailableSlotLayouts,
  resetSlotLayout,
  stripWeeklyTemporarySlotLayout,
} from '../boardState.js';
import { Period, SlotType } from '../types.js';

describe('createInitialSlotLayout', () => {
  it('creates 16 total slots (4+4+4+4)', () => {
    expect(createInitialSlotLayout()).toHaveLength(16);
  });

  it('all slots start as Normal type', () => {
    const slots = createInitialSlotLayout();
    expect(slots.every((s) => s.slotType === SlotType.Normal)).toBe(true);
  });

  it('overnight period has 4 slots', () => {
    const slots = createInitialSlotLayout();
    expect(slots.filter((s) => s.period === Period.Overnight)).toHaveLength(4);
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

describe('getAvailableSlotLayouts', () => {
  it('returns only slots for the given period', () => {
    const slots = createInitialSlotLayout();
    const morning = getAvailableSlotLayouts(slots, Period.Morning);
    expect(morning.every((s) => s.period === Period.Morning)).toBe(true);
  });
});

describe('resetSlotLayout', () => {
  it('strips Temporary slots on reset', () => {
    const base = createInitialSlotLayout();
    const withTemporary = [
      ...base,
      { period: Period.Morning, index: base.length, slotType: SlotType.Temporary },
    ];
    const reset = resetSlotLayout(withTemporary);
    expect(reset.every((s) => s.slotType !== SlotType.Temporary)).toBe(true);
    expect(reset.length).toBe(base.length);
  });

  it('preserves Normal slots on reset', () => {
    const base = createInitialSlotLayout();
    const reset = resetSlotLayout(base);
    expect(reset).toHaveLength(base.length);
    expect(reset.every((s) => s.slotType === SlotType.Normal)).toBe(true);
  });

  it('preserves WeeklyTemporary slots on non-Monday reset', () => {
    const base = createInitialSlotLayout();
    const withWeekly = [
      ...base,
      { period: Period.Morning, index: base.length, slotType: SlotType.WeeklyTemporary },
    ];
    const reset = resetSlotLayout(withWeekly);
    // WeeklyTemporary is NOT stripped by resetSlotLayout (only by stripWeeklyTemporarySlotLayout)
    expect(reset.some((s) => s.slotType === SlotType.WeeklyTemporary)).toBe(true);
  });
});

describe('stripWeeklyTemporarySlotLayout', () => {
  it('removes WeeklyTemporary slots', () => {
    const base = createInitialSlotLayout();
    const withWeekly = [
      ...base,
      { period: Period.Morning, index: base.length, slotType: SlotType.WeeklyTemporary },
    ];
    const result = stripWeeklyTemporarySlotLayout(withWeekly);
    expect(result).toHaveLength(base.length);
    expect(result.every((s) => s.slotType !== SlotType.WeeklyTemporary)).toBe(true);
  });

  it('does not remove Temporary slots', () => {
    const base = createInitialSlotLayout();
    const withTemporary = [
      ...base,
      { period: Period.Morning, index: base.length, slotType: SlotType.Temporary },
    ];
    const result = stripWeeklyTemporarySlotLayout(withTemporary);
    expect(result).toHaveLength(base.length + 1);
  });

  it('does not remove Normal slots', () => {
    const base = createInitialSlotLayout();
    const result = stripWeeklyTemporarySlotLayout(base);
    expect(result).toHaveLength(base.length);
  });
});

