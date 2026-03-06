import { type ActionCard, type GameContext, type Period, type Track } from './types.js';

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
  /** Optional: ID of the Traffic card to remove (for RemoveTrafficCard; overrides card.targetTrafficCardId) */
  targetTrafficCardId?: string,
  /** Optional: Period to target (for BoostSlotCapacity, AddPeriodSlots; overrides card.targetPeriod) */
  targetPeriod?: Period,
  /** Optional: Track to target (for ClearTicket; overrides card.targetTrack) */
  targetTrack?: Track,
): GameContext {
  if (!ctx.hand.find((c) => c.id === card.id)) {
    // Card not in hand — no-op
    return ctx;
  }

  const commit = (): GameContext => ({
    ...ctx,
    budget: ctx.budget - card.cost,
    hand: ctx.hand.filter((c) => c.id !== card.id),
    playedThisRound: [...ctx.playedThisRound, card],
  });

  return card.apply(ctx, commit, targetEventId, targetTrafficCardId, targetPeriod, targetTrack);
}

/**
 * Resolve all pending Event cards at the end of the Crisis phase.
 * IssueTicket events add to the relevant track.
 * Unmitigated events apply their penalty.
 * SpawnVendor events are silently no-oped.
 */
export function processCrisis(ctx: GameContext): CrisisResult {
  let context = { ...ctx };
  let penaltiesApplied = 0;

  for (const event of ctx.pendingEvents) {
    const isMitigated = ctx.mitigatedEventIds.includes(event.id);
    const budgetBefore = context.budget;
    context = event.onCrisis(context, isMitigated);
    penaltiesApplied += budgetBefore - context.budget;
  }

  // Return consumed event cards to the event discard pile, then clear
  context = {
    ...context,
    eventDiscard: [...context.eventDiscard, ...context.pendingEvents],
    pendingEvents: [],
  };

  return { context, penaltiesApplied };
}
