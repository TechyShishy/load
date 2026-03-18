import { describe, expect, it } from 'vitest';
import { processCrisis } from '../processCrisis.js';
import { resolveRound } from '../resolveRound.js';
import { HighAvailabilityFailoverClusterCard } from '../data/vendors/HighAvailabilityFailoverClusterCard.js';
import { AiInferenceCard } from '../data/traffic/index.js';
import { FiveGActivationCard } from '../data/events/index.js';
import { Period, SlotType, Track } from '../types.js';
import { safeContext, ctxWithCardOnSlot } from './testHelpers.js';

function withHa(
  haCard: HighAvailabilityFailoverClusterCard,
  base: ReturnType<typeof safeContext>,
) {
  return {
    ...base,
    vendorSlots: base.vendorSlots.map((s) => (s.index === 0 ? { ...s, card: haCard } : s)),
  };
}

describe('integration: HighAvailabilityFailoverClusterCard absorbs SLA failures', () => {
  it('one overloaded card with HA installed → slaCount unchanged', () => {
    const haCard = new HighAvailabilityFailoverClusterCard('ha-int-1');
    const traffic = new AiInferenceCard('ai-int-1');
    const base = safeContext('ha-int-one');
    const ctx = withHa(haCard, ctxWithCardOnSlot(traffic, Period.Morning, 0, base, SlotType.Overloaded));

    const { context: afterCrisis } = processCrisis(ctx);
    expect(afterCrisis.slaForgivenessThisRound).toBe(1);

    const { context, summary } = resolveRound(afterCrisis);
    expect(summary.failedCount).toBe(1);
    expect(summary.forgivenCount).toBe(1);
    expect(context.slaCount).toBe(base.slaCount); // net zero
  });

  it('two overloaded cards with HA → slaCount increases by 1 (one forgiven)', () => {
    const haCard = new HighAvailabilityFailoverClusterCard('ha-int-2');
    const t1 = new AiInferenceCard('ai-int-2a');
    const t2 = new AiInferenceCard('ai-int-2b');
    const base = safeContext('ha-int-two');
    let ctx = ctxWithCardOnSlot(t1, Period.Morning, 0, base, SlotType.Overloaded);
    ctx = ctxWithCardOnSlot(t2, Period.Afternoon, 0, ctx, SlotType.Overloaded);
    ctx = withHa(haCard, ctx);

    const { context: afterCrisis } = processCrisis(ctx);
    const { context, summary } = resolveRound(afterCrisis);
    expect(summary.failedCount).toBe(2);
    expect(summary.forgivenCount).toBe(1);
    expect(context.slaCount).toBe(base.slaCount + 1);
  });

  it('one overloaded card without HA → slaCount increases by 1', () => {
    const traffic = new AiInferenceCard('ai-int-3');
    const base = safeContext('ha-int-no-ha');
    const ctx = ctxWithCardOnSlot(traffic, Period.Morning, 0, base, SlotType.Overloaded);

    const { context: afterCrisis } = processCrisis(ctx);
    const { context, summary } = resolveRound(afterCrisis);
    expect(summary.failedCount).toBe(1);
    expect(summary.forgivenCount).toBe(0);
    expect(context.slaCount).toBe(base.slaCount + 1);
  });

  it('slaForgivenessThisRound resets to 0 after resolveRound', () => {
    const haCard = new HighAvailabilityFailoverClusterCard('ha-int-4');
    const base = safeContext('ha-int-reset');
    const ctx = withHa(haCard, base);

    const { context: afterCrisis } = processCrisis(ctx);
    const { context } = resolveRound(afterCrisis);
    expect(context.slaForgivenessThisRound).toBe(0);
  });

  it('absorbs an expired-ticket SLA failure (not just overloaded slots)', () => {
    // FiveGActivationCard: clearRevenue=60k, revenueDecayPerRound=3k → expires after 20 rounds of age.
    // Set issuedRound=1, ctx.round=21 → age=20 → baseRevenue=0 → expired in resolveRound.
    const haCard = new HighAvailabilityFailoverClusterCard('ha-int-5');
    const ticket = new FiveGActivationCard('5g-int-test');
    const base = safeContext('ha-int-ticket', { round: 21 });
    const ctx = withHa(haCard, {
      ...base,
      cardInstances: { ...base.cardInstances, [ticket.id]: ticket },
      ticketOrders: { ...base.ticketOrders, [Track.Projects]: [ticket.id] },
      ticketIssuedRound: { ...base.ticketIssuedRound, [ticket.id]: 1 },
    });

    // processCrisis fires the HA vendor hook → slaForgivenessThisRound = 1
    const { context: afterCrisis } = processCrisis(ctx);
    expect(afterCrisis.slaForgivenessThisRound).toBe(1);

    // resolveRound finds the expired ticket → expiredTicketCount=1 → forgivenCount=1 → no net SLA hit
    const { context, summary } = resolveRound(afterCrisis);
    expect(summary.expiredTicketCount).toBe(1);
    expect(summary.forgivenCount).toBe(1);
    expect(context.slaCount).toBe(base.slaCount);
  });
});
