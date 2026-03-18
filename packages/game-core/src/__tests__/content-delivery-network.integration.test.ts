import { describe, expect, it } from 'vitest';
import { resolveRound } from '../resolveRound.js';
import { ContentDeliveryNetworkCard } from '../data/vendors/ContentDeliveryNetworkCard.js';
import { ApplicationDeliveryControllerCard } from '../data/vendors/ApplicationDeliveryControllerCard.js';
import { AiInferenceCard } from '../data/traffic/index.js';
import { IoTBurstCard } from '../data/traffic/index.js';
import { Period } from '../types.js';
import { safeContext, ctxWithCardOnSlot } from './testHelpers.js';

describe('integration: ContentDeliveryNetworkCard through resolveRound', () => {
  it('cleared card is absent from post-resolution trafficSlotPositions', () => {
    const cdnCard = new ContentDeliveryNetworkCard('cdn-int-1');
    const traffic = new AiInferenceCard('ai-int-1'); // $10k revenue
    const base = safeContext('cdn-int-clear');
    const ctx = {
      ...ctxWithCardOnSlot(traffic, Period.Morning, 0, base),
      vendorSlots: base.vendorSlots.map((s) => s.index === 0 ? { ...s, card: cdnCard } : s),
    };

    const { context, summary } = resolveRound(ctx);

    expect(summary.round).toBe(ctx.round);
    // Card is gone from the board
    expect(context.trafficSlotPositions['ai-int-1']).toBeUndefined();
    // Card was recycled to discard
    expect(context.trafficDiscardOrder).toContain('ai-int-1');
    // 75% of $10k = $7,500 appears as vendor-revenue in the ledger
    const entry = summary.ledger.find((e) => e.kind === 'vendor-revenue');
    expect(entry).toBeDefined();
    expect(entry?.amount).toBe(7_500);
    // budgetDelta includes the CDN credit
    expect(summary.budgetDelta).toBe(7_500);
    // budget is actually mutated (ledger entry and budget mutation are independent paths)
    expect(context.budget).toBe(base.budget + 7_500);
  });

  it('clears the highest-revenue card from the most congested period', () => {
    const cdnCard = new ContentDeliveryNetworkCard('cdn-int-2');
    const highVal = new AiInferenceCard('ai-int-2');   // Afternoon $10k
    const lowVal = new IoTBurstCard('iot-int-2');       // Afternoon $3k
    const morningCard = new AiInferenceCard('ai-int-m'); // Morning $10k (single card)
    const base = safeContext('cdn-int-congested');
    let ctx = ctxWithCardOnSlot(highVal, Period.Afternoon, 0, base);
    ctx = ctxWithCardOnSlot(lowVal, Period.Afternoon, 1, ctx);
    ctx = ctxWithCardOnSlot(morningCard, Period.Morning, 0, ctx);
    ctx = {
      ...ctx,
      vendorSlots: base.vendorSlots.map((s) => s.index === 0 ? { ...s, card: cdnCard } : s),
    };

    const { context } = resolveRound(ctx);

    // Afternoon is most congested (2 cards vs Morning's 1)
    // Highest revenue in Afternoon = ai-int-2 ($10k)
    expect(context.trafficSlotPositions['ai-int-2']).toBeUndefined();
    // Low-value Afternoon card and Morning card remain
    expect(context.trafficSlotPositions['iot-int-2']).toBeDefined();
    expect(context.trafficSlotPositions['ai-int-m']).toBeDefined();
    // 75% of $10k
    const entry = context.lastRoundSummary?.ledger.find((e) => e.kind === 'vendor-revenue');
    expect(entry?.amount).toBe(7_500);
    expect(context.budget).toBe(base.budget + 7_500);
  });

  it('does not change the board when no traffic is present', () => {
    const cdnCard = new ContentDeliveryNetworkCard('cdn-int-3');
    const base = safeContext('cdn-int-empty');
    const ctx = {
      ...base,
      vendorSlots: base.vendorSlots.map((s) => s.index === 0 ? { ...s, card: cdnCard } : s),
    };

    const { context, summary } = resolveRound(ctx);

    expect(summary.round).toBe(ctx.round);
    expect(Object.keys(context.trafficSlotPositions)).toHaveLength(0);
    const entry = summary.ledger.find((e) => e.kind === 'vendor-revenue');
    expect(entry).toBeUndefined();
    expect(context.budget).toBe(base.budget);
  });
});

describe('integration: CDN + ADC slot-order stacking through resolveRound', () => {
  it('CDN in slot 1 (after ADC in slot 0) earns revenue at the ADC-boosted multiplier', () => {
    // ADC runs first (slot 0): bumps multiplier from 1.0 → 1.1 on a weekday.
    // CDN runs second (slot 1): clears a card at the 1.1 multiplier.
    // round 2 = Tuesday (weekday), so ADC fires.
    const adcCard = new ApplicationDeliveryControllerCard('adc-stack');
    const cdnCard = new ContentDeliveryNetworkCard('cdn-stack');
    const traffic = new AiInferenceCard('ai-stack'); // $10k revenue
    const base = safeContext('cdn-adc-stack', { round: 2 });
    const ctx = {
      ...ctxWithCardOnSlot(traffic, Period.Morning, 0, base),
      vendorSlots: base.vendorSlots.map((s) =>
        s.index === 0 ? { ...s, card: adcCard } :
        s.index === 1 ? { ...s, card: cdnCard } : s
      ),
    };

    const { context, summary } = resolveRound(ctx);

    // ADC should have bumped the multiplier (will be reset next Monday).
    expect(context.revenueBoostMultiplier).toBeCloseTo(1.1, 10);
    // CDN should have cleared the traffic card.
    expect(context.trafficSlotPositions['ai-stack']).toBeUndefined();
    // Expected earn: Math.round(10_000 * 0.75 * 1.1) = Math.round(8_250) = 8_250
    const cdnEntry = summary.ledger.find((e) => e.kind === 'vendor-revenue');
    expect(cdnEntry?.amount).toBe(8_250);
    expect(context.budget).toBe(base.budget + 8_250);
  });

  it('CDN in slot 0 (before ADC in slot 1) earns at the pre-ADC multiplier', () => {
    // CDN runs first: clears at multiplier 1.0.
    // ADC runs second: bumps multiplier (too late to affect CDN this round).
    const cdnCard = new ContentDeliveryNetworkCard('cdn-first');
    const adcCard = new ApplicationDeliveryControllerCard('adc-second');
    const traffic = new AiInferenceCard('ai-first'); // $10k revenue
    const base = safeContext('cdn-first-stack', { round: 2 }); // Tuesday
    const ctx = {
      ...ctxWithCardOnSlot(traffic, Period.Morning, 0, base),
      vendorSlots: base.vendorSlots.map((s) =>
        s.index === 0 ? { ...s, card: cdnCard } :
        s.index === 1 ? { ...s, card: adcCard } : s
      ),
    };

    const { context, summary } = resolveRound(ctx);

    expect(context.revenueBoostMultiplier).toBeCloseTo(1.1, 10);
    expect(context.trafficSlotPositions['ai-first']).toBeUndefined();
    // Expected earn: Math.round(10_000 * 0.75 * 1.0) = 7_500 (pre-ADC multiplier)
    const cdnEntry = summary.ledger.find((e) => e.kind === 'vendor-revenue');
    expect(cdnEntry?.amount).toBe(7_500);
    expect(context.budget).toBe(base.budget + 7_500);
  });
});
