import { EventCard, type GameContext } from '../../types.js';

export class TierOnePeeringCard extends EventCard {
  readonly templateId = 'event-tier1-peering';
  readonly name = 'Tier-1 Peering Agreement';
  readonly label = 'REVENUE BOOST';
  readonly description =
    'A major provider offers preferential routing terms. Until Monday, each traffic card you clear earns 50% more revenue.';
  override readonly flavorText = "BGP is watching. Don't announce a /0.";

  constructor(public readonly id: string = 'event-tier1-peering') {
    super();
  }

  onCrisis(ctx: GameContext, _mitigated: boolean): GameContext {
    // Beneficial event: the revenue boost applies regardless of mitigation state.
    // Adds +0.5 to the current multiplier so it stacks additively with other
    // sources (e.g. Application Delivery Controller's weekday ramp).
    return { ...ctx, revenueBoostMultiplier: ctx.revenueBoostMultiplier + 0.5 };
  }
}
