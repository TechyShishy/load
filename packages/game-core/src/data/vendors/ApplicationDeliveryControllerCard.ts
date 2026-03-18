import { VendorCard, isWeekend, type GameContext } from '../../types.js';

export class ApplicationDeliveryControllerCard extends VendorCard {
  readonly templateId = 'vendor-application-delivery-controller';
  readonly id: string;
  readonly name = 'Application Delivery Controller';
  readonly cost = 45_000;
  readonly description =
    'Each weekday at resolution, increase the revenue multiplier by 0.10. Resets to 1.0 every Monday. Stacks with Tier-1 Peering.';
  override readonly flavorText =
    'Layer 7 awareness. Layer 4 performance. Layer 3 costs. Layer 2 problems.';

  constructor(instanceId = 'vendor-application-delivery-controller') {
    super();
    this.id = instanceId;
  }

  // Monday reset of revenueBoostMultiplier is handled by `performDraw` in machine.ts,
  // not by this card.
  onResolve(ctx: GameContext): GameContext {
    if (isWeekend(ctx.round)) return ctx;
    return { ...ctx, revenueBoostMultiplier: ctx.revenueBoostMultiplier + 0.1 };
  }
}
