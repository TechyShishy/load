import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine } from '../machine.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { Period, PhaseId, SlotType } from '../types.js';
import { safeContext, ctxWithHandCardsFixedIds } from './testHelpers.js';

const dcExpansion = ACTION_CARDS.find((c) => c.templateId === 'action-datacenter-expansion')!;

describe('integration: Data Center Expansion adds permanent slots', () => {
  it('playing DC Expansion creates Normal (permanent) slots, not weeklyTemporary', () => {
    // Start on round 3 (Wed) with DC Expansion in hand. Play it targeting Evening.
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
    expect(eveningSlots.every((s) => s.slotType === SlotType.Normal)).toBe(true);
  });
});
