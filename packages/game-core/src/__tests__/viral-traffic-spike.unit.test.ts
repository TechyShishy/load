import { describe, expect, it } from 'vitest';
import { playActionCard } from '../processCrisis.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { TRAFFIC_CARDS, TRAFFIC_CARD_REGISTRY } from '../data/traffic/index.js';
import { ViralTrafficSpikeCard } from '../data/traffic/ViralTrafficSpikeCard.js';
import { DEFAULT_TRAFFIC_DECK } from '../deck.js';
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

  it('is present in DEFAULT_TRAFFIC_DECK with count 2', () => {
    const entry = DEFAULT_TRAFFIC_DECK.find((e) => e.templateId === 'traffic-viral-spike');
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

  it('defers copy to spawned queue when next period is full', () => {
    const viral = new ViralTrafficSpikeCard('viral-1');
    // Fill all Afternoon slots (indexes 0-3)
    let ctx = ctxWithHandCardsFixedIds([trafficPrio], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    ctx = ctxWithCardOnSlot(viral, Period.Morning, 0, ctx);
    for (let i = 0; i < 4; i++) {
      ctx = ctxWithCardOnSlot(new ViralTrafficSpikeCard(`fill-${i}`), Period.Afternoon, i, ctx);
    }

    const updated = playActionCard(ctx, trafficPrio, undefined, viral.id);

    // When Afternoon is full, the copy is deferred to spawnedQueueOrder
    // (overload slot created lazily during resolution, not immediately).
    expect(updated.spawnedQueueOrder).toHaveLength(1);
    expect(updated.slotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
  });
});
