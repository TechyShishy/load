import { CardType, EventSubtype, OVERLOAD_PENALTY, Period, type EventCard, type GameContext, type TrafficCard } from './types.js';
import { getAvailableSlots } from './boardState.js';
import { TRAFFIC_CARDS } from './data/index.js';

export interface FillResult {
  context: GameContext;
  overloadCount: number;
}

/**
 * Auto-fill time slots with Traffic cards drawn from the deck.
 * Traffic cards fill slots in Period order (Morning → Afternoon → Evening → Overnight).
 * When a card cannot fit in any slot of the target period it triggers Overload:
 *   - Deduct OVERLOAD_PENALTY from budget
 *   - Mark 1 slot in the next period as unavailable
 * SpawnTraffic events inject additional Traffic cards into the fill loop.
 * EventCards stay in pendingEvents and are NOT placed in time slots.
 */
export function autoFillTrafficSlots(ctx: GameContext, drawn: Array<TrafficCard | EventCard>): FillResult {
  let context = { ...ctx, timeSlots: ctx.timeSlots.map((s) => ({ ...s })) };
  let overloadCount = 0;
  const pendingEvents: EventCard[] = [];

  // Separate traffic from events; queue spawns from SpawnTraffic events
  const trafficQueue: TrafficCard[] = [];
  for (const card of drawn) {
    if (card.type === CardType.Traffic) {
      trafficQueue.push(card);
    } else {
      const ev = card;
      pendingEvents.push(ev);
      if (ev.subtype === EventSubtype.SpawnTraffic && ev.spawnCount && ev.spawnTrafficId) {
        const template = TRAFFIC_CARDS.find((t) => t.id === ev.spawnTrafficId);
        if (template) {
          for (let i = 0; i < ev.spawnCount; i++) {
            trafficQueue.push({ ...template, id: crypto.randomUUID() });
          }
        }
      }
    }
  }

  const periodOrder = [Period.Morning, Period.Afternoon, Period.Evening, Period.Overnight];

  for (const trafficCard of trafficQueue) {
    let placed = false;
    let lastPeriodIndex = 0;

    for (let pi = 0; pi < periodOrder.length; pi++) {
      const period = periodOrder[pi]!;
      const availableSlots = getAvailableSlots(context.timeSlots, period);
      const targetSlot = availableSlots.find(
        (s) => s.cards.length < s.baseCapacity
      );
      if (targetSlot) {
        // Mutate a copy of the slot
        context = {
          ...context,
          timeSlots: context.timeSlots.map((s) =>
            s.period === targetSlot.period && s.index === targetSlot.index
              ? { ...s, cards: [...s.cards, trafficCard] }
              : s
          ),
        };
        placed = true;
        break;
      }
      lastPeriodIndex = pi;
    }

    if (!placed) {
      // All slots are full — Overload
      overloadCount++;
      context = {
        ...context,
        budget: context.budget - OVERLOAD_PENALTY,
      };
      // Mark the first available slot in the next period (after the last attempted) as unavailable
      const overflowPeriod = periodOrder[(lastPeriodIndex + 1) % periodOrder.length]!;
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

  return {
    context: { ...context, pendingEvents },
    overloadCount,
  };
}
