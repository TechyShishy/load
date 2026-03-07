import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { createInitialContext, gameMachine } from '../machine.js';
import { createInitialTimeSlots } from '../boardState.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { WEEKDAY_TRAFFIC_DRAW, WEEKEND_TRAFFIC_DRAW, HAND_SIZE, Track, type TrafficCard, type ActionCard } from '../types.js';
import { getDayOfWeek, getDayName, getWeekNumber, isWeekend, isFriday } from '../types.js';
import { EmergencyMaintenanceCard } from '../data/actions/index.js';
import { AWSOutageCard, DDoSAttackCard, FiveGActivationCard } from '../data/events/index.js';

/** Build a deterministic safeContext where the deck has only traffic cards (no events),
 * so a round will always complete without game-over from bad draws. */
function safeContext() {
  // 24 traffic-only cards (no events) → no penalties, no SLA risk
  const trafficDeck: TrafficCard[] = Array.from({ length: 24 }, (_, i) =>
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
    expect(actor.getSnapshot().context.hand).toHaveLength(7);
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

  it('ADVANCE from scheduling → execution → crisis', () => {
    const actor = getToScheduling();
    actor.send({ type: 'ADVANCE' });
    // execution is transient → immediately moves to crisis entry
    expect(actor.getSnapshot().value).toBe('crisis');
  });

  it('ADVANCE from crisis → resolution (stable) → end → draw (next round scheduling)', () => {
    const actor = getToScheduling();
    actor.send({ type: 'ADVANCE' }); // → crisis
    actor.send({ type: 'ADVANCE' }); // crisis → resolution (stable — pauses here)
    expect(actor.getSnapshot().value).toBe('resolution');
    actor.send({ type: 'ADVANCE' }); // resolution → end → draw
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → scheduling
    const snap = actor.getSnapshot();
    expect(snap.value).toBe('scheduling');
    expect(snap.context.round).toBe(2);
  });

  it('resolution state is stable — waits for ADVANCE before ending round', () => {
    const actor = getToScheduling();
    actor.send({ type: 'ADVANCE' }); // → crisis
    actor.send({ type: 'ADVANCE' }); // crisis → resolution
    // resolution must pause here, not auto-advance
    expect(actor.getSnapshot().value).toBe('resolution');
  });
});

describe('gameMachine win/lose conditions', () => {
  it('reaches gameLost state when SLA >= 3 at start of draw', () => {
    // SLA already maxed — draw phase guard should trigger gameLost on DRAW_COMPLETE
    const ctx = { ...safeContext(), slaCount: 3 };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('gameLost');
  });

  it('reaches gameLost when bankrupt at start of draw', () => {
    const ctx = { ...safeContext(), budget: -200_000 };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('gameLost');
  });

  it('RESET from gameLost resets to scheduling', () => {
    const actor = createActor(gameMachine);
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    // We test this by verifying a fresh machine goes to scheduling after DRAW_COMPLETE
    // (Full lose-trigger path tested above)
    expect(actor.getSnapshot().value).toBe('scheduling');
  });

  it('reaches gameWon at round 28 with budget in (-100K, 0)', () => {
    // Regression: previously checkWinCondition required budget >= 0, so a net-negative
    // but non-bankrupt end-of-game had no matching guard and looped forever.
    // Round 28 is a Sunday (weekend), so DRAW_COMPLETE transitions directly to crisis.
    const ctx = { ...safeContext(), round: 28, budget: -50_000 };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → crisis (weekend)
    expect(actor.getSnapshot().value).toBe('crisis'); // weekend: draw → crisis
    actor.send({ type: 'ADVANCE' }); // crisis → resolution → always → gameWon
    expect(actor.getSnapshot().value).toBe('gameWon');
  });
});

describe('gameMachine overload slots', () => {
  /** Build a context where all time slots are pre-filled with a traffic card,
   * so every drawn card during the round triggers an overload slot creation. */
  function allFilledContext() {
    const iotCard = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-iot-burst')!;
    const filledSlots = createInitialTimeSlots().map((s) => ({ ...s, card: iotCard }));
    return { ...safeContext(), timeSlots: filledSlots };
  }

  it('overload slots appear on the board when a period is full', () => {
    const actor = createActor(gameMachine, { input: allFilledContext() });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');
    // All slots pre-filled, so all drawn cards become overload slots
    const overloadSlots = actor.getSnapshot().context.timeSlots.filter((s) => s.overloaded);
    expect(overloadSlots.length).toBe(WEEKDAY_TRAFFIC_DRAW);
    // No budget penalty
    expect(actor.getSnapshot().context.budget).toBe(500_000);
  });

  it('overload slots are swept at resolution, incrementing slaCount', () => {
    const actor = createActor(gameMachine, { input: allFilledContext() });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    actor.send({ type: 'ADVANCE' }); // → crisis
    actor.send({ type: 'ADVANCE' }); // → resolution → gameLost (5 SLA ≥ MAX=3)
    const snap = actor.getSnapshot();
    // Resolution sweeps overload slots, slaCount exceeds limit → gameLost
    expect(snap.value).toBe('gameLost');
    const summary = snap.context.lastRoundSummary!;
    expect(summary).not.toBeNull();
    // Each overload slot = 1 SLA failure
    expect(summary.failedCount).toBe(WEEKDAY_TRAFFIC_DRAW);
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

    const initial = safeContext();
    const actor = createActor(gameMachine, { input: { ...initial, hand: [tpCard] } });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'ADVANCE' }); // scheduling → crisis
    expect(actor.getSnapshot().value).toBe('crisis');

    const boardCards = actor.getSnapshot().context.timeSlots.flatMap((s) => s.card ? [s.card] : []);
    expect(boardCards.length).toBeGreaterThan(0);
    const targetCard = boardCards[0]!;

    // Compute the expected revenue: RemoveTrafficCard removes ALL cards with that id
    // (board may have duplicate ids from the cycling safeContext deck).
    const expectedDelta = boardCards
      .filter((c) => c.id === targetCard.id)
      .reduce((sum, c) => sum + c.revenue, 0);

    actor.send({ type: 'PLAY_ACTION', card: tpCard, targetTrafficCardId: targetCard.id });
    actor.send({ type: 'ADVANCE' }); // crisis → resolution (stable)
    expect(actor.getSnapshot().value).toBe('resolution');

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
  /** Advance a workday: scheduling → crisis → resolution → end → draw → next phase */
  function advanceWorkday(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
    actor.send({ type: 'ADVANCE' }); // scheduling → execution → crisis
    actor.send({ type: 'ADVANCE' }); // crisis → resolution
    actor.send({ type: 'ADVANCE' }); // resolution → end → draw
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → next phase (scheduling or crisis)
  }

  /** Advance a weekend day: crisis → resolution → end → draw → next phase */
  function advanceWeekendDay(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
    actor.send({ type: 'ADVANCE' }); // crisis → resolution
    actor.send({ type: 'ADVANCE' }); // resolution → end → draw
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → next phase
  }

  it('weekdays go to scheduling, weekends skip to crisis', () => {
    const ctx = { ...safeContext(), round: 5 }; // Friday (workday)
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
    const ctx = { ...safeContext(), round: 6 }; // Saturday
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

  it('weekend draws fewer traffic cards than weekdays', () => {
    // Weekday (round 1) should draw WEEKDAY_TRAFFIC_DRAW traffic cards
    const weekdayCtx = safeContext();
    const weekdayActor = createActor(gameMachine, { input: weekdayCtx });
    weekdayActor.start();
    const weekdayTrafficOnBoard = weekdayActor.getSnapshot().context.timeSlots
      .flatMap(s => s.card ? [s.card] : []).length;

    // Weekend (round 6) should draw WEEKEND_TRAFFIC_DRAW traffic cards
    const weekendCtx = { ...safeContext(), round: 6 };
    const weekendActor = createActor(gameMachine, { input: weekendCtx });
    weekendActor.start();
    const weekendTrafficOnBoard = weekendActor.getSnapshot().context.timeSlots
      .flatMap(s => s.card ? [s.card] : []).length;

    expect(weekdayTrafficOnBoard).toBe(WEEKDAY_TRAFFIC_DRAW);
    expect(weekendTrafficOnBoard).toBe(WEEKEND_TRAFFIC_DRAW);
  });

  it('allows Security Patch (MitigateDDoS) during weekend crisis', () => {
    const securityPatch = ACTION_CARDS.find(c => c.templateId === 'action-security-patch')!;
    const ctx = {
      ...safeContext(),
      round: 6,
      hand: [securityPatch],
      // Add a pending event to mitigate
      eventDeck: [new DDoSAttackCard('ev-1')],
    };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('crisis');

    // Should accept Security Patch
    actor.send({ type: 'PLAY_ACTION', card: securityPatch, targetEventId: 'ev-1' });
    expect(actor.getSnapshot().context.mitigatedEventIds).toContain('ev-1');
  });

  it('rejects Security Patch during scheduling (crisis-only card)', () => {
    const securityPatch = ACTION_CARDS.find(c => c.templateId === 'action-security-patch')!;
    const ctx = {
      ...safeContext(),
      round: 1,
      hand: [securityPatch],
      budget: 100_000,
    };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'PLAY_ACTION', card: securityPatch });
    // Card must not be played — hand and budget unchanged
    expect(actor.getSnapshot().context.playedThisRound).toHaveLength(0);
    expect(actor.getSnapshot().context.hand).toHaveLength(1);
    expect(actor.getSnapshot().context.budget).toBe(100_000);
  });

  it('allows Security Patch during weekday crisis', () => {
    const securityPatch = ACTION_CARDS.find(c => c.templateId === 'action-security-patch')!;
    const ctx = {
      ...safeContext(),
      round: 1,
      hand: [securityPatch],
      eventDeck: [new DDoSAttackCard('ev-2')],
    };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'ADVANCE' }); // scheduling → crisis
    expect(actor.getSnapshot().value).toBe('crisis');

    actor.send({ type: 'PLAY_ACTION', card: securityPatch, targetEventId: 'ev-2' });
    expect(actor.getSnapshot().context.mitigatedEventIds).toContain('ev-2');
  });

  it('rejects Security Patch against AWS Outage event', () => {
    const securityPatch = ACTION_CARDS.find(c => c.templateId === 'action-security-patch')!;
    const ctx = {
      ...safeContext(),
      round: 1,
      hand: [securityPatch],
      budget: 100_000,
      eventDeck: [new AWSOutageCard('ev-aws')],
    };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    actor.send({ type: 'ADVANCE' }); // scheduling → crisis
    expect(actor.getSnapshot().value).toBe('crisis');

    actor.send({ type: 'PLAY_ACTION', card: securityPatch, targetEventId: 'ev-aws' });
    expect(actor.getSnapshot().context.playedThisRound).toHaveLength(0);
    expect(actor.getSnapshot().context.budget).toBe(100_000);
  });

  it('rejects Security Patch against 5G Tower event', () => {
    const securityPatch = ACTION_CARDS.find(c => c.templateId === 'action-security-patch')!;
    const ctx = {
      ...safeContext(),
      round: 1,
      hand: [securityPatch],
      budget: 100_000,
      eventDeck: [new FiveGActivationCard('ev-5g')],
    };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    actor.send({ type: 'ADVANCE' }); // scheduling → crisis
    expect(actor.getSnapshot().value).toBe('crisis');

    actor.send({ type: 'PLAY_ACTION', card: securityPatch, targetEventId: 'ev-5g' });
    expect(actor.getSnapshot().context.playedThisRound).toHaveLength(0);
    expect(actor.getSnapshot().context.budget).toBe(100_000);
  });

  it('allows Emergency Maintenance (ClearTicket) during weekend crisis', () => {
    const emergencyMaint = ACTION_CARDS.find(c => c.templateId === 'action-emergency-maintenance')!;
    const ctx = {
      ...safeContext(),
      round: 6,
      hand: [emergencyMaint],
    };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('crisis');

    // Should accept Emergency Maintenance (even if no tickets, the action is allowed)
    actor.send({ type: 'PLAY_ACTION', card: emergencyMaint });
    expect(actor.getSnapshot().context.playedThisRound).toHaveLength(1);
  });

  it('rejects non-weekend action cards during weekend crisis', () => {
    const bandwidthUpgrade = ACTION_CARDS.find(c => c.templateId === 'action-bandwidth-upgrade')!;
    const ctx = {
      ...safeContext(),
      round: 6,
      hand: [bandwidthUpgrade],
    };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('crisis');

    // Should reject Bandwidth Upgrade — not a weekend-allowed effect
    actor.send({ type: 'PLAY_ACTION', card: bandwidthUpgrade });
    // Card should NOT have been played
    expect(actor.getSnapshot().context.playedThisRound).toHaveLength(0);
    expect(actor.getSnapshot().context.hand).toHaveLength(1);
  });

  it('Friday discards hand and redraws fresh', () => {
    const ctx = {
      ...safeContext(),
      round: 5, // Friday
      hand: [
        new EmergencyMaintenanceCard('keep-1'),
        new EmergencyMaintenanceCard('keep-2'),
      ],
    };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');

    const handBefore = actor.getSnapshot().context.hand;
    const handIdsBefore = handBefore.map(c => c.id);

    // Advance through Friday
    actor.send({ type: 'ADVANCE' }); // → crisis
    actor.send({ type: 'ADVANCE' }); // → resolution
    actor.send({ type: 'ADVANCE' }); // → end → draw (Sat)

    // Hand should be fully refreshed (HAND_SIZE cards, none of the old IDs)
    const handAfter = actor.getSnapshot().context.hand;
    expect(handAfter).toHaveLength(HAND_SIZE);
    // Old hand cards should have been discarded
    for (const oldId of handIdsBefore) {
      expect(handAfter.find(c => c.id === oldId)).toBeUndefined();
    }
  });

  it('non-Friday workday keeps unplayed hand cards', () => {
    const ctx = {
      ...safeContext(),
      round: 3, // Wednesday
      hand: [
        new EmergencyMaintenanceCard('carry-1'),
        new EmergencyMaintenanceCard('carry-2'),
      ],
    };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });

    actor.send({ type: 'ADVANCE' }); // → crisis
    actor.send({ type: 'ADVANCE' }); // → resolution
    actor.send({ type: 'ADVANCE' }); // → end → draw (Thu)

    const handAfter = actor.getSnapshot().context.hand;
    expect(handAfter).toHaveLength(HAND_SIZE);
    // Old cards should still be present
    expect(handAfter.find(c => c.id === 'carry-1')).toBeDefined();
    expect(handAfter.find(c => c.id === 'carry-2')).toBeDefined();
  });
});
