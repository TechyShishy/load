import { describe, expect, it } from 'vitest';
import { playActionCard } from '../processCrisis.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { TRAFFIC_CARDS, TRAFFIC_CARD_REGISTRY } from '../data/traffic/index.js';
import { ViralTrafficSpikeCard } from '../data/traffic/ViralTrafficSpikeCard.js';
import { FALLBACK_TRAFFIC_DECK } from '../deck.js';
import { getFilledTimeSlots } from '../cardPositionViews.js';
import { Period, PhaseId, SlotType } from '../types.js';
import { safeContext, ctxWithHandCardsFixedIds, ctxWithCardOnSlot } from './testHelpers.js';

const trafficPrio = ACTION_CARDS.find((c) => c.templateId === 'action-traffic-prioritization')!;
const streamComp = ACTION_CARDS.find((c) => c.templateId === 'action-stream-compression')!;

describe('ViralTrafficSpikeCard — fields', () => {
  it('has the expected templateId', () => {
    const card = new ViralTrafficSpikeCard();
    expect(card.templateId).toBe('traffic-viral-spike');
  });

  it('has the expected revenue', () => {
    const card = new ViralTrafficSpikeCard();
    expect(card.revenue).toBe(6_000);
  });

  it('default id matches templateId', () => {
    const card = new ViralTrafficSpikeCard();
    expect(card.id).toBe('traffic-viral-spike');
  });

  it('accepts a custom instance id', () => {
    const card = new ViralTrafficSpikeCard('viral-42');
    expect(card.id).toBe('viral-42');
  });

  it('is findable in TRAFFIC_CARDS', () => {
    const found = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-viral-spike');
    expect(found).toBeDefined();
    expect(found).toBeInstanceOf(ViralTrafficSpikeCard);
  });

  it('is registered in TRAFFIC_CARD_REGISTRY', () => {
    const Ctor = TRAFFIC_CARD_REGISTRY.get('traffic-viral-spike');
    expect(Ctor).toBeDefined();
    const instance = new Ctor!('test-id');
    expect(instance).toBeInstanceOf(ViralTrafficSpikeCard);
    expect(instance.id).toBe('test-id');
  });

  it('is present in FALLBACK_TRAFFIC_DECK with count 2', () => {
    const entry = FALLBACK_TRAFFIC_DECK.find((e) => e.templateId === 'traffic-viral-spike');
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(2);
  });
});

describe('ViralTrafficSpikeCard — onPickUp', () => {
  it('spawns a copy immediately in the next period via Traffic Prioritization', () => {
    const viral = new ViralTrafficSpikeCard('viral-1');
    let ctx = ctxWithHandCardsFixedIds([trafficPrio], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    ctx = ctxWithCardOnSlot(viral, Period.Morning, 0, ctx);

    const updated = playActionCard(ctx, trafficPrio, undefined, viral.id);

    // No deferred queue — copy lands immediately
    expect(updated.spawnedQueueOrder).toHaveLength(0);
    // Copy is in Afternoon (next period after Morning)
    const afternoonSpike = getFilledTimeSlots(updated).find(
      (s) => s.period === Period.Afternoon && s.card?.templateId === 'traffic-viral-spike',
    );
    expect(afternoonSpike).toBeDefined();
    expect(afternoonSpike!.card!.id).not.toBe(viral.id);
  });

  it('revenue is still collected when picked up', () => {
    const viral = new ViralTrafficSpikeCard('viral-1');
    let ctx = ctxWithHandCardsFixedIds([trafficPrio], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    ctx = ctxWithCardOnSlot(viral, Period.Morning, 0, ctx);

    const updated = playActionCard(ctx, trafficPrio, undefined, viral.id);
    expect(updated.budget).toBe(500_000 + viral.revenue);
    expect(updated.pendingRevenue).toBe(viral.revenue);
  });

  it('spawns a copy immediately in the next period via Stream Compression', () => {
    const viral = new ViralTrafficSpikeCard('viral-1');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    ctx = ctxWithCardOnSlot(viral, Period.Morning, 0, ctx);

    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    expect(updated.spawnedQueueOrder).toHaveLength(0);
    const afternoonSpike = getFilledTimeSlots(updated).find(
      (s) => s.period === Period.Afternoon && s.card?.templateId === 'traffic-viral-spike',
    );
    expect(afternoonSpike).toBeDefined();
  });

  it('does not spawn when removed from Overnight (terminal period)', () => {
    const viral = new ViralTrafficSpikeCard('viral-1');
    let ctx = ctxWithHandCardsFixedIds([trafficPrio], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    ctx = ctxWithCardOnSlot(viral, Period.Overnight, 0, ctx);

    const updated = playActionCard(ctx, trafficPrio, undefined, viral.id);

    const anyNewSpike = getFilledTimeSlots(updated).find(
      (s) => s.card?.templateId === 'traffic-viral-spike' && s.card.id !== viral.id,
    );
    expect(anyNewSpike).toBeUndefined();
    expect(updated.spawnedQueueOrder).toHaveLength(0);
  });

  it('creates an overload slot immediately when next period is full', () => {
    const viral = new ViralTrafficSpikeCard('viral-1');
    // Fill all Afternoon slots (indexes 0-3)
    let ctx = ctxWithHandCardsFixedIds([trafficPrio], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    ctx = ctxWithCardOnSlot(viral, Period.Morning, 0, ctx);
    for (let i = 0; i < 4; i++) {
      ctx = ctxWithCardOnSlot(new ViralTrafficSpikeCard(`fill-${i}`), Period.Afternoon, i, ctx);
    }

    const updated = playActionCard(ctx, trafficPrio, undefined, viral.id);

    // Copy is placed directly on an overload slot, visible during scheduling.
    expect(updated.spawnedQueueOrder).toHaveLength(0);
    const overloadSlots = updated.slotLayout.filter((s) => s.slotType === SlotType.Overloaded);
    expect(overloadSlots).toHaveLength(1);
    expect(overloadSlots[0]!.period).toBe(Period.Afternoon);

    const afternoonSpike = getFilledTimeSlots(updated).find(
      (s) =>
        s.period === Period.Afternoon &&
        s.card?.templateId === 'traffic-viral-spike' &&
        s.card.id !== viral.id &&
        !['fill-0', 'fill-1', 'fill-2', 'fill-3'].includes(s.card.id),
    );
    expect(afternoonSpike).toBeDefined();
    expect(afternoonSpike!.overloaded).toBe(true);
  });

  it('SC on two VTS with only one free slot creates one normal + one overloaded copy', () => {
    const viral1 = new ViralTrafficSpikeCard('viral-1');
    const viral2 = new ViralTrafficSpikeCard('viral-2');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    ctx = ctxWithCardOnSlot(viral1, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(viral2, Period.Morning, 1, ctx);
    // Fill Afternoon slots 0-2, leave only slot 3 free
    for (let i = 0; i < 3; i++) {
      ctx = ctxWithCardOnSlot(new ViralTrafficSpikeCard(`fill-${i}`), Period.Afternoon, i, ctx);
    }

    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    // Both copies should be placed (not deferred); one on normal, one on overloaded.
    expect(updated.spawnedQueueOrder).toHaveLength(0);
    const copies = getFilledTimeSlots(updated).filter(
      (s) =>
        s.period === Period.Afternoon &&
        s.card?.templateId === 'traffic-viral-spike' &&
        !['viral-1', 'viral-2', 'fill-0', 'fill-1', 'fill-2'].includes(s.card.id),
    );
    expect(copies).toHaveLength(2);
    expect(copies.filter((c) => !c.overloaded)).toHaveLength(1);
    expect(copies.filter((c) => c.overloaded)).toHaveLength(1);
  });

  it('SC on two VTS with a full next period creates two distinct overload slots', () => {
    const viral1 = new ViralTrafficSpikeCard('viral-1');
    const viral2 = new ViralTrafficSpikeCard('viral-2');
    let ctx = ctxWithHandCardsFixedIds([streamComp], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    ctx = ctxWithCardOnSlot(viral1, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(viral2, Period.Morning, 1, ctx);
    // Fill all 4 Afternoon slots — zero headroom
    for (let i = 0; i < 4; i++) {
      ctx = ctxWithCardOnSlot(new ViralTrafficSpikeCard(`fill-${i}`), Period.Afternoon, i, ctx);
    }

    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    expect(updated.spawnedQueueOrder).toHaveLength(0);
    const overloadSlots = updated.slotLayout.filter(
      (s) => s.period === Period.Afternoon && s.slotType === SlotType.Overloaded,
    );
    // Must be exactly 2 distinct overload slots — not the same index twice
    expect(overloadSlots).toHaveLength(2);
    expect(overloadSlots[0]!.index).not.toBe(overloadSlots[1]!.index);
    // Both copies must be visible and marked overloaded
    const copies = getFilledTimeSlots(updated).filter(
      (s) =>
        s.period === Period.Afternoon &&
        s.card?.templateId === 'traffic-viral-spike' &&
        s.overloaded === true &&
        !['viral-1', 'viral-2', 'fill-0', 'fill-1', 'fill-2', 'fill-3'].includes(s.card.id),
    );
    expect(copies).toHaveLength(2);
  });
});
