import { EventCard, type GameContext } from '../../types.js';
import { applyDowntime } from './helpers.js';
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
    let context: GameContext = {
      ...ctx,
      spawnedTrafficQueue: [...ctx.spawnedTrafficQueue, ...spawned],
    };
    context = { ...context, budget: context.budget - 75_000 };
    context = applyDowntime(context, 2);
    return context;
  }
}
