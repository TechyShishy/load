import { EventCard, type GameContext } from '../../types.js';
import { DDoSTrafficCard } from '../traffic/DDoSTrafficCard.js';

export class DDoSAttackCard extends EventCard {
  readonly templateId = 'event-ddos-attack';
  readonly name = 'DDoS Attack';
  readonly label = 'TRAFFIC SPIKE';
  readonly description =
    'A volumetric attack floods your edge nodes with malicious traffic.';

  constructor(public readonly id: string = 'event-ddos-attack') {
    super();
  }

  onCrisis(ctx: GameContext, mitigated: boolean): GameContext {
    if (mitigated) return ctx;
    const spawned = Array.from({ length: 8 }, () => new DDoSTrafficCard(crypto.randomUUID()));
    return { ...ctx, spawnedTrafficQueue: [...ctx.spawnedTrafficQueue, ...spawned] };
  }
}
