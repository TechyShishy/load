import { Period, TrafficCard, type GameContext } from '../../types.js';

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

    const targetSlot = ctx.timeSlots.find(
      (s) => s.period === nextPeriod && !s.overloaded && s.card === null,
    );
    if (targetSlot) {
      return {
        ...ctx,
        timeSlots: ctx.timeSlots.map((s) =>
          s.period === targetSlot.period && s.index === targetSlot.index
            ? { ...s, card: copy }
            : s,
        ),
      };
    }
    // No free slot in the next period — create an overload slot
    const overloadIndex = ctx.timeSlots.filter((s) => s.period === nextPeriod).length;
    return {
      ...ctx,
      timeSlots: [
        ...ctx.timeSlots,
        { period: nextPeriod, index: overloadIndex, card: copy, overloaded: true as const },
      ],
    };
  }
}
