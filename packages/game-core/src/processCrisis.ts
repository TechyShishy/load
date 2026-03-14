import { type ActionCard, type GameContext, type Period, type Track } from './types.js';
import { getPendingEvents } from './cardPositionViews.js';

export interface CrisisResult {
  context: GameContext;
  penaltiesApplied: number;
}

/**
 * Apply an Action card during the Crisis phase.
 * Deducts the card's cost from budget and applies its effect.
 * Returns the updated context.
 */
export function playActionCard(
  ctx: GameContext,
  card: ActionCard,
  /** Optional: ID of the event to target (for MitigateDDoS) */
  targetEventId?: string,
  /** Optional: ID of the Traffic card to remove (for RemoveTrafficCard) */
  targetTrafficCardId?: string,
  /** Optional: Period to target (for BoostSlotCapacity, AddPeriodSlots) */
  targetPeriod?: Period,
  /** Optional: Track to target (for ClearTicket) */
  targetTrack?: Track,
): GameContext {
  if (!ctx.handOrder.includes(card.id)) {
    // Card not in hand — no-op
    return ctx;
  }

  const commit = (): GameContext => {
    return {
      ...ctx,
      budget: ctx.budget - card.cost,
      handOrder: ctx.handOrder.filter((id) => id !== card.id),
      playedThisRoundOrder: [...ctx.playedThisRoundOrder, card.id],
    };
  };

  return card.apply(ctx, commit, targetEventId, targetTrafficCardId, targetPeriod, targetTrack);
}

/**
 * Resolve all pending Event cards at the end of the Crisis phase.
 */
export function processCrisis(ctx: GameContext): CrisisResult {
  let context = { ...ctx };
  let penaltiesApplied = 0;

  for (const event of getPendingEvents(ctx)) {
    const isMitigated = ctx.mitigatedEventIds.includes(event.id);
    const budgetBefore = context.budget;
    context = event.onCrisis(context, isMitigated);
    penaltiesApplied += budgetBefore - context.budget;
  }

  // Events that issued a ticket during onCrisis are now in ticketOrders and
  // will remain tracked until cleared by WorkOrderCard. Discard the rest.
  const allTicketIds = new Set(Object.values(context.ticketOrders).flat());
  const eventsToDiscard = ctx.pendingEventsOrder.filter((id) => !allTicketIds.has(id));

  context = {
    ...context,
    eventDiscardOrder: [...context.eventDiscardOrder, ...eventsToDiscard],
    pendingEventsOrder: [],
  };

  return { context, penaltiesApplied };
}

