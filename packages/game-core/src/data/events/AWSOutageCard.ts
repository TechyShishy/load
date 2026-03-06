import { EventCard, type GameContext } from '../../types.js';
import { CloudBackupCard } from '../traffic/CloudBackupCard.js';

export class AWSOutageCard extends EventCard {
  readonly templateId = 'event-aws-outage';
  readonly name = 'AWS Outage';
  readonly label = 'TRAFFIC SPIKE';
  readonly description =
    'Cloud provider outage forces backup traffic onto your on-prem infrastructure.';

  constructor(public readonly id: string = 'event-aws-outage') {
    super();
  }

  onCrisis(ctx: GameContext, mitigated: boolean): GameContext {
    if (mitigated) return ctx;
    const spawned = Array.from({ length: 2 }, () => new CloudBackupCard(crypto.randomUUID()));
    const context: GameContext = {
      ...ctx,
      spawnedTrafficQueue: [...ctx.spawnedTrafficQueue, ...spawned],
      budget: ctx.budget - 75_000,
    };
    return context;
  }
}
