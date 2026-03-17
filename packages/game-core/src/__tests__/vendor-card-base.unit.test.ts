import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { dehydrateContext, hydrateContext } from '../serialization.js';
import { VENDOR_CARD_REGISTRY } from '../data/vendors/index.js';
import { CardType, VendorCard, type GameContext } from '../types.js';
import { safeContext } from './testHelpers.js';

// ─── Minimal concrete VendorCard for testing ──────────────────────────────────

class MockVendorCard extends VendorCard {
  readonly templateId = 'vendor-mock';
  readonly id: string;
  readonly name = 'Mock Vendor';
  readonly cost = 5_000;
  readonly description = 'A mock vendor card for testing.';

  constructor(instanceId: string) {
    super();
    this.id = instanceId;
  }

  onResolve(ctx: GameContext): GameContext {
    return ctx;
  }
}

// Register for deserialization tests; clean up after this suite.
VENDOR_CARD_REGISTRY.set('vendor-mock', MockVendorCard);
afterAll(() => { VENDOR_CARD_REGISTRY.delete('vendor-mock'); });

// ─── VendorCard base class ────────────────────────────────────────────────────

describe('VendorCard — type field', () => {
  it('has type CardType.Vendor', () => {
    const card = new MockVendorCard('test-id');
    expect(card.type).toBe(CardType.Vendor);
  });

  it('exposes templateId and id', () => {
    const card = new MockVendorCard('inst-abc');
    expect(card.templateId).toBe('vendor-mock');
    expect(card.id).toBe('inst-abc');
  });
});

// ─── Serialization roundtrip ──────────────────────────────────────────────────

describe('VendorCard — serialization roundtrip', () => {
  let baseCtx: GameContext;

  beforeEach(() => {
    baseCtx = safeContext();
  });

  it('roundtrips a slot with card: null unchanged', () => {
    const serialized = dehydrateContext(baseCtx);
    expect(serialized.vendorSlots[0]?.card).toBeNull();

    const restored = hydrateContext(serialized);
    expect(restored).not.toBeNull();
    expect(restored!.vendorSlots[0]?.card).toBeNull();
  });

  it('roundtrips a slot holding a VendorCard instance', () => {
    const card = new MockVendorCard('vendor-instance-1');
    const ctxWithCard: GameContext = {
      ...baseCtx,
      cardInstances: { ...baseCtx.cardInstances, [card.id]: card },
      vendorSlots: [{ index: 0, card }],
    };

    const serialized = dehydrateContext(ctxWithCard);
    expect(serialized.cardTemplateIds['vendor-instance-1']).toBe('vendor-mock');
    expect(serialized.vendorSlots[0]?.card).toEqual({
      templateId: 'vendor-mock',
      instanceId: 'vendor-instance-1',
    });

    const restored = hydrateContext(serialized);
    expect(restored).not.toBeNull();
    const restoredCard = restored!.vendorSlots[0]?.card;
    expect(restoredCard).not.toBeNull();
    expect(restoredCard!.templateId).toBe('vendor-mock');
    expect(restoredCard!.id).toBe('vendor-instance-1');
    expect(restoredCard!.type).toBe(CardType.Vendor);
    // The card is also present in cardInstances (required for sub-issue B hand rendering).
    expect(restored!.cardInstances['vendor-instance-1']).toBe(restoredCard);
  });

  it('returns null when a vendor card templateId is unresolvable', () => {
    const serialized = dehydrateContext(baseCtx);
    // Corrupted save: both cardTemplateIds and vendorSlots reference an unknown templateId.
    const corrupted = {
      ...serialized,
      cardTemplateIds: { ...serialized.cardTemplateIds, 'x': 'vendor-does-not-exist' },
      vendorSlots: [{ index: 0, card: { templateId: 'vendor-does-not-exist', instanceId: 'x' } }],
    };

    const result = hydrateContext(corrupted);
    expect(result).toBeNull();
  });

  it('returns null when a slot instanceId is absent from cardInstances', () => {
    const serialized = dehydrateContext(baseCtx);
    // Slot references an instanceId that was never registered in cardTemplateIds.
    const corrupted = {
      ...serialized,
      vendorSlots: [{ index: 0, card: { templateId: 'vendor-mock', instanceId: 'orphan-id' } }],
    };

    const result = hydrateContext(corrupted);
    expect(result).toBeNull();
  });
});
