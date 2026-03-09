import { createActor } from 'xstate';
import { EventCard, type GameContext } from '../../types.js';
import { trafficCardPositionMachine } from '../../cardPositionMachines.js';
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

    const newCardInstances = { ...ctx.cardInstances };
    const newTrafficCardActors = { ...ctx.trafficCardActors };
    const newSpawnedQueueOrder = [...ctx.spawnedQueueOrder];

    for (const card of spawned) {
      newCardInstances[card.id] = card;
      const actor = createActor(trafficCardPositionMachine, {
        input: { instanceId: card.id, templateId: card.templateId },
      });
      actor.start();
      actor.send({ type: 'SPAWN' });
      newTrafficCardActors[card.id] = actor;
      newSpawnedQueueOrder.push(card.id);
    }

    return {
      ...ctx,
      cardInstances: newCardInstances,
      trafficCardActors: newTrafficCardActors,
      spawnedQueueOrder: newSpawnedQueueOrder,
    };
  }
}
