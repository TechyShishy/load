import { describe, it, expect } from 'vitest';
import { ManagedServicesAgreementCard } from '../data/vendors/ManagedServicesAgreementCard.js';
import { VENDOR_CARD_REGISTRY, VENDOR_CARDS } from '../data/vendors/index.js';
import { CardType } from '../types.js';
import { safeContext } from './testHelpers.js';

describe('ManagedServicesAgreementCard — static fields', () => {
  const card = new ManagedServicesAgreementCard('msa-test');

  it('has correct templateId', () => {
    expect(card.templateId).toBe('vendor-managed-services-agreement');
  });

  it('has type CardType.Vendor', () => {
    expect(card.type).toBe(CardType.Vendor);
  });

  it('has cost of $30,000', () => {
    expect(card.cost).toBe(30_000);
  });

  it('default constructor gives id === templateId', () => {
    const template = new ManagedServicesAgreementCard();
    expect(template.id).toBe(template.templateId);
  });

  it('constructor instanceId is used as id', () => {
    expect(card.id).toBe('msa-test');
  });
});

describe('ManagedServicesAgreementCard — onResolve', () => {
  it('returns the same context reference when there is no action-spend', () => {
    const ctx = safeContext('msa-no-spend');
    const result = new ManagedServicesAgreementCard('x').onResolve(ctx);
    expect(result).toBe(ctx);
  });

  it('adds 25% of a single action-spend as vendor-revenue', () => {
    const base = safeContext('msa-single');
    const ctx = {
      ...base,
      pendingLedger: [
        { kind: 'action-spend' as const, amount: 20_000, label: 'Bandwidth Upgrade' },
      ],
    };
    const result = new ManagedServicesAgreementCard('x').onResolve(ctx);
    const credit = result.pendingLedger.find((e) => e.kind === 'vendor-revenue');
    expect(credit?.amount).toBe(5_000); // 25% of 20k
    expect(result.budget).toBe(base.budget + 5_000);
  });

  it('sums multiple action-spend entries before applying 25%', () => {
    const base = safeContext('msa-multi');
    const ctx = {
      ...base,
      pendingLedger: [
        { kind: 'action-spend' as const, amount: 20_000, label: 'Bandwidth Upgrade' },
        { kind: 'action-spend' as const, amount: 5_000, label: 'Stream Compression' },
      ],
    };
    const result = new ManagedServicesAgreementCard('x').onResolve(ctx);
    const credit = result.pendingLedger.find((e) => e.kind === 'vendor-revenue');
    expect(credit?.amount).toBe(6_250); // 25% of 25k
    expect(result.budget).toBe(base.budget + 6_250);
  });

  it('ignores non-action-spend ledger entries', () => {
    const base = safeContext('msa-mixed');
    const ctx = {
      ...base,
      pendingLedger: [
        { kind: 'action-spend' as const, amount: 20_000, label: 'Data Center Expansion' },
        { kind: 'traffic-revenue' as const, amount: 15_000, label: 'AI Inference' },
        { kind: 'crisis-penalty' as const, amount: 5_000, label: 'DDoS Attack' },
      ],
    };
    const result = new ManagedServicesAgreementCard('x').onResolve(ctx);
    const credit = result.pendingLedger.find((e) => e.kind === 'vendor-revenue');
    // Only 20k action-spend counts; traffic-revenue and crisis-penalty are ignored
    expect(credit?.amount).toBe(5_000);
    expect(result.budget).toBe(base.budget + 5_000);
  });

  it('preserves all pre-existing ledger entries', () => {
    const base = safeContext('msa-preserve');
    const existing = { kind: 'action-spend' as const, amount: 30_000, label: 'Data Center Expansion' };
    const ctx = { ...base, pendingLedger: [existing] };
    const result = new ManagedServicesAgreementCard('x').onResolve(ctx);
    expect(result.pendingLedger).toContainEqual(existing);
    expect(result.pendingLedger.length).toBe(2); // original + vendor-revenue credit
  });

  it('labels the vendor-revenue entry with the card name', () => {
    const base = safeContext('msa-label');
    const ctx = {
      ...base,
      pendingLedger: [{ kind: 'action-spend' as const, amount: 10_000, label: 'Work Order' }],
    };
    const result = new ManagedServicesAgreementCard('x').onResolve(ctx);
    const credit = result.pendingLedger.find((e) => e.kind === 'vendor-revenue');
    expect(credit?.label).toBe('Managed Services Agreement');
  });

  it('floors fractional credits (25% of odd amounts)', () => {
    const base = safeContext('msa-floor');
    const ctx = {
      ...base,
      pendingLedger: [{ kind: 'action-spend' as const, amount: 10_001, label: 'X' }],
    };
    const result = new ManagedServicesAgreementCard('x').onResolve(ctx);
    const credit = result.pendingLedger.find((e) => e.kind === 'vendor-revenue');
    expect(credit?.amount).toBe(2_500); // Math.floor(10001 * 0.25) = Math.floor(2500.25) = 2500
  });
});

describe('ManagedServicesAgreementCard — registry', () => {
  it('is registered in VENDOR_CARD_REGISTRY', () => {
    expect(VENDOR_CARD_REGISTRY.has('vendor-managed-services-agreement')).toBe(true);
  });

  it('constructs a valid instance from the registry', () => {
    const Ctor = VENDOR_CARD_REGISTRY.get('vendor-managed-services-agreement')!;
    const instance = new Ctor('registry-test-id');
    expect(instance.templateId).toBe('vendor-managed-services-agreement');
    expect(instance.id).toBe('registry-test-id');
  });

  it('is included in VENDOR_CARDS as a template instance', () => {
    const found = VENDOR_CARDS.find((c) => c.templateId === 'vendor-managed-services-agreement');
    expect(found).toBeDefined();
    // Template instance: id === templateId by convention
    expect(found?.id).toBe('vendor-managed-services-agreement');
  });
});
