import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { createInitialContext, gameMachine } from '../machine.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import { Period, PERIOD_SLOT_COUNTS, SLOT_BASE_CAPACITY, type TimeSlot, type TrafficCard } from '../types.js';

const dcExpansion = ACTION_CARDS.find((c) => c.id === 'action-datacenter-expansion')!;

/** Traffic-only deck — no events — so rounds complete without surprise game-overs. */
function safeContext() {
  const trafficDeck: TrafficCard[] = Array.from({ length: 56 }, (_, i) =>
    TRAFFIC_CARDS[i % TRAFFIC_CARDS.length]!,
  );
  return {
    ...createInitialContext(),
    trafficDeck,
    trafficDiscard: [] as TrafficCard[],
    eventDeck: [],
    eventDiscard: [],
    spawnedTrafficQueue: [] as TrafficCard[],
  };
}

function makeWeeklySlot(period: Period, index: number): TimeSlot {
  return {
    period,
    index,
    baseCapacity: SLOT_BASE_CAPACITY,
    cards: [],
    weeklyTemporary: true,
  };
}

describe('integration: Data Center Expansion persists until Monday', () => {
  it('playing DC Expansion creates weeklyTemporary (not temporary) slots', () => {
    // Start on round 3 (Wed) with DC Expansion in hand. Play it targeting Evening.
    // New slots must have weeklyTemporary: true, not temporary: true.
    const base = safeContext();
    const actor = createActor(gameMachine, {
      input: { ...base, round: 3, hand: [dcExpansion] },
    });
    actor.start();

    expect(actor.getSnapshot().value).toBe('scheduling');
    const beforeCount = actor.getSnapshot().context.timeSlots.filter(
      (s) => s.period === Period.Evening,
    ).length;

    actor.send({ type: 'PLAY_ACTION', card: dcExpansion, targetPeriod: Period.Evening });

    const eveningSlots = actor.getSnapshot().context.timeSlots.filter(
      (s) => s.period === Period.Evening,
    );
    expect(eveningSlots).toHaveLength(beforeCount + 2);
    expect(eveningSlots.filter((s) => s.weeklyTemporary)).toHaveLength(2);
    expect(eveningSlots.filter((s) => s.temporary)).toHaveLength(0);
  });

  it('weeklyTemporary slots survive a non-Monday performDraw', () => {
    // Inject weeklyTemporary slots into the starting context at round 4 (Thu).
    // performDraw runs on actor.start(); slots must not be stripped on a non-Monday.
    const base = safeContext();
    const extraSlots = [
      makeWeeklySlot(Period.Evening, 4),
      makeWeeklySlot(Period.Evening, 5),
    ];
    const actor = createActor(gameMachine, {
      input: { ...base, round: 4, timeSlots: [...base.timeSlots, ...extraSlots] },
    });
    actor.start();

    expect(actor.getSnapshot().value).toBe('scheduling');
    expect(actor.getSnapshot().context.round).toBe(4);

    const eveningSlots = actor.getSnapshot().context.timeSlots.filter(
      (s) => s.period === Period.Evening,
    );
    // Original 4 + 2 injected weekly slots must all survive
    expect(eveningSlots).toHaveLength(PERIOD_SLOT_COUNTS[Period.Evening] + 2);
    expect(eveningSlots.filter((s) => s.weeklyTemporary)).toHaveLength(2);
  });

  it('weeklyTemporary slots are stripped by a Monday performDraw', () => {
    // Inject weeklyTemporary slots into the starting context at round 8 (Mon).
    // performDraw runs on actor.start(); Monday cleanup must strip them.
    const base = safeContext();
    const extraSlots = [
      makeWeeklySlot(Period.Afternoon, 4),
      makeWeeklySlot(Period.Afternoon, 5),
    ];
    const actor = createActor(gameMachine, {
      input: { ...base, round: 8, timeSlots: [...base.timeSlots, ...extraSlots] },
    });
    actor.start();

    expect(actor.getSnapshot().value).toBe('scheduling');
    expect(actor.getSnapshot().context.round).toBe(8);

    const afternoonSlots = actor.getSnapshot().context.timeSlots.filter(
      (s) => s.period === Period.Afternoon,
    );
    // All weeklyTemporary slots must be gone; only base permanent slots remain
    expect(afternoonSlots).toHaveLength(PERIOD_SLOT_COUNTS[Period.Afternoon]);
    expect(afternoonSlots.every((s) => !s.weeklyTemporary)).toBe(true);
  });

  it('weeklyTemporary slots survive round 7 (Sun) but are stripped at round 8 (Mon)', () => {
    // Round 7 (Sun) is a weekend — performDraw runs but must NOT strip weeklyTemporary.
    const base7 = safeContext();
    const extra7 = [makeWeeklySlot(Period.Overnight, 4)];
    const actor7 = createActor(gameMachine, {
      input: { ...base7, round: 7, timeSlots: [...base7.timeSlots, ...extra7] },
    });
    actor7.start();

    expect(actor7.getSnapshot().context.round).toBe(7);
    // Round 7 is weekend → crisis phase (skips scheduling)
    const overnightSlots7 = actor7.getSnapshot().context.timeSlots.filter(
      (s) => s.period === Period.Overnight,
    );
    expect(overnightSlots7.some((s) => s.weeklyTemporary)).toBe(true);

    // Round 8 (Mon) — same slot injected, must be stripped
    const base8 = safeContext();
    const extra8 = [makeWeeklySlot(Period.Overnight, 4)];
    const actor8 = createActor(gameMachine, {
      input: { ...base8, round: 8, timeSlots: [...base8.timeSlots, ...extra8] },
    });
    actor8.start();

    expect(actor8.getSnapshot().context.round).toBe(8);
    const overnightSlots8 = actor8.getSnapshot().context.timeSlots.filter(
      (s) => s.period === Period.Overnight,
    );
    expect(overnightSlots8).toHaveLength(PERIOD_SLOT_COUNTS[Period.Overnight]);
    expect(overnightSlots8.every((s) => !s.weeklyTemporary)).toBe(true);
  });
});
