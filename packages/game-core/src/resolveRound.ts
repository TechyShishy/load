import { BANKRUPT_THRESHOLD, MAX_ROUNDS, MAX_SLA_FAILURES, OVERLOAD_PENALTY, type GameContext, type RoundSummary } from './types.js';

export interface ResolutionResult {
  context: GameContext;
  summary: RoundSummary;
}

/**
 * Resolve the Execution + Resolution phases:
 * 1. Count resolved and unresolved Traffic cards across all time slots.
 * 2. Award revenue for resolved cards.
 * 3. Increment slaCount for unresolved cards.
 * 4. Return a RoundSummary.
 */
export function resolveRound(ctx: GameContext): ResolutionResult {
  let resolvedCount = 0;
  let failedCount = 0;
  let revenue = 0;

  for (const slot of ctx.timeSlots) {
    for (const card of slot.cards) {
      // A card is "resolved" if the slot is not unavailable
      if (!slot.unavailable) {
        resolvedCount++;
        revenue += card.revenue;
      } else {
        failedCount++;
      }
    }
  }

  const newSlaCount = ctx.slaCount + failedCount;

  const budgetDelta = revenue;
  const updatedBudget = ctx.budget + budgetDelta;

  // Overload penalties were already deducted during fill phase; track them separately if needed.
  // Here we just compute the round summary delta from revenue alone.
  const summary: RoundSummary = {
    round: ctx.round,
    budgetDelta,
    newSlaCount,
    resolvedCount,
    failedCount,
    overloadPenalties: ctx.pendingOverloadCount * OVERLOAD_PENALTY,
  };

  const context: GameContext = {
    ...ctx,
    budget: updatedBudget,
    slaCount: newSlaCount,
    mitigatedEventIds: [],
    pendingOverloadCount: 0,
    lastRoundSummary: summary,
  };

  return { context, summary };
}

/**
 * Check lose conditions. Returns the reason string or null.
 */
export function checkLoseCondition(ctx: GameContext): 'Bankrupt' | 'SLAExceeded' | null {
  if (ctx.budget < BANKRUPT_THRESHOLD) return 'Bankrupt';
  if (ctx.slaCount >= MAX_SLA_FAILURES) return 'SLAExceeded';
  return null;
}

/**
 * Check win condition. Surviving all MAX_ROUNDS is a win regardless of budget
 * sign (as long as the player did not go bankrupt).
 */
export function checkWinCondition(ctx: GameContext): boolean {
  return ctx.round >= MAX_ROUNDS;
}
