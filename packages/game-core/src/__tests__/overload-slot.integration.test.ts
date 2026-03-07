import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { createInitialContext, gameMachine } from '../machine.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import { Period, type ActionCard, type TrafficCard } from '../types.js';
import { autoFillTrafficSlots } from '../autoFillTrafficSlots.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { PhaseId } from '../types.js';
import { resolveRound } from '../resolveRound.js';

/** Traffic-only deck with no events so rounds complete without surprise game-overs. */
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

function drawComplete(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  actor.send({ type: 'DRAW_COMPLETE' });
}

function advanceRound(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  actor.send({ type: 'ADVANCE' }); // scheduling → crisis
  actor.send({ type: 'ADVANCE' }); // crisis → resolution (stable)
  actor.send({ type: 'ADVANCE' }); // resolution → end → draw
  drawComplete(actor);             // draw → scheduling
}

const iotCard = TRAFFIC_CARDS.find((c) => c.id === 'traffic-iot-burst')!;
const cloudCard = TRAFFIC_CARDS.find((c) => c.id === 'traffic-cloud-backup')!;
const bandwidthUpgrade = ACTION_CARDS.find((c) => c.templateId === 'action-bandwidth-upgrade')!;
const dataCenterExpansion = ACTION_CARDS.find(
  (c) => c.templateId === 'action-datacenter-expansion',
)!;
const trafficPrioritization = ACTION_CARDS.find(
  (c) => c.templateId === 'action-traffic-prioritization',
)!;
const streamCompression = ACTION_CARDS.find((c) => c.templateId === 'action-stream-compression')!;

// ─── Overload slot creation ───────────────────────────────────────────────────

describe('integration: overload slot creation', () => {
  it('creates an overload slot when a period is full, with no budget penalty', () => {
    // Fill Morning completely (4 slots × capacity 1), then send 1 more card
    const initialCtx = {
      budget: 500_000,
      round: 1,
      slaCount: 0,
      hand: [],
      playedThisRound: [],
      // Pre-fill all Morning slots so card[0] (round-robin → Morning) triggers an overload
      timeSlots: createInitialTimeSlots().map((s) =>
        s.period === Period.Morning ? { ...s, card: iotCard } : s,
      ),
      tracks: createInitialTracks(),
      vendorSlots: createVendorSlots(),
      pendingEvents: [],
      mitigatedEventIds: [],
      activePhase: PhaseId.Scheduling,
      trafficDeck: [],
      trafficDiscard: [],
      eventDeck: [],
      eventDiscard: [],
      spawnedTrafficQueue: [],
      actionDeck: [],
      actionDiscard: [],
      lastRoundSummary: null,
      loseReason: null,
      pendingRevenue: 0,
      seed: 'overload-test',
      drawLog: null,
    };
    const { context } = autoFillTrafficSlots(initialCtx, [iotCard]);

    const morningOverloadSlots = context.timeSlots.filter(
      (s) => s.period === Period.Morning && s.overloaded,
    );
    expect(morningOverloadSlots).toHaveLength(1);
    expect(morningOverloadSlots[0]!.card).toBe(iotCard);
    // No budget penalty
    expect(context.budget).toBe(500_000);
  });
});

// ─── Resolution sweep ─────────────────────────────────────────────────────────

describe('integration: resolution sweeps overload slots', () => {
  it('overload slots removed at resolution; cards go to trafficDiscard; SLA incremented', () => {
    const initialSlots = createInitialTimeSlots();
    const ol1 = { ...initialSlots[0]!, index: 50, overloaded: true as const, card: iotCard };
    const ol2 = { ...initialSlots[1]!, index: 51, overloaded: true as const, card: cloudCard };
    const ctx = {
      budget: 500_000,
      round: 1,
      slaCount: 0,
      hand: [],
      playedThisRound: [],
      timeSlots: [...initialSlots, ol1, ol2],
      tracks: createInitialTracks(),
      vendorSlots: createVendorSlots(),
      pendingEvents: [],
      mitigatedEventIds: [],
      activePhase: PhaseId.Resolution,
      trafficDeck: [],
      trafficDiscard: [],
      eventDeck: [],
      eventDiscard: [],
      spawnedTrafficQueue: [],
      actionDeck: [],
      actionDiscard: [],
      lastRoundSummary: null,
      loseReason: null,
      pendingRevenue: 0,
      seed: 'sweep-test',
      drawLog: null,
    };

    const { context: resolved, summary } = resolveRound(ctx);

    expect(summary.failedCount).toBe(2);
    expect(resolved.slaCount).toBe(2);
    expect(resolved.budget).toBe(500_000); // no monetary penalty
    expect(resolved.trafficDiscard).toContainEqual(iotCard);
    expect(resolved.trafficDiscard).toContainEqual(cloudCard);
    expect(resolved.timeSlots.filter((s) => s.overloaded)).toHaveLength(0);
  });
});

// ─── Traffic Prioritization on overload slot ─────────────────────────────────

describe('integration: Traffic Prioritization clears overload slot', () => {
  it('removes the traffic card and deletes the overload slot; revenue collected', () => {
    const base = {
      ...safeContext(),
      hand: [trafficPrioritization],
      // Empty deck so performDraw (on machine start) draws nothing — no extra overload slots.
      trafficDeck: [],
      trafficDiscard: [],
      // Pre-fill Morning to max, then inject an overload slot
      timeSlots: [
        ...createInitialTimeSlots().map((s) =>
          s.period === Period.Morning ? { ...s, card: iotCard } : s,
        ),
        {
          period: Period.Morning,
          index: 10,
          card: cloudCard,
          overloaded: true as const,
        },
      ],
    };

    const actor = createActor(gameMachine, { input: base });
    actor.start();
    drawComplete(actor);
    expect(actor.getSnapshot().value).toBe('scheduling');

    // Use Traffic Prioritization to remove cloudCard from the overload slot
    actor.send({
      type: 'PLAY_ACTION',
      card: trafficPrioritization,
      targetTrafficCardId: cloudCard.id,
    });

    const snap = actor.getSnapshot();
    // Overload slot must be gone
    expect(snap.context.timeSlots.filter((s) => s.overloaded)).toHaveLength(0);
    // Revenue for cloudCard collected
    expect(snap.context.budget).toBe(base.budget - trafficPrioritization.cost + cloudCard.revenue);    // Removed card goes to trafficDiscard
    expect(snap.context.trafficDiscard.map((c) => c.id)).toContain(cloudCard.id);  });
});

// ─── Stream Compression on overload slot ─────────────────────────────────────

describe('integration: Stream Compression clears overload slot', () => {
  it('removes empty overload slot after card is compressed out', () => {
    // Use Afternoon with exactly 1 regular slot (iotCard) + 1 overload slot (iotCard).
    // SC sees 2 iotCards → removeCount = 2, removes from the regular slot first then the overload
    // slot. Overload slot becomes empty → filtered out.
    // Empty deck so performDraw draws nothing — no extra overload slots created on start.
    const afternoonBase = createInitialTimeSlots().find((s) => s.period === Period.Afternoon)!;
    const base = {
      ...safeContext(),
      hand: [streamCompression],
      trafficDeck: [],
      trafficDiscard: [],
      timeSlots: [
        // Keep all non-Afternoon slots as empty baselines
        ...createInitialTimeSlots().filter((s) => s.period !== Period.Afternoon),
        // Only 1 regular Afternoon slot with a card
        { ...afternoonBase, card: iotCard },
        // 1 overload slot also with a card
        {
          period: Period.Afternoon,
          index: 20,
          card: iotCard,
          overloaded: true as const,
        },
      ],
    };

    const actor = createActor(gameMachine, { input: base });
    actor.start();
    drawComplete(actor);
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({
      type: 'PLAY_ACTION',
      card: streamCompression,
      targetPeriod: Period.Afternoon,
    });

    const snap = actor.getSnapshot();
    // Overload slot must be gone — its iotCard was removed by SC
    expect(snap.context.timeSlots.filter((s) => s.overloaded)).toHaveLength(0);
    // Both removed cards end up in trafficDiscard
    expect(snap.context.trafficDiscard).toHaveLength(2);
  });
});

// ─── Bandwidth Upgrade converts overload slot ─────────────────────────────────

describe('integration: Bandwidth Upgrade converts overload slot', () => {
  it('converts 1 overload slot to normal weeklyTemporary, net +1 slot in period', () => {
    const morningCount = createInitialTimeSlots().filter((s) => s.period === Period.Morning).length;
    const overloadSlot = {
      period: Period.Morning,
      index: morningCount,
      card: iotCard,
      overloaded: true as const,
    };
    const base = {
      ...safeContext(),
      round: 2,
      hand: [bandwidthUpgrade],
      trafficDeck: [],
      trafficDiscard: [],
      timeSlots: [...createInitialTimeSlots(), overloadSlot],
    };

    const actor = createActor(gameMachine, { input: base });
    actor.start();
    drawComplete(actor);
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({
      type: 'PLAY_ACTION',
      card: bandwidthUpgrade,
      targetPeriod: Period.Morning,
    });

    const snap = actor.getSnapshot();
    const morningSlots = snap.context.timeSlots.filter((s) => s.period === Period.Morning);
    // Overload slot converted → no overloaded slots remain
    expect(morningSlots.filter((s) => s.overloaded)).toHaveLength(0);
    // Net total: original + 1 overload converted (net +1). No additional empty slot added because
    // the 1 convert accounts for BU's full quota of 1.
    expect(morningSlots).toHaveLength(morningCount + 1);
    // Converted slot has weeklyTemporary: true and still holds its card
    const converted = morningSlots.find((s) => s.weeklyTemporary);
    expect(converted).toBeDefined();
    expect(converted!.card).toBe(iotCard);
  });

  it('adds a new empty slot when no overload slots exist in the period', () => {
    const morningCount = createInitialTimeSlots().filter((s) => s.period === Period.Morning).length;
    const base = {
      ...safeContext(),
      round: 2,
      hand: [bandwidthUpgrade],
      trafficDeck: [],
      trafficDiscard: [],
      timeSlots: createInitialTimeSlots(),
    };

    const actor = createActor(gameMachine, { input: base });
    actor.start();
    drawComplete(actor);

    actor.send({ type: 'PLAY_ACTION', card: bandwidthUpgrade, targetPeriod: Period.Morning });

    const morningSlots = actor.getSnapshot().context.timeSlots.filter(
      (s) => s.period === Period.Morning,
    );
    expect(morningSlots).toHaveLength(morningCount + 1);
    const newSlot = morningSlots.find((s) => s.weeklyTemporary);
    expect(newSlot).toBeDefined();
    expect(newSlot!.card).toBeNull();
  });
});

// ─── Data Center Expansion converts overload slots ────────────────────────────

describe('integration: Data Center Expansion converts overload slots', () => {
  it('converts 2 overload slots to normal; no extra empty slot added', () => {
    const eveningCount = createInitialTimeSlots().filter(
      (s) => s.period === Period.Evening,
    ).length;
    const ol1 = {
      period: Period.Evening,
      index: eveningCount,
      card: iotCard,
      overloaded: true as const,
    };
    const ol2 = {
      period: Period.Evening,
      index: eveningCount + 1,
      card: cloudCard,
      overloaded: true as const,
    };
    const base = {
      ...safeContext(),
      round: 2,
      hand: [dataCenterExpansion],
      trafficDeck: [],
      trafficDiscard: [],
      timeSlots: [...createInitialTimeSlots(), ol1, ol2],
    };

    const actor = createActor(gameMachine, { input: base });
    actor.start();
    drawComplete(actor);

    actor.send({
      type: 'PLAY_ACTION',
      card: dataCenterExpansion,
      targetPeriod: Period.Evening,
    });

    const eveningSlots = actor.getSnapshot().context.timeSlots.filter(
      (s) => s.period === Period.Evening,
    );
    expect(eveningSlots.filter((s) => s.overloaded)).toHaveLength(0);
    // 2 overload slots converted, 0 new empty slots added: net = original + 2
    expect(eveningSlots).toHaveLength(eveningCount + 2);
    // Both converted slots have weeklyTemporary and their cards
    const converted = eveningSlots.filter((s) => s.weeklyTemporary);
    expect(converted).toHaveLength(2);
  });

  it('converts 1 overload and adds 1 new empty slot when only 1 overload exists', () => {
    const eveningCount = createInitialTimeSlots().filter(
      (s) => s.period === Period.Evening,
    ).length;
    const ol1 = {
      period: Period.Evening,
      index: eveningCount,
      card: iotCard,
      overloaded: true as const,
    };
    const base = {
      ...safeContext(),
      round: 2,
      hand: [dataCenterExpansion],
      trafficDeck: [],
      trafficDiscard: [],
      timeSlots: [...createInitialTimeSlots(), ol1],
    };

    const actor = createActor(gameMachine, { input: base });
    actor.start();
    drawComplete(actor);

    actor.send({
      type: 'PLAY_ACTION',
      card: dataCenterExpansion,
      targetPeriod: Period.Evening,
    });

    const eveningSlots = actor.getSnapshot().context.timeSlots.filter(
      (s) => s.period === Period.Evening,
    );
    expect(eveningSlots.filter((s) => s.overloaded)).toHaveLength(0);
    expect(eveningSlots).toHaveLength(eveningCount + 2); // 1 converted + 1 new
  });
});
