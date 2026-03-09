import { createActor } from 'xstate';
import { Period, SlotType, TrafficCard, type GameContext } from '../../types.js';
import { trafficCardPositionMachine } from '../../cardPositionMachines.js';
import { getActorAtSlot } from '../../cardPositionViews.js';

export class ViralTrafficSpikeCard extends TrafficCard {
  readonly templateId = 'traffic-viral-spike';
  readonly name = 'Viral Traffic Spike';
  readonly revenue = 6_000;
  readonly description =
    'A sudden viral moment floods CDN nodes. Clearing it early only propagates the spike — a copy immediately appears in the next period.';

  constructor(public readonly id: string = 'traffic-viral-spike') {
    super();
  }

  override onPickUp(ctx: GameContext, sourcePeriod: Period): GameContext {
    if (sourcePeriod === Period.Overnight) return ctx;
    const copy = new ViralTrafficSpikeCard(crypto.randomUUID());
    const periodOrder = [Period.Morning, Period.Afternoon, Period.Evening, Period.Overnight];
    const nextPeriod = periodOrder[periodOrder.indexOf(sourcePeriod) + 1] ?? Period.Overnight;

    // Create actor for the copy, starting in inDeck (will immediately be placed or spawned).
    const copyActor = createActor(trafficCardPositionMachine, {
      input: { instanceId: copy.id, templateId: copy.templateId },
    });
    copyActor.start();

    // Try to find a free non-overloaded slot in the next period.
    const freeSlot = ctx.slotLayout.find((s) => {
      if (s.period !== nextPeriod || s.slotType === SlotType.Overloaded) return false;
      return getActorAtSlot(ctx, s.period, s.index) === undefined;
    });

    const newCardInstances = { ...ctx.cardInstances, [copy.id]: copy };
    const newTrafficCardActors = { ...ctx.trafficCardActors, [copy.id]: copyActor };

    if (freeSlot) {
      copyActor.send({
        type: 'PLACE',
        period: freeSlot.period,
        slotIndex: freeSlot.index,
        slotType: freeSlot.slotType,
      });
      return {
        ...ctx,
        cardInstances: newCardInstances,
        trafficCardActors: newTrafficCardActors,
      };
    }

    // No free slot — spawn into queue (overload slot created during placement in resolution).
    copyActor.send({ type: 'SPAWN' });
    return {
      ...ctx,
      cardInstances: newCardInstances,
      trafficCardActors: newTrafficCardActors,
      spawnedQueueOrder: [...ctx.spawnedQueueOrder, copy.id],
    };
  }
}
