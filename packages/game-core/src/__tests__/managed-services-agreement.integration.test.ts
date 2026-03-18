import { describe, expect, it } from 'vitest';
import { resolveRound } from '../resolveRound.js';
import { ManagedServicesAgreementCard } from '../data/vendors/ManagedServicesAgreementCard.js';
import { safeContext } from './testHelpers.js';

describe('integration: ManagedServicesAgreementCard through resolveRound', () => {
  it('vendor-revenue credit appears in summary.ledger and is included in budgetDelta', () => {
    const msaCard = new ManagedServicesAgreementCard('msa-int-1');
    const base = safeContext('msa-int-test');
    // Simulate a round where the player spent $20k on action cards (budget already deducted)
    // and the pendingLedger holds the matching action-spend entry.
    const ctx = {
      ...base,
      budget: base.budget - 20_000,
      vendorSlots: base.vendorSlots.map((s) => s.index === 0 ? { ...s, card: msaCard } : s),
      pendingLedger: [
        { kind: 'action-spend' as const, amount: 20_000, label: 'Bandwidth Upgrade' },
      ],
    };

    const { context, summary } = resolveRound(ctx);

    // Phase: summary must reference the same round (guards against infinite-loop bugs)
    expect(summary.round).toBe(ctx.round);

    // Vendor credit appears in the round ledger
    const credit = summary.ledger.find((e) => e.kind === 'vendor-revenue');
    expect(credit).toBeDefined();
    expect(credit?.amount).toBe(5_000); // 25% of 20k
    expect(credit?.label).toBe('Managed Services Agreement');

    // budgetDelta correctly nets action-spend against vendor-revenue: -20k + 5k = -15k
    expect(summary.budgetDelta).toBe(-15_000);

    // Final budget reflects both the pre-deducted spend and the vendor credit
    expect(context.budget).toBe(base.budget - 20_000 + 5_000);
  });

  it('zero credit when no action-spend ledger entries are present', () => {
    const msaCard = new ManagedServicesAgreementCard('msa-int-2');
    const base = safeContext('msa-int-noop');
    const ctx = {
      ...base,
      vendorSlots: base.vendorSlots.map((s) => s.index === 0 ? { ...s, card: msaCard } : s),
      pendingLedger: [
        { kind: 'traffic-revenue' as const, amount: 10_000, label: 'AI Inference' },
      ],
    };

    const { summary } = resolveRound(ctx);

    const credit = summary.ledger.find((e) => e.kind === 'vendor-revenue');
    expect(credit).toBeUndefined();
    expect(summary.budgetDelta).toBe(10_000); // only traffic-revenue
  });
});
