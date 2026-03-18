import { describe, it, expect } from 'vitest';
import { ContentDeliveryNetworkCard } from '../data/vendors/ContentDeliveryNetworkCard.js';
import { VENDOR_CARD_REGISTRY, VENDOR_CARDS } from '../data/vendors/index.js';
import { AiInferenceCard } from '../data/traffic/index.js';
import { IoTBurstCard } from '../data/traffic/index.js';
import { CardType, Period, SlotType } from '../types.js';
import { safeContext, ctxWithCardOnSlot } from './testHelpers.js';

// ─── ContentDeliveryNetworkCard — static fields ───────────────────────────────

describe('ContentDeliveryNetworkCard — static fields', () => {
  const card = new ContentDeliveryNetworkCard('cdn-test');

  it('has correct templateId', () => {
    expect(card.templateId).toBe('vendor-content-delivery-network');
  });

  it('has type CardType.Vendor', () => {
    expect(card.type).toBe(CardType.Vendor);
  });

  it('has cost of $55,000', () => {
    expect(card.cost).toBe(55_000);
  });

  it('default constructor gives id === templateId', () => {
    const template = new ContentDeliveryNetworkCard();
    expect(template.id).toBe(template.templateId);
  });

  it('constructor instanceId is used as id', () => {
    expect(card.id).toBe('cdn-test');
  });
});

// ─── ContentDeliveryNetworkCard — onResolve: empty board ─────────────────────

describe('ContentDeliveryNetworkCard — onResolve on empty board', () => {
  it('returns the same context reference when no traffic is on the board', () => {
    const ctx = safeContext('cdn-empty');
    const result = new ContentDeliveryNetworkCard('x').onResolve(ctx);
    expect(result).toBe(ctx);
  });
});

// ─── ContentDeliveryNetworkCard — onResolve: single card ─────────────────────

describe('ContentDeliveryNetworkCard — onResolve with one card on board', () => {
  it('clears the only card and earns 75% of its revenue', () => {
    const traffic = new AiInferenceCard('ai-1'); // revenue = 10_000
    const base = safeContext('cdn-single');
    const ctx = ctxWithCardOnSlot(traffic, Period.Morning, 0, base);

    const result = new ContentDeliveryNetworkCard('x').onResolve(ctx);

    expect(result.trafficSlotPositions['ai-1']).toBeUndefined();
    expect(result.trafficDiscardOrder).toContain('ai-1');
    // 75% of 10_000 = 7_500
    expect(result.budget).toBe(base.budget + 7_500);
    const entry = result.pendingLedger.find((e) => e.kind === 'vendor-revenue');
    expect(entry?.amount).toBe(7_500);
    expect(entry?.label).toBe('AI Model Inference');
  });

  it('does not mutate the input context', () => {
    const traffic = new AiInferenceCard('ai-immutable');
    const base = safeContext('cdn-immutable');
    const ctx = ctxWithCardOnSlot(traffic, Period.Morning, 0, base);
    const before = ctx.budget;
    new ContentDeliveryNetworkCard('x').onResolve(ctx);
    expect(ctx.budget).toBe(before);
    expect(ctx.trafficSlotPositions['ai-immutable']).toBeDefined();
  });
});

// ─── ContentDeliveryNetworkCard — onResolve: picks most congested period ─────

describe('ContentDeliveryNetworkCard — onResolve picks most congested period', () => {
  it('clears from the period with more cards', () => {
    const traffic1 = new IoTBurstCard('iot-1'); // Morning — revenue 3k
    const traffic2 = new AiInferenceCard('ai-2'); // Afternoon — revenue 10k
    const traffic3 = new AiInferenceCard('ai-3'); // Afternoon — revenue 10k
    const base = safeContext('cdn-congested');
    let ctx = ctxWithCardOnSlot(traffic1, Period.Morning, 0, base);
    ctx = ctxWithCardOnSlot(traffic2, Period.Afternoon, 0, ctx);
    ctx = ctxWithCardOnSlot(traffic3, Period.Afternoon, 1, ctx);

    // Afternoon has 2 cards, Morning has 1 → CDN should clear from Afternoon
    const result = new ContentDeliveryNetworkCard('x').onResolve(ctx);

    expect(result.trafficSlotPositions['iot-1']).toBeDefined(); // Morning untouched
    // One Afternoon card cleared (the highest-revenue one; both are 10k so either is valid)
    const remainingAfternoon = Object.values(result.trafficSlotPositions).filter(
      (pos) => pos.period === Period.Afternoon,
    ).length;
    expect(remainingAfternoon).toBe(1);
  });

  it('clears the highest-revenue card when multiple cards are in the congested period', () => {
    const highValue = new AiInferenceCard('ai-high'); // revenue 10k
    const lowValue = new IoTBurstCard('iot-low');     // revenue 3k
    const base = safeContext('cdn-highest');
    let ctx = ctxWithCardOnSlot(highValue, Period.Evening, 0, base);
    ctx = ctxWithCardOnSlot(lowValue, Period.Evening, 1, ctx);

    const result = new ContentDeliveryNetworkCard('x').onResolve(ctx);

    // High-value card cleared, low-value card remains
    expect(result.trafficSlotPositions['ai-high']).toBeUndefined();
    expect(result.trafficSlotPositions['iot-low']).toBeDefined();
    // 75% of 10_000 = 7_500
    expect(result.pendingLedger.find((e) => e.kind === 'vendor-revenue')?.amount).toBe(7_500);
  });
});

// ─── ContentDeliveryNetworkCard — onResolve: revenue multiplier ───────────────

describe('ContentDeliveryNetworkCard — onResolve respects revenueBoostMultiplier', () => {
  it('applies the multiplier to the 75% base revenue', () => {
    const traffic = new AiInferenceCard('ai-mult');
    const base = safeContext('cdn-mult', { revenueBoostMultiplier: 1.5 });
    const ctx = ctxWithCardOnSlot(traffic, Period.Morning, 0, base);

    const result = new ContentDeliveryNetworkCard('x').onResolve(ctx);

    // Math.round(10_000 * 0.75 * 1.5) = Math.round(11_250) = 11_250
    const entry = result.pendingLedger.find((e) => e.kind === 'vendor-revenue');
    expect(entry?.amount).toBe(11_250);
  });
});

// ─── ContentDeliveryNetworkCard — onResolve: spawned card handling ────────────

describe('ContentDeliveryNetworkCard — onResolve: spawned cards', () => {
  it('does NOT add a spawned card to trafficDiscardOrder', () => {
    const traffic = new AiInferenceCard('ai-spawned');
    const base = safeContext('cdn-spawned');
    const ctx = {
      ...ctxWithCardOnSlot(traffic, Period.Morning, 0, base),
      spawnedTrafficIds: ['ai-spawned'],
    };

    const result = new ContentDeliveryNetworkCard('x').onResolve(ctx);

    expect(result.trafficSlotPositions['ai-spawned']).toBeUndefined(); // cleared
    expect(result.trafficDiscardOrder).not.toContain('ai-spawned');    // not recycled
  });

  it('adds a non-spawned card to trafficDiscardOrder', () => {
    const traffic = new AiInferenceCard('ai-deck');
    const base = safeContext('cdn-deck');
    const ctx = ctxWithCardOnSlot(traffic, Period.Morning, 0, base);

    const result = new ContentDeliveryNetworkCard('x').onResolve(ctx);

    expect(result.trafficDiscardOrder).toContain('ai-deck');
  });
});

// ─── ContentDeliveryNetworkCard — onResolve: skips overloaded cards ───────────

describe('ContentDeliveryNetworkCard — onResolve: overloaded card exclusion', () => {
  it('does not count or clear an overloaded card', () => {
    // One overloaded card in Morning, one normal card in Afternoon
    const overloaded = new AiInferenceCard('ai-overloaded');
    const normal = new IoTBurstCard('iot-normal');
    const base = safeContext('cdn-overload');
    let ctx = ctxWithCardOnSlot(overloaded, Period.Morning, 0, base, SlotType.Overloaded);
    ctx = ctxWithCardOnSlot(normal, Period.Afternoon, 0, ctx);

    const result = new ContentDeliveryNetworkCard('x').onResolve(ctx);

    // The overloaded card should be untouched (CDN ignores it)
    expect(result.trafficSlotPositions['ai-overloaded']).toBeDefined();
    // The normal Afternoon card should be cleared (only non-overloaded card)
    expect(result.trafficSlotPositions['iot-normal']).toBeUndefined();
  });
});

// ─── ContentDeliveryNetworkCard — registration ───────────────────────────────

describe('ContentDeliveryNetworkCard — registration', () => {
  it('is present in VENDOR_CARDS', () => {
    const found = VENDOR_CARDS.find((c) => c.templateId === 'vendor-content-delivery-network');
    expect(found).toBeDefined();
  });

  it('is in VENDOR_CARD_REGISTRY and constructable', () => {
    const Ctor = VENDOR_CARD_REGISTRY.get('vendor-content-delivery-network');
    expect(Ctor).toBeDefined();
    const instance = new Ctor!('test-id');
    expect(instance.templateId).toBe('vendor-content-delivery-network');
  });
});
