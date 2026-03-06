import { describe, expect, it } from 'vitest';
import { checkLoseCondition, checkWinCondition, resolveRound } from '../resolveRound.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { TRAFFIC_CARDS } from '../data/trafficCards.js';
import { ACTION_CARDS } from '../data/actionCards.js';
import {
  MAX_ROUNDS,
  MAX_SLA_FAILURES,
  OVERLOAD_PENALTY,
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
    pendingOverloadCount: 0,
    seed: 'test-seed',
    ...overrides,
  };
}

describe('resolveRound', () => {
  it('awards revenue for cards in available slots', () => {
    const slots = createInitialTimeSlots().map((s, i) =>
      i === 0 ? { ...s, cards: [iotCard] } : s,
    );
    const ctx = makeCtx({ timeSlots: slots });
    const { context } = resolveRound(ctx);
    expect(context.budget).toBe(500_000 + iotCard.revenue);
  });

  it('does not award revenue for cards in unavailable slots, increments SLA', () => {
    const slots = createInitialTimeSlots().map((s, i) =>
      i === 0 ? { ...s, cards: [iotCard], unavailable: true } : s,
    );
    const ctx = makeCtx({ timeSlots: slots });
    const { context } = resolveRound(ctx);
    expect(context.budget).toBe(500_000); // no revenue
    expect(context.slaCount).toBe(1);
  });



  it('sets overloadPenalties from pendingOverloadCount and resets it to 0', () => {
    const ctx = makeCtx({ pendingOverloadCount: 2 });
    const { summary, context: resolved } = resolveRound(ctx);
    expect(summary.overloadPenalties).toBe(2 * OVERLOAD_PENALTY);
    expect(resolved.pendingOverloadCount).toBe(0);
  });

  it('populates lastRoundSummary', () => {
    const slots = createInitialTimeSlots().map((s, i) =>
      i === 0 ? { ...s, cards: [cloudCard] } : s,
    );
    const ctx = makeCtx({ timeSlots: slots });
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
