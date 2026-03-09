import { describe, expect, it } from 'vitest';
import { checkLoseCondition, checkWinCondition, resolveRound } from '../resolveRound.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import {
  MAX_ROUNDS,
  MAX_SLA_FAILURES,
  Period,
  PhaseId,
  SlotType,
} from '../types.js';
import { safeContext, ctxWithCardOnSlot } from './testHelpers.js';

const iotCard = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-iot-burst')!;
const cloudCard = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-cloud-backup')!;

describe('resolveRound', () => {
  it('applies pendingRevenue as budgetDelta without modifying budget', () => {
    const ctx = safeContext('test-seed', { activePhase: PhaseId.Resolution, pendingRevenue: iotCard.revenue });
    const { context, summary } = resolveRound(ctx);
    expect(context.budget).toBe(500_000); // budget not modified during resolveRound
    expect(summary.budgetDelta).toBe(iotCard.revenue);
  });

  it('resolvedCount captures all slot cards; failedCount and slaCount reflect slot-card resolution', () => {
    const base = safeContext('test-seed', { activePhase: PhaseId.Resolution });
    const ctx = ctxWithCardOnSlot(iotCard, Period.Morning, 0, base);
    const { context, summary } = resolveRound(ctx);
    expect(context.budget).toBe(500_000);
    expect(summary.resolvedCount).toBe(1);
    expect(summary.failedCount).toBe(0);
    expect(context.slaCount).toBe(0);
  });

  it('resets pendingRevenue to 0 after resolution', () => {
    const ctx = safeContext('test-seed', { activePhase: PhaseId.Resolution, pendingRevenue: 12_000 });
    const { context } = resolveRound(ctx);
    expect(context.pendingRevenue).toBe(0);
  });

  it('overload slots are swept: each adds 1 SLA failure and cards go to trafficDiscardOrder', () => {
    const base = safeContext('test-seed', { activePhase: PhaseId.Resolution });
    let ctx = ctxWithCardOnSlot(iotCard, Period.Morning, 100, base, SlotType.Overloaded);
    ctx = ctxWithCardOnSlot(cloudCard, Period.Morning, 101, ctx, SlotType.Overloaded);
    const { summary, context: resolved } = resolveRound(ctx);
    // 2 overload slots → 2 SLA failures, no budget deduction
    expect(summary.failedCount).toBe(2);
    expect(resolved.slaCount).toBe(2);
    expect(resolved.budget).toBe(500_000);
    // Overload slot cards go to trafficDiscardOrder
    expect(resolved.trafficDiscardOrder).toContain(iotCard.id);
    expect(resolved.trafficDiscardOrder).toContain(cloudCard.id);
    // Overload slots removed from slotLayout
    expect(resolved.slotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
  });

  it('populates lastRoundSummary', () => {
    const base = safeContext('test-seed', { activePhase: PhaseId.Resolution, pendingRevenue: cloudCard.revenue });
    const ctx = ctxWithCardOnSlot(cloudCard, Period.Morning, 0, base);
    const { summary } = resolveRound(ctx);
    expect(summary.resolvedCount).toBe(1);
    expect(summary.budgetDelta).toBe(cloudCard.revenue);
  });
});

describe('checkLoseCondition', () => {
  it('returns Bankrupt when budget < -100000', () => {
    const ctx = safeContext('test-seed', { budget: -100_001 });
    expect(checkLoseCondition(ctx)).toBe('Bankrupt');
  });

  it('returns SLAExceeded when slaCount >= MAX_SLA_FAILURES', () => {
    const ctx = safeContext('test-seed', { slaCount: MAX_SLA_FAILURES });
    expect(checkLoseCondition(ctx)).toBe('SLAExceeded');
  });

  it('returns null when game is still active', () => {
    const ctx = safeContext('test-seed', { budget: 100_000, slaCount: 2 });
    expect(checkLoseCondition(ctx)).toBeNull();
  });
});

describe('checkWinCondition', () => {
  it('returns true when round >= MAX_ROUNDS and budget >= 0', () => {
    const ctx = safeContext('test-seed', { round: MAX_ROUNDS, budget: 0 });
    expect(checkWinCondition(ctx)).toBe(true);
  });

  it('returns false when round < MAX_ROUNDS', () => {
    const ctx = safeContext('test-seed', { round: MAX_ROUNDS - 1, budget: 100_000 });
    expect(checkWinCondition(ctx)).toBe(false);
  });

  it('returns true when round >= MAX_ROUNDS even if budget < 0 (net-negative survival is still a win)', () => {
    const ctx = safeContext('test-seed', { round: MAX_ROUNDS, budget: -1 });
    expect(checkWinCondition(ctx)).toBe(true);
  });
});
