import { describe, expect, it } from 'vitest';
import { checkLoseCondition, checkWinCondition, resolveRound } from '../resolveRound.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import { FiveGActivationCard } from '../data/events/FiveGActivationCard.js';
import {
  MAX_ROUNDS,
  MAX_SLA_FAILURES,
  Period,
  PhaseId,
  SlotType,
  Track,
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

  it('spawned cards swept from overload slots incur SLA failure but do NOT enter trafficDiscardOrder', () => {
    // iotCard is registered as spawned (e.g. a DDoS card whose one-turn protection expired).
    // cloudCard is a normal deck card in an overload slot.
    const base = safeContext('test-seed', { activePhase: PhaseId.Resolution });
    let ctx = ctxWithCardOnSlot(iotCard, Period.Morning, 4, base, SlotType.Overloaded);
    ctx = ctxWithCardOnSlot(cloudCard, Period.Morning, 5, ctx, SlotType.Overloaded);
    ctx = { ...ctx, spawnedTrafficIds: [iotCard.id] };

    const { summary, context: resolved } = resolveRound(ctx);

    // Both cards count as SLA failures.
    expect(summary.failedCount).toBe(2);
    expect(resolved.slaCount).toBe(2);
    // Deck-origin card goes to the discard pile; spawned card does not.
    expect(resolved.trafficDiscardOrder).toContain(cloudCard.id);
    expect(resolved.trafficDiscardOrder).not.toContain(iotCard.id);
  });

  it('spawned cards in overload slots are preserved and not counted as SLA failures', () => {
    const base = safeContext('test-seed', { activePhase: PhaseId.Resolution });
    // Two overload cards: one spawned (exempt), one pre-existing (swept).
    let ctx = ctxWithCardOnSlot(iotCard, Period.Morning, 4, base, SlotType.Overloaded);
    ctx = ctxWithCardOnSlot(cloudCard, Period.Morning, 5, ctx, SlotType.Overloaded);

    const spawnedIds = new Set([iotCard.id]);
    const { summary, context: resolved } = resolveRound(ctx, 1, spawnedIds);

    // Only the non-spawned overload card counts as a failure.
    expect(summary.failedCount).toBe(1);
    expect(resolved.slaCount).toBe(1);
    // Spawned card stays on slot; non-spawned goes to discard.
    expect(resolved.trafficDiscardOrder).toContain(cloudCard.id);
    expect(resolved.trafficDiscardOrder).not.toContain(iotCard.id);
    // Spawned overload slot retained; non-spawned removed.
    expect(resolved.slotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(1);
  });

  it('populates lastRoundSummary', () => {
    const base = safeContext('test-seed', { activePhase: PhaseId.Resolution, pendingRevenue: cloudCard.revenue });
    const ctx = ctxWithCardOnSlot(cloudCard, Period.Morning, 0, base);
    const { summary } = resolveRound(ctx);
    expect(summary.resolvedCount).toBe(1);
    expect(summary.budgetDelta).toBe(cloudCard.revenue);
  });
});

// ─── Ticket expiry ─────────────────────────────────────────────────────────────

/** Build a base context with a 5G Activation ticket that will have a given age at resolution. */
function makeCtxWithAgedTicket(age: number) {
  const issuedRound = 1;
  const currentRound = issuedRound + age;
  const ticket = new FiveGActivationCard('ticket-exp-test');

  const base = safeContext('test-seed', { round: currentRound, activePhase: PhaseId.Resolution });
  return {
    ...base,
    cardInstances: { ...base.cardInstances, [ticket.id]: ticket },
    ticketOrders: { ...base.ticketOrders, [Track.Projects]: [ticket.id] },
    ticketIssuedRound: { [ticket.id]: issuedRound },
  };
}

describe('resolveRound ticket expiry', () => {
  it('does not expire a ticket that still has positive clearRevenue', () => {
    // age=5 → baseRevenue = 60_000 - 5*3_000 = 45_000 > 0
    const ctx = makeCtxWithAgedTicket(5);
    const { context, summary } = resolveRound(ctx);
    expect(summary.expiredTicketCount).toBe(0);
    expect(context.ticketOrders[Track.Projects]).toHaveLength(1);
    expect(context.slaCount).toBe(0);
  });

  it('expires a ticket exactly at the decay boundary (baseRevenue = 0)', () => {
    // age=20 → 60_000 - 20*3_000 = 0 → expiry
    const ctx = makeCtxWithAgedTicket(20);
    const { context, summary } = resolveRound(ctx);
    expect(summary.expiredTicketCount).toBe(1);
    expect(context.ticketOrders[Track.Projects]).toHaveLength(0);
    expect(context.slaCount).toBe(1);
  });

  it('expires a ticket past the boundary (baseRevenue < 0)', () => {
    // age=25 → negative — already expired
    const ctx = makeCtxWithAgedTicket(25);
    const { context, summary } = resolveRound(ctx);
    expect(summary.expiredTicketCount).toBe(1);
    expect(context.slaCount).toBe(1);
  });

  it('moves an expired ticket to eventDiscardOrder', () => {
    const ctx = makeCtxWithAgedTicket(20);
    const { context } = resolveRound(ctx);
    expect(context.eventDiscardOrder).toContain('ticket-exp-test');
    expect(context.ticketIssuedRound['ticket-exp-test']).toBeUndefined();
    expect(context.ticketProgress['ticket-exp-test']).toBeUndefined();
  });

  it('expired ticket SLA combines with overload SLA in newSlaCount', () => {
    const base = makeCtxWithAgedTicket(20);
    const ctx = ctxWithCardOnSlot(iotCard, Period.Morning, 100, base, SlotType.Overloaded);
    const { summary } = resolveRound(ctx);
    // 1 overload + 1 expired → 2 SLA failures this round
    expect(summary.failedCount).toBe(1);
    expect(summary.expiredTicketCount).toBe(1);
    expect(summary.newSlaCount).toBe(2);
  });

  it('does not expire a ticket whose card has no decay (revenueDecayPerRound = 0)', () => {
    // Create a no-decay ticket by manually overriding the card
    const ticket = new FiveGActivationCard('ticket-no-decay');
    // Patch the card to have revenueDecayPerRound = 0 to simulate a zero-decay card
    Object.defineProperty(ticket, 'revenueDecayPerRound', { value: 0 });
    const base = safeContext('test-seed', { round: 99, activePhase: PhaseId.Resolution });
    const ctx = {
      ...base,
      cardInstances: { ...base.cardInstances, [ticket.id]: ticket },
      ticketOrders: { ...base.ticketOrders, [Track.Projects]: [ticket.id] },
      ticketIssuedRound: { [ticket.id]: 1 },
    };
    const { context, summary } = resolveRound(ctx);
    expect(summary.expiredTicketCount).toBe(0);
    expect(context.ticketOrders[Track.Projects]).toHaveLength(1);
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
