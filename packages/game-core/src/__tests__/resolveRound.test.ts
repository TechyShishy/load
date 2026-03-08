import { describe, expect, it } from 'vitest';
import { checkLoseCondition, checkWinCondition, resolveRound } from '../resolveRound.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import {
  MAX_ROUNDS,
  MAX_SLA_FAILURES,
  PhaseId,
  type GameContext,
  type TrafficCard,
} from '../types.js';

const iotCard: TrafficCard = TRAFFIC_CARDS.find((c) => c.id === 'traffic-iot-burst')!;
const cloudCard: TrafficCard = TRAFFIC_CARDS.find((c) => c.id === 'traffic-cloud-backup')!;

function makeCtx(overrides: Partial<GameContext> = {}): GameContext {
  return {
    budget: 500_000,
    round: 1,
    slaCount: 0,
    hand: [],
    playedThisRound: [],
    timeSlots: createInitialTimeSlots(),
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
    actionDeck: ACTION_CARDS,
    actionDiscard: [],
    lastRoundSummary: null,
    loseReason: null,
    pendingRevenue: 0,
    seed: 'test-seed',
    skipNextTrafficDraw: false,
    drawLog: null,
    ...overrides,
  };
}

describe('resolveRound', () => {
  it('applies pendingRevenue as budgetDelta without modifying budget', () => {
    const ctx = makeCtx({ pendingRevenue: iotCard.revenue });
    const { context, summary } = resolveRound(ctx);
    expect(context.budget).toBe(500_000); // budget not modified during resolveRound
    expect(summary.budgetDelta).toBe(iotCard.revenue);
  });

  it('resolvedCount captures all slot cards; failedCount and slaCount reflect slot-card resolution', () => {
    const slots = createInitialTimeSlots().map((s, i) =>
      i === 0 ? { ...s, card: iotCard } : s,
    );
    const ctx = makeCtx({ timeSlots: slots });
    const { context, summary } = resolveRound(ctx);
    expect(context.budget).toBe(500_000);
    expect(summary.resolvedCount).toBe(1);
    expect(summary.failedCount).toBe(0);
    expect(context.slaCount).toBe(0);
  });

  it('resets pendingRevenue to 0 after resolution', () => {
    const ctx = makeCtx({ pendingRevenue: 12_000 });
    const { context } = resolveRound(ctx);
    expect(context.pendingRevenue).toBe(0);
  });

  it('overload slots are swept: each adds 1 SLA failure and cards go to trafficDiscard', () => {
    const initialSlots = createInitialTimeSlots();
    const ol1 = { ...initialSlots[0]!, index: 100, overloaded: true as const, card: iotCard };
    const ol2 = { ...initialSlots[1]!, index: 101, overloaded: true as const, card: cloudCard };
    const ctx = makeCtx({ timeSlots: [...initialSlots, ol1, ol2], trafficDiscard: [] });
    const { summary, context: resolved } = resolveRound(ctx);
    // 2 overload slots → 2 SLA failures, no budget deduction
    expect(summary.failedCount).toBe(2);
    expect(resolved.slaCount).toBe(2);
    expect(resolved.budget).toBe(500_000);
    // Overload slot cards go to trafficDiscard
    expect(resolved.trafficDiscard).toContainEqual(iotCard);
    expect(resolved.trafficDiscard).toContainEqual(cloudCard);
    // Overload slots removed from timeSlots
    expect(resolved.timeSlots.filter((s) => s.overloaded)).toHaveLength(0);
  });

  it('populates lastRoundSummary', () => {
    const slots = createInitialTimeSlots().map((s, i) =>
      i === 0 ? { ...s, card: cloudCard } : s,
    );
    // pendingRevenue simulates revenue collected when cloudCard was removed this round
    const ctx = makeCtx({ timeSlots: slots, pendingRevenue: cloudCard.revenue });
    const { summary } = resolveRound(ctx);
    expect(summary.resolvedCount).toBe(1);
    expect(summary.budgetDelta).toBe(cloudCard.revenue);
  });
});

describe('checkLoseCondition', () => {
  it('returns Bankrupt when budget < -100000', () => {
    const ctx = makeCtx({ budget: -100_001 });
    expect(checkLoseCondition(ctx)).toBe('Bankrupt');
  });

  it('returns SLAExceeded when slaCount >= MAX_SLA_FAILURES', () => {
    const ctx = makeCtx({ slaCount: MAX_SLA_FAILURES });
    expect(checkLoseCondition(ctx)).toBe('SLAExceeded');
  });

  it('returns null when game is still active', () => {
    const ctx = makeCtx({ budget: 100_000, slaCount: 2 });
    expect(checkLoseCondition(ctx)).toBeNull();
  });
});

describe('checkWinCondition', () => {
  it('returns true when round >= MAX_ROUNDS and budget >= 0', () => {
    const ctx = makeCtx({ round: MAX_ROUNDS, budget: 0 });
    expect(checkWinCondition(ctx)).toBe(true);
  });

  it('returns false when round < MAX_ROUNDS', () => {
    const ctx = makeCtx({ round: MAX_ROUNDS - 1, budget: 100_000 });
    expect(checkWinCondition(ctx)).toBe(false);
  });

  it('returns true when round >= MAX_ROUNDS even if budget < 0 (net-negative survival is still a win)', () => {
    const ctx = makeCtx({ round: MAX_ROUNDS, budget: -1 });
    expect(checkWinCondition(ctx)).toBe(true);
  });
});
