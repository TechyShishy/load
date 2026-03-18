import { VendorCard, type GameContext } from '../../types.js';

export class HighAvailabilityFailoverClusterCard extends VendorCard {
  readonly templateId = 'vendor-high-availability-failover-cluster';
  readonly id: string;
  readonly name = 'High-Availability Failover Cluster';
  readonly cost = 50_000;
  readonly description =
    'Every day, absorb 1 SLA failure: one failure that would have counted against your SLA is handled by the standby cluster.';
  override readonly flavorText =
    'Redundant hardware. Your CFO calls it waste. You call it sleep.';

  constructor(instanceId = 'vendor-high-availability-failover-cluster') {
    super();
    this.id = instanceId;
  }

  onResolve(ctx: GameContext): GameContext {
    return ctx;
  }

  override onCrisis(ctx: GameContext): GameContext {
    return { ...ctx, slaForgivenessThisRound: ctx.slaForgivenessThisRound + 1 };
  }
}
