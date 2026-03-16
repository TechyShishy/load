import { EventCard, type GameContext } from '../../types.js';

export class AWSOutageCard extends EventCard {
  readonly templateId = 'event-aws-outage';
  readonly name = 'AWS Outage';
  readonly label = 'INFRASTRUCTURE LOSS';
  readonly description =
    'Cloud provider outage forces emergency recovery. Without mitigation, pay $25,000 in recovery costs and lose your next traffic draw.';
  override readonly flavorText = "The status page said 'investigating.' That was six hours ago.";

  constructor(public readonly id: string = 'event-aws-outage') {
    super();
  }

  onCrisis(ctx: GameContext, mitigated: boolean): GameContext {
    if (mitigated) return ctx;
    return {
      ...ctx,
      budget: ctx.budget - 25_000,
      skipNextTrafficDraw: true,
    };
  }
}
