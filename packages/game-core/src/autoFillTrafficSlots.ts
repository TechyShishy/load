import { OVERLOAD_PENALTY, Period, type GameContext, type TrafficCard } from './types.js';
import { getAvailableSlots } from './boardState.js';
import type { Rng } from './deck.js';

export interface FillResult {
  context: GameContext;
  overloadCount: number;
}

/**
 * Auto-fill time slots with Traffic cards.
 * Each card is assigned to a randomly-selected period (uniform across all four).
 * It then fills the first available slot in that period only.
 * If no slot is available in the chosen period it triggers Overload immediately:
 *   - Deduct OVERLOAD_PENALTY from budget
 *   - Mark 1 slot in the next period (wrapping) as unavailable
 */
export function autoFillTrafficSlots(ctx: GameContext, drawn: TrafficCard[], rng: Rng): FillResult {
  let context = { ...ctx, timeSlots: ctx.timeSlots.map((s) => ({ ...s })) };
  let overloadCount = 0;

  const periodOrder = [Period.Morning, Period.Afternoon, Period.Evening, Period.Overnight];

  for (const trafficCard of drawn) {
    // Pick a random period for this card
    const periodIndex = Math.floor(rng() * periodOrder.length);
    const targetPeriod = periodOrder[periodIndex]!;

    const availableSlots = getAvailableSlots(context.timeSlots, targetPeriod);
    const targetSlot = availableSlots.find((s) => s.cards.length < s.baseCapacity);

    if (targetSlot) {
      context = {
        ...context,
        timeSlots: context.timeSlots.map((s) =>
          s.period === targetSlot.period && s.index === targetSlot.index
            ? { ...s, cards: [...s.cards, trafficCard] }
            : s
        ),
      };
    } else {
      // Chosen period is full — Overload
      overloadCount++;
      context = {
        ...context,
        budget: context.budget - OVERLOAD_PENALTY,
      };
      // Mark the first available slot in the next period as unavailable
      const overflowPeriod = periodOrder[(periodIndex + 1) % periodOrder.length]!;
      const slotToDisable = context.timeSlots.find(
        (s) => s.period === overflowPeriod && !s.unavailable
      );
      if (slotToDisable) {
        context = {
          ...context,
          timeSlots: context.timeSlots.map((s) =>
            s.period === slotToDisable.period && s.index === slotToDisable.index
              ? { ...s, unavailable: true }
              : s
          ),
        };
      }
    }
  }

  return { context, overloadCount };
}
