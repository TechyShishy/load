import { describe, expect, it } from 'vitest';
import {
  createInitialSlotLayout,
  createVendorSlots,
  getAvailableSlotLayouts,
  resetSlotLayout,
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

});

