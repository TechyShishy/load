import { describe, expect, it } from 'vitest';
import { playActionCard } from '../processCrisis.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { TRAFFIC_CARDS, TRAFFIC_CARD_REGISTRY } from '../data/traffic/index.js';
import { ViralTrafficSpikeCard } from '../data/traffic/ViralTrafficSpikeCard.js';
import { DEFAULT_TRAFFIC_DECK } from '../deck.js';
import { Period, PhaseId, type GameContext } from '../types.js';

const trafficPrio = ACTION_CARDS.find((c) => c.id === 'action-traffic-prioritization')!;
const streamComp = ACTION_CARDS.find((c) => c.id === 'action-stream-compression')!;

function makeCtx(overrides: Partial<GameContext> = {}): GameContext {
  return {
    budget: 500_000,
    round: 1,
    slaCount: 0,
    hand: [trafficPrio, streamComp],
    playedThisRound: [],
    timeSlots: createInitialTimeSlots(),
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
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: viral };
      return slot;
    });
    const ctx = makeCtx({ timeSlots, hand: [trafficPrio] });

    const updated = playActionCard(ctx, trafficPrio, undefined, viral.id);

    // No deferred queue — copy lands immediately
    expect(updated.spawnedTrafficQueue).toHaveLength(0);
    // Copy is in Afternoon (next period after Morning)
    const afternoonSpike = updated.timeSlots.find(
      (s) => s.period === Period.Afternoon && s.card?.templateId === 'traffic-viral-spike',
    );
    expect(afternoonSpike).toBeDefined();
    expect(afternoonSpike!.card!.id).not.toBe(viral.id);
  });

  it('revenue is still collected when picked up', () => {
    const viral = new ViralTrafficSpikeCard('viral-1');
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: viral };
      return slot;
    });
    const ctx = makeCtx({ timeSlots, hand: [trafficPrio] });

    const updated = playActionCard(ctx, trafficPrio, undefined, viral.id);
    expect(updated.budget).toBe(500_000 + viral.revenue);
    expect(updated.pendingRevenue).toBe(viral.revenue);
  });

  it('spawns a copy immediately in the next period via Stream Compression', () => {
    const viral = new ViralTrafficSpikeCard('viral-1');
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: viral };
      return slot;
    });
    const ctx = makeCtx({ timeSlots, hand: [streamComp] });

    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    expect(updated.spawnedTrafficQueue).toHaveLength(0);
    const afternoonSpike = updated.timeSlots.find(
      (s) => s.period === Period.Afternoon && s.card?.templateId === 'traffic-viral-spike',
    );
    expect(afternoonSpike).toBeDefined();
  });

  it('does not spawn when removed from Overnight (terminal period)', () => {
    const viral = new ViralTrafficSpikeCard('viral-1');
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Overnight && slot.index === 0) return { ...slot, card: viral };
      return slot;
    });
    const ctx = makeCtx({ timeSlots, hand: [trafficPrio] });

    const updated = playActionCard(ctx, trafficPrio, undefined, viral.id);

    const anyNewSpike = updated.timeSlots.find(
      (s) => s.card?.templateId === 'traffic-viral-spike' && s.card.id !== viral.id,
    );
    expect(anyNewSpike).toBeUndefined();
    expect(updated.spawnedTrafficQueue).toHaveLength(0);
  });

  it('creates an overload slot in the next period when all slots are full', () => {
    const viral = new ViralTrafficSpikeCard('viral-1');
    // Fill all Afternoon slots
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: viral };
      if (slot.period === Period.Afternoon) return { ...slot, card: new ViralTrafficSpikeCard(`fill-${slot.index}`) };
      return slot;
    });
    const ctx = makeCtx({ timeSlots, hand: [trafficPrio] });

    const updated = playActionCard(ctx, trafficPrio, undefined, viral.id);

    const overload = updated.timeSlots.find(
      (s) => s.period === Period.Afternoon && s.overloaded === true && s.card?.templateId === 'traffic-viral-spike',
    );
    expect(overload).toBeDefined();
  });
});
