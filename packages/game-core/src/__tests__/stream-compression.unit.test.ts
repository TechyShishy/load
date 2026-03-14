import { describe, expect, it } from 'vitest';
import { playActionCard } from '../processCrisis.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { FourKStreamCard } from '../data/traffic/FourKStreamCard.js';
import { IoTBurstCard } from '../data/traffic/IoTBurstCard.js';
import { CloudBackupCard } from '../data/traffic/CloudBackupCard.js';
import { getFilledTimeSlots } from '../cardPositionViews.js';
import { Period, PhaseId } from '../types.js';
import { safeContext, ctxWithHandCardsFixedIds, ctxWithCardOnSlot } from './testHelpers.js';

const streamComp = ACTION_CARDS.find((c) => c.id === 'action-stream-compression')!;

describe('StreamCompressionCard', () => {
  it('is registered and findable in ACTION_CARDS', () => {
    expect(streamComp).toBeDefined();
    expect(streamComp.templateId).toBe('action-stream-compression');
  });

  it('deducts cost from budget', () => {
    const ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);
    expect(updated.budget).toBe(500_000 - streamComp.cost);
  });

  it('removes the card from hand', () => {
    const ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);
    expect(updated.handOrder).not.toContain(streamComp.id);
  });

  it('adds the card to playedThisRound', () => {
    const ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);
    expect(updated.playedThisRoundOrder).toContain(streamComp.id);
  });

  it('removes both duplicate cards when 2 of the same type are in the period', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    ctx = ctxWithCardOnSlot(a, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(b, Period.Morning, 1, ctx);
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = getFilledTimeSlots(updated)
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(morningCards).toHaveLength(0);
  });

  it('collects revenue for both removed cards', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    ctx = ctxWithCardOnSlot(a, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(b, Period.Morning, 1, ctx);
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const expectedBudget = 500_000 - streamComp.cost + a.revenue + b.revenue;
    expect(updated.budget).toBe(expectedBudget);
    expect(updated.pendingRevenue).toBe(a.revenue + b.revenue);
  });

  it('only removes the duplicated type when mixed types are present', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    const iot = new IoTBurstCard('iot-1');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    ctx = ctxWithCardOnSlot(iot, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(a, Period.Morning, 1, ctx);
    ctx = ctxWithCardOnSlot(b, Period.Morning, 2, ctx);
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = getFilledTimeSlots(updated)
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    // IoT is unique (first in order) so iteration skips it; 4K has a duplicate → both 4K removed
    expect(morningCards).toHaveLength(1);
    expect(morningCards[0]!.id).toBe(iot.id);
  });

  it('removes 3 when 4 of the same type exist', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    const c = new FourKStreamCard('4k-c');
    const d = new FourKStreamCard('4k-d');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    ctx = ctxWithCardOnSlot(a, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(b, Period.Morning, 1, ctx);
    ctx = ctxWithCardOnSlot(c, Period.Morning, 2, ctx);
    ctx = ctxWithCardOnSlot(d, Period.Morning, 3, ctx);
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = getFilledTimeSlots(updated)
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(morningCards).toHaveLength(1);
    expect(morningCards[0]!.templateId).toBe('traffic-4k-stream');
  });

  it('targets the most-duplicated type, not the first encountered', () => {
    // IoT×2 appears before 4K×3 in slot order; card should target 4K (max count = 3)
    const a = new IoTBurstCard('iot-a');
    const b = new IoTBurstCard('iot-b');
    const c = new FourKStreamCard('4k-a');
    const d = new FourKStreamCard('4k-b');
    const e = new FourKStreamCard('4k-c');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    ctx = ctxWithCardOnSlot(a, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(b, Period.Morning, 1, ctx);
    ctx = ctxWithCardOnSlot(c, Period.Morning, 2, ctx);
    ctx = ctxWithCardOnSlot(d, Period.Morning, 3, ctx);
    ctx = ctxWithCardOnSlot(e, Period.Morning, 4, ctx);
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = getFilledTimeSlots(updated)
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => (s.card ? [s.card] : []));
    expect(morningCards).toHaveLength(2);
    expect(morningCards.every((card) => card.templateId === 'traffic-iot-burst')).toBe(true);
  });

  it('skips first unique type and removes 2 of the second type when it has a duplicate', () => {
    const iot = new IoTBurstCard('iot-1');
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    ctx = ctxWithCardOnSlot(iot, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(a, Period.Morning, 1, ctx);
    ctx = ctxWithCardOnSlot(b, Period.Morning, 2, ctx);
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = getFilledTimeSlots(updated)
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(morningCards).toHaveLength(1);
    expect(morningCards[0]!.id).toBe(iot.id);
  });

  it('falls back to removing 1 card when all types in the period are unique', () => {
    const iot = new IoTBurstCard('iot-1');
    const fk = new FourKStreamCard('4k-1');
    const cb = new CloudBackupCard('cb-1');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    ctx = ctxWithCardOnSlot(iot, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(fk, Period.Morning, 1, ctx);
    ctx = ctxWithCardOnSlot(cb, Period.Morning, 2, ctx);
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = getFilledTimeSlots(updated)
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    // First card (IoT) removed; the other two remain
    expect(morningCards).toHaveLength(2);
    expect(morningCards.find((c) => c.id === iot.id)).toBeUndefined();
  });

  it('leaves context unchanged when the targeted period is empty', () => {
    const ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = getFilledTimeSlots(updated)
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(morningCards).toHaveLength(0);
    // Budget only decremented by cost; no revenue change
    expect(updated.budget).toBe(500_000 - streamComp.cost);
    expect(updated.pendingRevenue).toBe(0);
  });

  it('is a no-op (other than cost) when targetPeriod is omitted', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    ctx = ctxWithCardOnSlot(a, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(b, Period.Morning, 1, ctx);
    const updated = playActionCard(ctx, streamComp); // no targetPeriod

    const morningCards = getFilledTimeSlots(updated)
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    // Cards untouched; cost still deducted (commit() always runs)
    expect(morningCards).toHaveLength(2);
    expect(updated.budget).toBe(500_000 - streamComp.cost);
  });

  it('leaves context fully unchanged when card is not in hand', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    let ctx = safeContext('test-seed', { activePhase: PhaseId.Crisis });
    ctx = ctxWithCardOnSlot(a, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(b, Period.Morning, 1, ctx);
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    expect(updated.budget).toBe(500_000); // no cost deducted
    const morningCards = getFilledTimeSlots(updated)
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(morningCards).toHaveLength(2);
  });

  it('slot indices are contiguous and zero-based after removing 3 of 4 cards', () => {
    // Regression guard for the stale-slotIndex bug: the removal loop must use
    // live slot positions from trafficSlotPositions, not a pre-loop snapshot.
    // With 4 cards at slots 0-3 where FourKStream is the majority (3 copies),
    // each removal shifts cards above it down by 1. If the loop uses a stale
    // snapshot, the third removal fires shiftTrafficSlotsAfterRemoval at index 2
    // even though the card has already shifted to index 0, leaving the survivor
    // stranded at slotIndex 1 instead of 0.
    const iot = new IoTBurstCard('iot-stay');
    const a   = new FourKStreamCard('4k-a');
    const b   = new FourKStreamCard('4k-b');
    const c   = new FourKStreamCard('4k-c');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    ctx = ctxWithCardOnSlot(iot, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(a,   Period.Morning, 1, ctx);
    ctx = ctxWithCardOnSlot(b,   Period.Morning, 2, ctx);
    ctx = ctxWithCardOnSlot(c,   Period.Morning, 3, ctx);
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const remaining = Object.entries(updated.trafficSlotPositions)
      .filter(([, pos]) => pos.period === Period.Morning);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]![0]).toBe(iot.id);
    // Survivor must be at slot 0. Stale-index bug would leave it at slot 1.
    expect(remaining[0]![1].slotIndex).toBe(0);
  });
});

describe('revenueBoostMultiplier applied by StreamCompressionCard', () => {
  it('multiplies revenue when revenueBoostMultiplier > 1', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Crisis, revenueBoostMultiplier: 1.5 }));
    ctx = ctxWithCardOnSlot(a, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(b, Period.Morning, 1, ctx);
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);
    const expectedRevenue = Math.round((a.revenue + b.revenue) * 1.5);
    expect(updated.budget).toBe(500_000 - streamComp.cost + expectedRevenue);
    expect(updated.pendingRevenue).toBe(expectedRevenue);
  });
});

describe('revenueBoostMultiplier applied by TrafficPrioritizationCard', () => {
  const trafficPrio = ACTION_CARDS.find((c) => c.templateId === 'action-traffic-prioritization')!;

  it('multiplies revenue when revenueBoostMultiplier > 1', () => {
    const iot = new IoTBurstCard('iot-test');
    let ctx = ctxWithHandCardsFixedIds([trafficPrio], safeContext('test-seed', { activePhase: PhaseId.Crisis, revenueBoostMultiplier: 1.5 }));
    ctx = ctxWithCardOnSlot(iot, Period.Morning, 0, ctx);
    const updated = playActionCard(ctx, trafficPrio, undefined, iot.id);
    const expectedRevenue = Math.round(iot.revenue * 1.5);
    expect(updated.budget).toBe(500_000 + expectedRevenue); // cost=0 for trafficPrio
    expect(updated.pendingRevenue).toBe(expectedRevenue);
  });
});

// ─── Spawned card discard-pile exclusion ──────────────────────────────────────

describe('spawned cards do not enter trafficDiscardOrder', () => {
  const trafficPrio = ACTION_CARDS.find((c) => c.templateId === 'action-traffic-prioritization')!;

  it('TrafficPrioritizationCard: spawned card cleared by player disappears, not recycled', () => {
    const iot = new IoTBurstCard('iot-spawned');
    let ctx = ctxWithHandCardsFixedIds([trafficPrio], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    ctx = ctxWithCardOnSlot(iot, Period.Morning, 0, ctx);
    ctx = { ...ctx, spawnedTrafficIds: [iot.id] };

    const updated = playActionCard(ctx, trafficPrio, undefined, iot.id);

    expect(updated.trafficDiscardOrder).not.toContain(iot.id);
    // Revenue still collected.
    expect(updated.budget).toBe(500_000 + iot.revenue);
  });

  it('StreamCompressionCard: spawned card cleared by player disappears, not recycled', () => {
    const a = new FourKStreamCard('4k-spawned-a');
    const b = new FourKStreamCard('4k-spawned-b');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    ctx = ctxWithCardOnSlot(a, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(b, Period.Morning, 1, ctx);
    ctx = { ...ctx, spawnedTrafficIds: [a.id, b.id] };

    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    expect(updated.trafficDiscardOrder).not.toContain(a.id);
    expect(updated.trafficDiscardOrder).not.toContain(b.id);
    // Revenue still collected.
    const expectedRevenue = a.revenue + b.revenue;
    expect(updated.budget).toBe(500_000 - streamComp.cost + expectedRevenue);
  });

  it('TrafficPrioritizationCard: deck-origin card still goes to trafficDiscardOrder', () => {
    const iot = new IoTBurstCard('iot-deck');
    let ctx = ctxWithHandCardsFixedIds([trafficPrio], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    ctx = ctxWithCardOnSlot(iot, Period.Morning, 0, ctx);
    // spawnedTrafficIds is empty — iot is a deck-origin card.

    const updated = playActionCard(ctx, trafficPrio, undefined, iot.id);

    expect(updated.trafficDiscardOrder).toContain(iot.id);
  });
});
