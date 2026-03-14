import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine } from '../machine.js';
import { getFilledTimeSlots } from '../cardPositionViews.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import {
  MIN_WEEKDAY_TRAFFIC_DRAW, MAX_WEEKDAY_TRAFFIC_DRAW, MIN_WEEKEND_TRAFFIC_DRAW, MAX_WEEKEND_TRAFFIC_DRAW,
  MAX_SLA_FAILURES, HAND_SIZE, PhaseId, Period, SlotType, Track, type TrafficCard,
} from '../types.js';

import { getDayOfWeek, getDayName, getWeekNumber, isWeekend, isFriday } from '../types.js';
import { WorkOrderCard } from '../data/actions/index.js';
import { AWSOutageCard, DDoSAttackCard, FiveGActivationCard } from '../data/events/index.js';
import { safeContext, ctxWithHandCardsFixedIds, ctxWithCardOnSlot, ctxWithPendingEvents } from './testHelpers.js';

describe('gameMachine initial state', () => {
  it('starts in draw phase', () => {
    const actor = createActor(gameMachine);
    actor.start();
    // Draw entry action fires; machine waits in draw for DRAW_COMPLETE
    expect(actor.getSnapshot().value).toBe('draw');
  });

  it('initialises with budget 500000', () => {
    const actor = createActor(gameMachine);
    actor.start();
    expect(actor.getSnapshot().context.budget).toBe(500_000);
  });

  it('initialises with 7 cards in hand', () => {
    const actor = createActor(gameMachine);
    actor.start();
    expect(actor.getSnapshot().context.handOrder).toHaveLength(HAND_SIZE);
  });

  it('initialises at round 1', () => {
    const actor = createActor(gameMachine);
    actor.start();
    expect(actor.getSnapshot().context.round).toBe(1);
  });
});

describe('gameMachine phase transitions', () => {
  function getToScheduling() {
    const actor = createActor(gameMachine, { input: safeContext() });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');
    return actor;
  }

  it('ADVANCE from scheduling → crisis', () => {
    const actor = getToScheduling();
    actor.send({ type: 'ADVANCE' });
    expect(actor.getSnapshot().value).toBe('crisis');
  });

  it('ADVANCE from crisis → resolution (auto) → end → draw (next round scheduling)', () => {
    const actor = getToScheduling();
    actor.send({ type: 'ADVANCE' }); // → crisis
    actor.send({ type: 'ADVANCE' }); // crisis → resolution → auto → end → draw
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → scheduling
    const snap = actor.getSnapshot();
    expect(snap.value).toBe('scheduling');
    expect(snap.context.round).toBe(2);
  });

  it('resolution state auto-advances — does not wait for ADVANCE', () => {
    const actor = getToScheduling();
    actor.send({ type: 'ADVANCE' }); // → crisis
    actor.send({ type: 'ADVANCE' }); // crisis → resolution → auto → end → draw
    // resolution must NOT pause — machine is now in draw state
    expect(actor.getSnapshot().value).toBe('draw');
  });
});

describe('gameMachine save/restore routing', () => {
  it('routes to scheduling when restored from a scheduling-phase save', () => {
    const actor = createActor(gameMachine, {
      input: { ...safeContext(), activePhase: PhaseId.Scheduling },
    });
    actor.start();
    expect(actor.getSnapshot().value).toBe('scheduling');
  });

  it('does not re-draw traffic when routing to scheduling from a save', () => {
    const actor = createActor(gameMachine, {
      input: safeContext('test-seed', { activePhase: PhaseId.Scheduling }),
    });
    actor.start();
    const filledSlots = getFilledTimeSlots(actor.getSnapshot().context).filter((s) => s.card !== null);
    expect(filledSlots).toHaveLength(0);
  });

  it('routes to crisis when restored from a crisis-phase save', () => {
    const base = ctxWithPendingEvents(
      [new DDoSAttackCard('crisis-restore-id')],
      safeContext('test-seed', { activePhase: PhaseId.Crisis }),
    );
    const actor = createActor(gameMachine, { input: base });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');
  });

  it('does not re-draw events when routing to crisis from a save', () => {
    const base = ctxWithPendingEvents(
      [new DDoSAttackCard('crisis-restore-id')],
      safeContext('test-seed', { activePhase: PhaseId.Crisis }),
    );
    const actor = createActor(gameMachine, { input: base });
    actor.start();
    const { pendingEventsOrder } = actor.getSnapshot().context;
    expect(pendingEventsOrder).toHaveLength(1);
    expect(pendingEventsOrder[0]).toBe('crisis-restore-id');
  });
});

describe('gameMachine win/lose conditions', () => {
  it('reaches gameLost state when SLA >= 3 at start of draw', () => {
    // SLA already maxed — draw phase guard should trigger gameLost on DRAW_COMPLETE
    const ctx = safeContext('test-seed', { slaCount: 3 });
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('gameLost');
  });

  it('reaches gameLost when bankrupt at start of draw', () => {
    const ctx = safeContext('test-seed', { budget: -200_000 });
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('gameLost');
  });

  it('RESET from gameLost returns to draw state', () => {
    const ctx = safeContext('test-seed', { slaCount: 3 });
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → gameLost (slaCount >= MAX)
    expect(actor.getSnapshot().value).toBe('gameLost');
    actor.send({ type: 'RESET' });
    expect(actor.getSnapshot().value).toBe('draw');
  });

  it('reaches gameWon at round 28 with budget in (-100K, 0)', () => {
    // Regression: previously checkWinCondition required budget >= 0, so a net-negative
    // but non-bankrupt end-of-game had no matching guard and looped forever.
    // Round 28 is a Sunday (weekend), so DRAW_COMPLETE transitions directly to crisis.
    const ctx = safeContext('test-seed', { round: 28, budget: -50_000 });
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → crisis (weekend)
    expect(actor.getSnapshot().value).toBe('crisis'); // weekend: draw → crisis
    actor.send({ type: 'ADVANCE' }); // crisis → resolution → always → gameWon
    expect(actor.getSnapshot().value).toBe('gameWon');
  });
});

describe('gameMachine overload slots', () => {
  /** Build a context where all time slots are pre-filled with traffic cards,
   * so every drawn card during the round triggers an overload slot creation. */
  function allFilledContext() {
    const periods = [Period.Morning, Period.Afternoon, Period.Evening, Period.Overnight];
    const base = safeContext('allFilled-seed');
    // Each period has 4 slots; fill all 16 with traffic cards from the deck
    const fills: Array<{ period: Period; slotIndex: number }> = [];
    for (let slotIndex = 0; slotIndex < 4; slotIndex++) {
      for (const period of periods) {
        fills.push({ period, slotIndex });
      }
    }
    let ctx = base;
    const usedIds = new Set<string>();
    for (let i = 0; i < fills.length && i < ctx.trafficDeckOrder.length; i++) {
      const id = ctx.trafficDeckOrder[i]!;
      const card = ctx.cardInstances[id] as TrafficCard;
      ctx = ctxWithCardOnSlot(card, fills[i]!.period, fills[i]!.slotIndex, ctx);
      usedIds.add(id);
    }
    // Remove pre-filled IDs from trafficDeckOrder so performDraw draws DIFFERENT cards.
    // Those new cards hit fully-occupied slots → overload actors in onSlot(Overloaded) state.
    ctx = { ...ctx, trafficDeckOrder: ctx.trafficDeckOrder.filter((id) => !usedIds.has(id)) };
    if (usedIds.size < 16) {
      throw new Error(`allFilledContext: only pre-filled ${usedIds.size}/16 slots — deck is too small`);
    }
    return ctx;
  }

  it('overload slots appear on the board when a period is full', () => {
    const actor = createActor(gameMachine, { input: allFilledContext() });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');
    // All slots pre-filled, so all drawn cards become overload slots
    const overloadSlots = actor.getSnapshot().context.slotLayout.filter((s) => s.slotType === SlotType.Overloaded);
    expect(overloadSlots.length).toBeGreaterThanOrEqual(MIN_WEEKDAY_TRAFFIC_DRAW);
    expect(overloadSlots.length).toBeLessThanOrEqual(MAX_WEEKDAY_TRAFFIC_DRAW);
    // No budget penalty
    expect(actor.getSnapshot().context.budget).toBe(500_000);
  });

  it('overload slots are swept at resolution, incrementing slaCount', () => {
    // Start with slaCount one below the limit so even 1 overload triggers gameLost
    const ctx = { ...allFilledContext(), slaCount: MAX_SLA_FAILURES - 1 };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    const schedulingSnap = actor.getSnapshot();
    expect(schedulingSnap.value).toBe('scheduling');
    const overloadCount = schedulingSnap.context.slotLayout.filter((s) => s.slotType === SlotType.Overloaded).length;
    expect(overloadCount).toBeGreaterThanOrEqual(1);
    actor.send({ type: 'ADVANCE' }); // → crisis
    actor.send({ type: 'ADVANCE' }); // → resolution → auto → end → draw
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → gameLost (slaCount ≥ MAX_SLA_FAILURES)
    const snap = actor.getSnapshot();
    // Resolution sweeps overload slots, slaCount exceeds limit → gameLost
    expect(snap.value).toBe('gameLost');
    const summary = snap.context.lastRoundSummary!;
    expect(summary).not.toBeNull();
    // Each overload slot = 1 SLA failure
    expect(summary.failedCount).toBe(overloadCount);
    // No budget penalty
    expect(snap.context.budget).toBe(500_000);
  });
});

// ─── Traffic Prioritization Revenue ─────────────────────────────────────────

describe('gameMachine Traffic Prioritization revenue', () => {
  it('records removal revenue in lastRoundSummary.budgetDelta', () => {
    const tpCard = ACTION_CARDS.find(
      (c) => c.templateId === 'action-traffic-prioritization',
    )!;
    expect(tpCard).toBeDefined();

    const actor = createActor(gameMachine, { input: ctxWithHandCardsFixedIds([tpCard], safeContext()) });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'ADVANCE' }); // scheduling → crisis
    expect(actor.getSnapshot().value).toBe('crisis');

    const boardCards = getFilledTimeSlots(actor.getSnapshot().context).flatMap((s) => s.card ? [s.card] : []);
    expect(boardCards.length).toBeGreaterThan(0);
    const targetCard = boardCards[0]!;

    // Compute the expected revenue: RemoveTrafficCard removes ALL cards with that id
    // (board may have duplicate ids from the cycling safeContext deck).
    const expectedDelta = boardCards
      .filter((c) => c.id === targetCard.id)
      .reduce((sum, c) => sum + c.revenue, 0);

    actor.send({ type: 'PLAY_ACTION', card: tpCard, targetTrafficCardId: targetCard.id });
    actor.send({ type: 'ADVANCE' }); // crisis → resolution → auto → end → draw
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → scheduling

    const summary = actor.getSnapshot().context.lastRoundSummary!;
    expect(summary.budgetDelta).toBe(expectedDelta);
  });
});

// ─── Calendar Helpers ────────────────────────────────────────────────────────

describe('calendar helpers', () => {
  describe('getDayOfWeek', () => {
    it.each([
      [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7],
      [8, 1], [14, 7], [28, 7],
    ])('round %d → day %d', (round, expected) => {
      expect(getDayOfWeek(round)).toBe(expected);
    });
  });

  describe('getDayName', () => {
    it.each([
      [1, 'Mon'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun'], [8, 'Mon'],
    ])('round %d → %s', (round, expected) => {
      expect(getDayName(round)).toBe(expected);
    });
  });

  describe('getWeekNumber', () => {
    it.each([
      [1, 1], [7, 1], [8, 2], [14, 2], [15, 3], [28, 4],
    ])('round %d → week %d', (round, expected) => {
      expect(getWeekNumber(round)).toBe(expected);
    });
  });

  describe('isWeekend', () => {
    it.each([
      [1, false], [5, false], [6, true], [7, true], [8, false], [13, true], [14, true],
    ])('round %d → %s', (round, expected) => {
      expect(isWeekend(round)).toBe(expected);
    });
  });

  describe('isFriday', () => {
    it.each([
      [1, false], [4, false], [5, true], [6, false], [12, true], [19, true],
    ])('round %d → %s', (round, expected) => {
      expect(isFriday(round)).toBe(expected);
    });
  });
});

// ─── Weekend Mechanics ───────────────────────────────────────────────────────

describe('gameMachine weekend mechanics', () => {
  /** Advance a workday: scheduling → crisis → resolution (auto) → end → draw → next phase */
  function advanceWorkday(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
    actor.send({ type: 'ADVANCE' }); // scheduling → crisis
    actor.send({ type: 'ADVANCE' }); // crisis → resolution → auto → end → draw
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → next phase (scheduling or crisis)
  }

  /** Advance a weekend day: crisis → resolution (auto) → end → draw → next phase */
  function advanceWeekendDay(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
    actor.send({ type: 'ADVANCE' }); // crisis → resolution → auto → end → draw
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → next phase
  }

  it('weekdays go to scheduling, weekends skip to crisis', () => {
    const ctx = safeContext('test-seed', { round: 5 }); // Friday (workday)
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');

    // Advance through Friday
    advanceWorkday(actor);
    // Round 6 = Saturday → should be crisis
    expect(actor.getSnapshot().value).toBe('crisis');
    expect(actor.getSnapshot().context.round).toBe(6);
  });

  it('round 6 (Sat) and 7 (Sun) skip scheduling, round 8 (Mon) returns to scheduling', () => {
    const ctx = safeContext('test-seed', { round: 6 }); // Saturday
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('crisis'); // Sat → crisis

    advanceWeekendDay(actor);
    expect(actor.getSnapshot().value).toBe('crisis'); // Sun → crisis
    expect(actor.getSnapshot().context.round).toBe(7);

    advanceWeekendDay(actor);
    expect(actor.getSnapshot().value).toBe('scheduling'); // Mon → scheduling
    expect(actor.getSnapshot().context.round).toBe(8);
  });

  it('weekday draws 1-6 traffic cards; weekend draws 1-2', () => {
    // Weekday (round 1) should draw 1–6 traffic cards (random)
    const weekdayCtx = safeContext();
    const weekdayActor = createActor(gameMachine, { input: weekdayCtx });
    weekdayActor.start();
    const weekdayTrafficOnBoard = getFilledTimeSlots(weekdayActor.getSnapshot().context).filter((s) => s.card !== null).length;

    // Weekend (round 6) should draw 1–2 traffic cards
    const weekendCtx = safeContext('test-seed', { round: 6 });
    const weekendActor = createActor(gameMachine, { input: weekendCtx });
    weekendActor.start();
    const weekendTrafficOnBoard = getFilledTimeSlots(weekendActor.getSnapshot().context).filter((s) => s.card !== null).length;

    expect(weekdayTrafficOnBoard).toBeGreaterThanOrEqual(MIN_WEEKDAY_TRAFFIC_DRAW);
    expect(weekdayTrafficOnBoard).toBeLessThanOrEqual(MAX_WEEKDAY_TRAFFIC_DRAW);
    expect(weekendTrafficOnBoard).toBeGreaterThanOrEqual(MIN_WEEKEND_TRAFFIC_DRAW);
    expect(weekendTrafficOnBoard).toBeLessThanOrEqual(MAX_WEEKEND_TRAFFIC_DRAW);
  });

  it('allows Security Patch (MitigateDDoS) during weekend crisis', () => {
    const securityPatch = ACTION_CARDS.find(c => c.templateId === 'action-security-patch')!;
    const base = ctxWithPendingEvents(
      [new DDoSAttackCard('ev-1')],
      safeContext('test-seed', { round: 6, activePhase: PhaseId.Crisis }),
    );
    const ctx = ctxWithHandCardsFixedIds([securityPatch], base);
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    // Should accept Security Patch
    actor.send({ type: 'PLAY_ACTION', card: securityPatch, targetEventId: 'ev-1' });
    expect(actor.getSnapshot().context.mitigatedEventIds).toContain('ev-1');
  });

  it('rejects Security Patch during scheduling (crisis-only card)', () => {
    const securityPatch = ACTION_CARDS.find(c => c.templateId === 'action-security-patch')!;
    const ctx = ctxWithHandCardsFixedIds(
      [securityPatch],
      safeContext('test-seed', { round: 1, budget: 100_000 }),
    );
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'PLAY_ACTION', card: securityPatch });
    // Card must not be played — hand and budget unchanged
    expect(actor.getSnapshot().context.playedThisRoundOrder).toHaveLength(0);
    expect(actor.getSnapshot().context.handOrder).toHaveLength(1);
    expect(actor.getSnapshot().context.budget).toBe(100_000);
  });

  it('allows Security Patch during weekday crisis', () => {
    const securityPatch = ACTION_CARDS.find(c => c.templateId === 'action-security-patch')!;
    const base = ctxWithPendingEvents(
      [new DDoSAttackCard('ev-2')],
      safeContext('test-seed', { round: 1, activePhase: PhaseId.Crisis }),
    );
    const ctx = ctxWithHandCardsFixedIds([securityPatch], base);
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    actor.send({ type: 'PLAY_ACTION', card: securityPatch, targetEventId: 'ev-2' });
    expect(actor.getSnapshot().context.mitigatedEventIds).toContain('ev-2');
  });

  it('rejects Security Patch against AWS Outage event', () => {
    const securityPatch = ACTION_CARDS.find(c => c.templateId === 'action-security-patch')!;
    const base = ctxWithPendingEvents(
      [new AWSOutageCard('ev-aws')],
      safeContext('test-seed', { round: 1, activePhase: PhaseId.Crisis, budget: 100_000 }),
    );
    const ctx = ctxWithHandCardsFixedIds([securityPatch], base);
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    actor.send({ type: 'PLAY_ACTION', card: securityPatch, targetEventId: 'ev-aws' });
    expect(actor.getSnapshot().context.playedThisRoundOrder).toHaveLength(0);
    expect(actor.getSnapshot().context.budget).toBe(100_000);
  });

  it('rejects Security Patch against 5G Tower event', () => {
    const securityPatch = ACTION_CARDS.find(c => c.templateId === 'action-security-patch')!;
    const base = ctxWithPendingEvents(
      [new FiveGActivationCard('ev-5g')],
      safeContext('test-seed', { round: 1, activePhase: PhaseId.Crisis, budget: 100_000 }),
    );
    const ctx = ctxWithHandCardsFixedIds([securityPatch], base);
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    actor.send({ type: 'PLAY_ACTION', card: securityPatch, targetEventId: 'ev-5g' });
    expect(actor.getSnapshot().context.playedThisRoundOrder).toHaveLength(0);
    expect(actor.getSnapshot().context.budget).toBe(100_000);
  });

  it('allows Work Order (ClearTicket) during weekend crisis', () => {
    const workOrder = ACTION_CARDS.find(c => c.templateId === 'action-work-order')!;
    const ticketTarget = new DDoSAttackCard('ev-weekend-ticket');
    const base = ctxWithHandCardsFixedIds(
      [workOrder],
      safeContext('test-seed', { round: 6, activePhase: PhaseId.Crisis }),
    );
    const ctx = {
      ...base,
      cardInstances: { ...base.cardInstances, [ticketTarget.id]: ticketTarget },
      ticketOrders: { ...base.ticketOrders, [Track.BreakFix]: [ticketTarget.id] },
    };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    // Work Order plays during weekend crisis and clears the open ticket
    actor.send({ type: 'PLAY_ACTION', card: workOrder });
    expect(actor.getSnapshot().context.playedThisRoundOrder).toHaveLength(1);
    expect(actor.getSnapshot().context.ticketOrders[Track.BreakFix]).toHaveLength(0);
  });

  it('rejects non-weekend action cards during weekend crisis', () => {
    const bandwidthUpgrade = ACTION_CARDS.find(c => c.templateId === 'action-bandwidth-upgrade')!;
    const ctx = ctxWithHandCardsFixedIds(
      [bandwidthUpgrade],
      safeContext('test-seed', { round: 6, activePhase: PhaseId.Crisis }),
    );
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    // Should reject Bandwidth Upgrade — not a weekend-allowed effect
    actor.send({ type: 'PLAY_ACTION', card: bandwidthUpgrade });
    // Card should NOT have been played
    expect(actor.getSnapshot().context.playedThisRoundOrder).toHaveLength(0);
    expect(actor.getSnapshot().context.handOrder).toHaveLength(1);
  });

  it('Friday discards hand and redraws fresh', () => {
    const ctx = ctxWithHandCardsFixedIds(
      [new WorkOrderCard('keep-1'), new WorkOrderCard('keep-2')],
      safeContext('test-seed', { round: 5 }),
    );
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');

    const handIdsBefore = actor.getSnapshot().context.handOrder.slice();

    // Advance through Friday
    actor.send({ type: 'ADVANCE' }); // → crisis
    actor.send({ type: 'ADVANCE' }); // crisis → resolution → auto → end → draw (Sat)

    // Hand should be fully refreshed (HAND_SIZE cards, none of the old IDs)
    const handAfter = actor.getSnapshot().context.handOrder;
    expect(handAfter).toHaveLength(HAND_SIZE);
    // Old hand cards should have been discarded
    for (const oldId of handIdsBefore) {
      expect(handAfter).not.toContain(oldId);
    }
  });

  it('non-Friday workday keeps unplayed hand cards', () => {
    const ctx = ctxWithHandCardsFixedIds(
      [new WorkOrderCard('carry-1'), new WorkOrderCard('carry-2')],
      safeContext('test-seed', { round: 3 }),
    );
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });

    actor.send({ type: 'ADVANCE' }); // → crisis
    actor.send({ type: 'ADVANCE' }); // crisis → resolution (transient) → end (transient) → draw

    const handAfter = actor.getSnapshot().context.handOrder;
    expect(handAfter).toHaveLength(HAND_SIZE);
    // Old cards should still be present
    expect(handAfter).toContain('carry-1');
    expect(handAfter).toContain('carry-2');
  });
});

describe('gameMachine seeded draw determinism', () => {
  it('same seed and round always produce the same traffic draw count', () => {
    const seed = 'detangle-test-seed-42';

    function drawCount(seed: string, round: number): number {
      const ctx = safeContext(seed, { round });
      const actor = createActor(gameMachine, { input: ctx });
      actor.start();
      // Machine enters scheduling immediately after start (DRAW_COMPLETE fires in draw entry)
      return getFilledTimeSlots(actor.getSnapshot().context).filter((s) => s.card !== null).length;
    }

    // Round 1 (weekday)
    expect(drawCount(seed, 1)).toBe(drawCount(seed, 1));
    // Round 6 (weekend)
    expect(drawCount(seed, 6)).toBe(drawCount(seed, 6));
    // Different round numbers produce independent but still deterministic results
    const r1 = drawCount(seed, 1);
    const r2 = drawCount(seed, 2);
    expect(drawCount(seed, 1)).toBe(r1);
    expect(drawCount(seed, 2)).toBe(r2);
  });
});
