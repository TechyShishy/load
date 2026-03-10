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

    // No free slot — create an overload slot and place directly so the player
    // can see and potentially address it during scheduling.
    const overloadIndex = ctx.slotLayout.filter((s) => s.period === nextPeriod).length;
    copyActor.send({
      type: 'PLACE',
      period: nextPeriod,
      slotIndex: overloadIndex,
      slotType: SlotType.Overloaded,
    });
    return {
      ...ctx,
      cardInstances: newCardInstances,
      trafficCardActors: newTrafficCardActors,
      slotLayout: [
        ...ctx.slotLayout,
        { period: nextPeriod, index: overloadIndex, slotType: SlotType.Overloaded },
      ],
    };
  }
}
