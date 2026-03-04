/// <reference types="vitest" />
import { describe, expect, it } from 'vitest';
import { checkLoseCondition, checkWinCondition, resolveRound } from '../resolveRound.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { TRAFFIC_CARDS } from '../data/trafficCards.js';
import { ACTION_CARDS } from '../data/actionCards.js';
import {
  MAX_SLA_FAILURES,
  Period,
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
    slaProtectedCount: 0,
    activePhase: PhaseId.Resolution,
    trafficEventDeck: [],
    trafficEventDiscard: [],
    actionDeck: ACTION_CARDS,
    actionDiscard: [],
    lastRoundSummary: null,
    loseReason: null,
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

  it('slaProtectedCount reduces sla failures', () => {
    const slots = createInitialTimeSlots().map((s, i) =>
      i === 0 ? { ...s, cards: [iotCard], unavailable: true } : s,
    );
    const ctx = makeCtx({ timeSlots: slots, slaProtectedCount: 1 });
    const { context } = resolveRound(ctx);
    expect(context.slaCount).toBe(0); // failure was protected
  });

  it('slaProtectedCount does not go below zero', () => {
    const ctx = makeCtx({ slaProtectedCount: 5 }); // no failures
    const { context } = resolveRound(ctx);
    expect(context.slaCount).toBe(0);
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
  it('returns true when round > 12 and budget >= 0', () => {
    const ctx = makeCtx({ round: 13, budget: 0 });
    expect(checkWinCondition(ctx)).toBe(true);
  });

  it('returns false when round <= 12', () => {
    const ctx = makeCtx({ round: 12, budget: 100_000 });
    expect(checkWinCondition(ctx)).toBe(false);
  });

  it('returns false when round > 12 but budget < 0', () => {
    const ctx = makeCtx({ round: 13, budget: -1 });
    expect(checkWinCondition(ctx)).toBe(false);
  });
});
