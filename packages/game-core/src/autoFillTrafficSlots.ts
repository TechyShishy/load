import { Period, type GameContext, type TrafficCard } from './types.js';
import { getAvailableSlots } from './boardState.js';

export interface FillResult {
  context: GameContext;
}

/**
 * Auto-fill time slots with Traffic cards.
 * Each card is assigned to a period via round-robin cycling through
 * Morning → Afternoon → Evening → Overnight → Morning → …
 * It then fills the first available slot in that period.
 * If no slot is available in the chosen period, an overload slot is created:
 *   - A new TimeSlot with `overloaded: true` is appended to `timeSlots`
 *   - The traffic card is placed inside it
 *   - At Resolution, overload slots are swept: each costs 1 SLA failure and
 *     their cards go to trafficDiscard
 */
export function autoFillTrafficSlots(ctx: GameContext, drawn: TrafficCard[]): FillResult {
  let context = { ...ctx, timeSlots: ctx.timeSlots.map((s) => ({ ...s })) };

  const periodOrder = [Period.Morning, Period.Afternoon, Period.Evening, Period.Overnight];

  for (let i = 0; i < drawn.length; i++) {
    const trafficCard = drawn[i]!;
    // Assign period via round-robin
    const periodIndex = i % periodOrder.length;
    const targetPeriod = periodOrder[periodIndex]!;

    const availableSlots = getAvailableSlots(context.timeSlots, targetPeriod);
    const targetSlot = availableSlots.find((s) => s.card === null);

    if (targetSlot) {
      context = {
        ...context,
        timeSlots: context.timeSlots.map((s) =>
          s.period === targetSlot.period && s.index === targetSlot.index
            ? { ...s, card: trafficCard }
            : s
        ),
      };
    } else {
      // Chosen period is full — create an overload slot to hold the traffic card.
      // This slot will be swept at Resolution (1 SLA failure per slot).
      const overloadIndex = context.timeSlots.filter((s) => s.period === targetPeriod).length;
      const overloadSlot = {
        period: targetPeriod,
        index: overloadIndex,
        card: trafficCard,
        overloaded: true as const,
      };
      context = {
        ...context,
        timeSlots: [...context.timeSlots, overloadSlot],
      };
    }
  }

  return { context };
}
