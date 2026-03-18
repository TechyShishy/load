import { describe, it, expect } from 'vitest';
import { HighAvailabilityFailoverClusterCard } from '../data/vendors/HighAvailabilityFailoverClusterCard.js';
import { VENDOR_CARD_REGISTRY, VENDOR_CARDS } from '../data/vendors/index.js';
import { CardType } from '../types.js';
import { safeContext } from './testHelpers.js';

// ─── HighAvailabilityFailoverClusterCard — static fields ─────────────────────

describe('HighAvailabilityFailoverClusterCard — static fields', () => {
  const card = new HighAvailabilityFailoverClusterCard('ha-test');

  it('has correct templateId', () => {
    expect(card.templateId).toBe('vendor-high-availability-failover-cluster');
  });

  it('has type CardType.Vendor', () => {
    expect(card.type).toBe(CardType.Vendor);
  });

  it('has cost of $50,000', () => {
    expect(card.cost).toBe(50_000);
  });

  it('default constructor gives id === templateId', () => {
    const template = new HighAvailabilityFailoverClusterCard();
    expect(template.id).toBe(template.templateId);
  });

  it('constructor instanceId is used as id', () => {
    expect(card.id).toBe('ha-test');
  });
});

// ─── HighAvailabilityFailoverClusterCard — onCrisis ──────────────────────────

describe('HighAvailabilityFailoverClusterCard — onCrisis', () => {
  it('increments slaForgivenessThisRound by 1', () => {
    const ctx = safeContext('ha-crisis');
    const card = new HighAvailabilityFailoverClusterCard('ha-unit-1');
    const result = card.onCrisis!(ctx);
    expect(result.slaForgivenessThisRound).toBe(ctx.slaForgivenessThisRound + 1);
  });

  it('does not mutate the input context', () => {
    const ctx = safeContext('ha-immutable');
    const before = ctx.slaForgivenessThisRound;
    const card = new HighAvailabilityFailoverClusterCard('ha-unit-2');
    card.onCrisis!(ctx);
    expect(ctx.slaForgivenessThisRound).toBe(before);
  });

  it('two instances stack: slaForgivenessThisRound increments by 2', () => {
    const ctx = safeContext('ha-stack');
    const card1 = new HighAvailabilityFailoverClusterCard('ha-unit-3a');
    const card2 = new HighAvailabilityFailoverClusterCard('ha-unit-3b');
    const after1 = card1.onCrisis!(ctx);
    const after2 = card2.onCrisis!(after1);
    expect(after2.slaForgivenessThisRound).toBe(ctx.slaForgivenessThisRound + 2);
  });

  it('does not touch budget or ledger', () => {
    const ctx = safeContext('ha-budget');
    const card = new HighAvailabilityFailoverClusterCard('ha-unit-4');
    const result = card.onCrisis!(ctx);
    expect(result.budget).toBe(ctx.budget);
    expect(result.pendingLedger).toEqual(ctx.pendingLedger);
  });
});

// ─── HighAvailabilityFailoverClusterCard — onResolve ─────────────────────────

describe('HighAvailabilityFailoverClusterCard — onResolve', () => {
  it('is a no-op: returns the exact same context reference', () => {
    const ctx = safeContext('ha-resolve');
    const card = new HighAvailabilityFailoverClusterCard('ha-unit-5');
    const result = card.onResolve(ctx);
    expect(result).toBe(ctx);
  });
});

// ─── HighAvailabilityFailoverClusterCard — registry ──────────────────────────

describe('HighAvailabilityFailoverClusterCard — registry', () => {
  it('is present in VENDOR_CARD_REGISTRY', () => {
    expect(VENDOR_CARD_REGISTRY.has('vendor-high-availability-failover-cluster')).toBe(true);
  });

  it('registry entry is constructable with instanceId', () => {
    const Ctor = VENDOR_CARD_REGISTRY.get('vendor-high-availability-failover-cluster')!;
    const instance = new Ctor('ha-reg-test');
    expect(instance.id).toBe('ha-reg-test');
    expect(instance.templateId).toBe('vendor-high-availability-failover-cluster');
  });

  it('is present in VENDOR_CARDS template list', () => {
    const found = VENDOR_CARDS.find(
      (c) => c.templateId === 'vendor-high-availability-failover-cluster',
    );
    expect(found).toBeDefined();
  });
});
