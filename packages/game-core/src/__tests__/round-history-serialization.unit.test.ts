import { describe, expect, it } from 'vitest';
import { dehydrateContext, hydrateContext } from '../serialization.js';
import { createInitialContext } from '../machine.js';
import type { RoundSummary } from '../types.js';
import { safeContext } from './testHelpers.js';

const EXAMPLE_SUMMARY: RoundSummary = {
  round: 1,
  budgetDelta: 150_000,
  newSlaCount: 0,
  resolvedCount: 3,
  failedCount: 0,
  forgivenCount: 0,
  spawnedTrafficCount: 0,
  expiredTicketCount: 0,
  ledger: [],
};

describe('roundHistory serialization', () => {
  it('dehydrateContext preserves roundHistory entries', () => {
    const ctx = createInitialContext('ser-test');
    const withHistory = { ...ctx, roundHistory: [EXAMPLE_SUMMARY] };
    const serialized = dehydrateContext(withHistory);
    expect(serialized.roundHistory).toHaveLength(1);
    expect(serialized.roundHistory[0]).toEqual(EXAMPLE_SUMMARY);
  });

  it('hydrateContext restores roundHistory after a round-trip', () => {
    const ctx = createInitialContext('ser-roundtrip');
    const summary2: RoundSummary = { ...EXAMPLE_SUMMARY, round: 2, budgetDelta: -20_000 };
    const withHistory = { ...ctx, roundHistory: [EXAMPLE_SUMMARY, summary2] };

    const serialized = dehydrateContext(withHistory);
    const restored = hydrateContext(serialized);

    expect(restored).not.toBeNull();
    expect(restored!.roundHistory).toHaveLength(2);
    expect(restored!.roundHistory[0]).toEqual(EXAMPLE_SUMMARY);
    expect(restored!.roundHistory[1]).toEqual(summary2);
  });

  it('hydrateContext defaults roundHistory to [] when field is absent (backward compat)', () => {
    const ctx = safeContext('compat-test');
    const serialized = dehydrateContext(ctx);
    // Simulate a pre-roundHistory save by removing the field
    const { roundHistory: _omit, ...legacySave } = serialized;
    const restored = hydrateContext(legacySave as typeof serialized);
    expect(restored).not.toBeNull();
    expect(restored!.roundHistory).toEqual([]);
  });
});
