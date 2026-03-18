import { describe, it, expect } from 'vitest';
import { ApplicationDeliveryControllerCard } from '../data/vendors/ApplicationDeliveryControllerCard.js';
import { TierOnePeeringCard } from '../data/events/index.js';
import { VENDOR_CARD_REGISTRY, VENDOR_CARDS } from '../data/vendors/index.js';
import { CardType } from '../types.js';
import { safeContext } from './testHelpers.js';

// ─── ApplicationDeliveryControllerCard — static fields ────────────────────────

describe('ApplicationDeliveryControllerCard — static fields', () => {
  const card = new ApplicationDeliveryControllerCard('adc-test');

  it('has correct templateId', () => {
    expect(card.templateId).toBe('vendor-application-delivery-controller');
  });

  it('has type CardType.Vendor', () => {
    expect(card.type).toBe(CardType.Vendor);
  });

  it('has cost of $45,000', () => {
    expect(card.cost).toBe(45_000);
  });

  it('default constructor gives id === templateId', () => {
    const template = new ApplicationDeliveryControllerCard();
    expect(template.id).toBe(template.templateId);
  });

  it('constructor instanceId is used as id', () => {
    expect(card.id).toBe('adc-test');
  });
});

// ─── ApplicationDeliveryControllerCard — onResolve weekday ───────────────────

describe('ApplicationDeliveryControllerCard — onResolve on a weekday', () => {
  it('increases revenueBoostMultiplier by 0.10 on round 1 (Monday)', () => {
    const ctx = safeContext('adc-weekday', { round: 1, revenueBoostMultiplier: 1.0 });
    const result = new ApplicationDeliveryControllerCard('x').onResolve(ctx);
    expect(result.revenueBoostMultiplier).toBeCloseTo(1.1, 10);
  });

  it('increases revenueBoostMultiplier by 0.10 on round 5 (Friday)', () => {
    const ctx = safeContext('adc-friday', { round: 5, revenueBoostMultiplier: 1.4 });
    const result = new ApplicationDeliveryControllerCard('x').onResolve(ctx);
    expect(result.revenueBoostMultiplier).toBeCloseTo(1.5, 10);
  });

  it('accumulates correctly Mon–Fri from the weekly reset of 1.0', () => {
    const card = new ApplicationDeliveryControllerCard('x');
    let ctx = safeContext('adc-accum', { round: 1, revenueBoostMultiplier: 1.0 });
    const expected = [1.1, 1.2, 1.3, 1.4, 1.5];
    for (let r = 1; r <= 5; r++) {
      ctx = { ...ctx, round: r };
      ctx = card.onResolve(ctx);
      expect(ctx.revenueBoostMultiplier).toBeCloseTo(expected[r - 1]!, 10);
    }
  });

  it('does not mutate the input context', () => {
    const ctx = safeContext('adc-immutable', { round: 2, revenueBoostMultiplier: 1.0 });
    new ApplicationDeliveryControllerCard('x').onResolve(ctx);
    expect(ctx.revenueBoostMultiplier).toBe(1.0);
  });
});

// ─── ApplicationDeliveryControllerCard — onResolve weekend ───────────────────

describe('ApplicationDeliveryControllerCard — onResolve on a weekend', () => {
  it('returns the same context reference on round 6 (Saturday)', () => {
    const ctx = safeContext('adc-sat', { round: 6, revenueBoostMultiplier: 1.5 });
    const result = new ApplicationDeliveryControllerCard('x').onResolve(ctx);
    expect(result).toBe(ctx);
  });

  it('returns the same context reference on round 7 (Sunday)', () => {
    const ctx = safeContext('adc-sun', { round: 7, revenueBoostMultiplier: 1.5 });
    const result = new ApplicationDeliveryControllerCard('x').onResolve(ctx);
    expect(result).toBe(ctx);
  });

  it('does not change revenueBoostMultiplier on a weekend', () => {
    const ctx = safeContext('adc-wknd-mult', { round: 6, revenueBoostMultiplier: 1.3 });
    const result = new ApplicationDeliveryControllerCard('x').onResolve(ctx);
    expect(result.revenueBoostMultiplier).toBe(1.3);
  });
});

// ─── Stacking: ADC + Tier-1 Peering ─────────────────────────────────────────

describe('ApplicationDeliveryControllerCard — stacking with TierOnePeeringCard', () => {
  it('ADC + Tier-1 both add their bonuses additively', () => {
    const adc = new ApplicationDeliveryControllerCard('x');
    const t1p = new TierOnePeeringCard('y');
    // Suppose ADC has already pushed multiplier to 1.3 (3 weekday rounds of ramp)
    const ctx = safeContext('adc-t1p-stack', { round: 4, revenueBoostMultiplier: 1.3 });
    // Tier-1 fires in crisis (+0.5 additive): 1.3 → 1.8
    const afterCrisis = t1p.onCrisis(ctx, false);
    expect(afterCrisis.revenueBoostMultiplier).toBeCloseTo(1.8, 10);
    // ADC fires in resolution (+0.10 on Thursday): 1.8 → 1.9
    const afterResolve = adc.onResolve(afterCrisis);
    expect(afterResolve.revenueBoostMultiplier).toBeCloseTo(1.9, 10);
  });

  it('Tier-1 never reduces an ADC-elevated multiplier', () => {
    // If ADC has pushed multiplier past 1.5 (e.g. 1.6), Tier-1 should still ADD +0.5
    const t1p = new TierOnePeeringCard('y');
    const ctx = safeContext('adc-t1p-nodrop', { round: 5, revenueBoostMultiplier: 1.6 });
    const result = t1p.onCrisis(ctx, false);
    expect(result.revenueBoostMultiplier).toBeCloseTo(2.1, 10);
  });
});

// ─── ApplicationDeliveryControllerCard — registration ────────────────────────

describe('ApplicationDeliveryControllerCard — registration', () => {
  it('is present in VENDOR_CARDS', () => {
    const found = VENDOR_CARDS.find((c) => c.templateId === 'vendor-application-delivery-controller');
    expect(found).toBeDefined();
  });

  it('is in VENDOR_CARD_REGISTRY and constructable', () => {
    const Ctor = VENDOR_CARD_REGISTRY.get('vendor-application-delivery-controller');
    expect(Ctor).toBeDefined();
    const instance = new Ctor!('test-id');
    expect(instance.templateId).toBe('vendor-application-delivery-controller');
  });
});
