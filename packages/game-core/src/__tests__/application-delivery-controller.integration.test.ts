import { describe, expect, it } from 'vitest';
import { resolveRound } from '../resolveRound.js';
import { ApplicationDeliveryControllerCard } from '../data/vendors/ApplicationDeliveryControllerCard.js';
import { safeContext } from './testHelpers.js';

describe('integration: ApplicationDeliveryControllerCard through resolveRound', () => {
  it('bumps revenueBoostMultiplier by 0.10 on a weekday round', () => {
    const adcCard = new ApplicationDeliveryControllerCard('adc-int-1');
    const base = safeContext('adc-int-weekday', { round: 2 }); // Tuesday
    const ctx = {
      ...base,
      vendorSlots: base.vendorSlots.map((s) => s.index === 0 ? { ...s, card: adcCard } : s),
    };

    const { context, summary } = resolveRound(ctx);

    expect(summary.round).toBe(ctx.round);
    expect(context.revenueBoostMultiplier).toBeCloseTo(
      base.revenueBoostMultiplier + 0.1,
      10,
    );
  });

  it('does not change revenueBoostMultiplier on a weekend round', () => {
    const adcCard = new ApplicationDeliveryControllerCard('adc-int-2');
    const base = safeContext('adc-int-weekend', { round: 6 }); // Saturday
    const ctx = {
      ...base,
      vendorSlots: base.vendorSlots.map((s) => s.index === 0 ? { ...s, card: adcCard } : s),
    };

    const { context, summary } = resolveRound(ctx);

    expect(summary.round).toBe(ctx.round);
    expect(context.revenueBoostMultiplier).toBe(base.revenueBoostMultiplier);
  });
});
