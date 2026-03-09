import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine } from '../machine.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { Period, PhaseId, PERIOD_SLOT_COUNTS, SlotType, type TimeSlotLayout } from '../types.js';
import { safeContext, ctxWithHandCardsFixedIds } from './testHelpers.js';

const dcExpansion = ACTION_CARDS.find((c) => c.templateId === 'action-datacenter-expansion')!;

function makeWeeklySlot(period: Period, index: number): TimeSlotLayout {
  return { period, index, slotType: SlotType.WeeklyTemporary };
}

describe('integration: Data Center Expansion persists until Monday', () => {
  it('playing DC Expansion creates weeklyTemporary (not temporary) slots', () => {
    // Start on round 3 (Wed) with DC Expansion in hand. Play it targeting Evening.
    // New slots must have slotType WeeklyTemporary, not Temporary.
    const ctx = ctxWithHandCardsFixedIds(
      [dcExpansion],
      safeContext('dc-test', { round: 3, activePhase: PhaseId.Scheduling }),
    );
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('scheduling');

    const beforeCount = actor.getSnapshot().context.slotLayout.filter(
      (s) => s.period === Period.Evening,
    ).length;
    actor.send({ type: 'PLAY_ACTION', card: dcExpansion, targetPeriod: Period.Evening });

    const eveningSlots = actor.getSnapshot().context.slotLayout.filter(
      (s) => s.period === Period.Evening,
    );
    expect(eveningSlots).toHaveLength(beforeCount + 2);
    expect(eveningSlots.filter((s) => s.slotType === SlotType.WeeklyTemporary)).toHaveLength(2);
    expect(eveningSlots.filter((s) => s.slotType === SlotType.Temporary)).toHaveLength(0);
  });

  it('weeklyTemporary slots survive a non-Monday performDraw', () => {
    // Inject weeklyTemporary slots into the starting context at round 4 (Thu).
    // performDraw runs on actor.start(); slots must not be stripped on a non-Monday.
    const base = safeContext('dc-survive-test', { round: 4 });
    const extraSlots = [makeWeeklySlot(Period.Evening, 4), makeWeeklySlot(Period.Evening, 5)];
    const ctx = { ...base, trafficDeckOrder: [] as string[], slotLayout: [...base.slotLayout, ...extraSlots] };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → scheduling

    expect(actor.getSnapshot().value).toBe('scheduling');
    expect(actor.getSnapshot().context.round).toBe(4);

    const eveningSlots = actor.getSnapshot().context.slotLayout.filter(
      (s) => s.period === Period.Evening,
    );
    // Original slots + 2 injected weekly slots must all survive
    expect(eveningSlots).toHaveLength(PERIOD_SLOT_COUNTS[Period.Evening] + 2);
    expect(eveningSlots.filter((s) => s.slotType === SlotType.WeeklyTemporary)).toHaveLength(2);
  });

  it('weeklyTemporary slots are stripped by a Monday performDraw', () => {
    // Inject weeklyTemporary slots into the starting context at round 8 (Mon).
    // performDraw runs on actor.start(); Monday cleanup must strip them.
    const base = safeContext('dc-strip-test', { round: 8 });
    const extraSlots = [makeWeeklySlot(Period.Afternoon, 4), makeWeeklySlot(Period.Afternoon, 5)];
    const ctx = { ...base, trafficDeckOrder: [] as string[], slotLayout: [...base.slotLayout, ...extraSlots] };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → scheduling

    expect(actor.getSnapshot().value).toBe('scheduling');
    expect(actor.getSnapshot().context.round).toBe(8);

    const afternoonSlots = actor.getSnapshot().context.slotLayout.filter(
      (s) => s.period === Period.Afternoon,
    );
    // All weeklyTemporary slots must be gone; only base permanent slots remain
    expect(afternoonSlots).toHaveLength(PERIOD_SLOT_COUNTS[Period.Afternoon]);
    expect(afternoonSlots.every((s) => s.slotType !== SlotType.WeeklyTemporary)).toBe(true);
  });

  it('weeklyTemporary slots survive round 7 (Sun) but are stripped at round 8 (Mon)', () => {
    // Round 7 (Sun) — draw entry runs but must NOT strip weeklyTemporary (not Monday).
    const base7 = safeContext('dc-r7-test', { round: 7 });
    const extra7 = [makeWeeklySlot(Period.Overnight, 4)];
    const ctx7 = { ...base7, trafficDeckOrder: [] as string[], slotLayout: [...base7.slotLayout, ...extra7] };
    const actor7 = createActor(gameMachine, { input: ctx7 });
    actor7.start();
    // draw entry action ran (round 7 = Sun → no Monday strip); machine waits for DRAW_COMPLETE.
    expect(actor7.getSnapshot().context.round).toBe(7);
    const overnightSlots7 = actor7.getSnapshot().context.slotLayout.filter(
      (s) => s.period === Period.Overnight,
    );
    expect(overnightSlots7.some((s) => s.slotType === SlotType.WeeklyTemporary)).toBe(true);

    // Round 8 (Mon) — same slot injected, must be stripped by draw entry.
    const base8 = safeContext('dc-r8-test', { round: 8 });
    const extra8 = [makeWeeklySlot(Period.Overnight, 4)];
    const ctx8 = { ...base8, trafficDeckOrder: [] as string[], slotLayout: [...base8.slotLayout, ...extra8] };
    const actor8 = createActor(gameMachine, { input: ctx8 });
    actor8.start();
    // draw entry action ran (round 8 = Mon → strips weeklyTemporary).
    expect(actor8.getSnapshot().context.round).toBe(8);
    const overnightSlots8 = actor8.getSnapshot().context.slotLayout.filter(
      (s) => s.period === Period.Overnight,
    );
    expect(overnightSlots8).toHaveLength(PERIOD_SLOT_COUNTS[Period.Overnight]);
    expect(overnightSlots8.every((s) => s.slotType !== SlotType.WeeklyTemporary)).toBe(true);
  });
});
