import { BANKRUPT_THRESHOLD, MAX_ROUNDS, MAX_SLA_FAILURES, type GameContext, type RoundSummary } from './types.js';

export interface ResolutionResult {
  context: GameContext;
  summary: RoundSummary;
}

/**
 * Resolve the Execution + Resolution phases:
 * 1. Count resolved and unresolved Traffic cards across all time slots.
 * 2. Award revenue for resolved cards.
 * 3. Increment slaCount for unresolved cards (offset by slaProtectedCount).
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

  // Subtract SLA protections purchased this round
  const unprotectedFails = Math.max(0, failedCount - ctx.slaProtectedCount);
  const newSlaCount = ctx.slaCount + unprotectedFails;

  const budgetDelta = revenue;
  const updatedBudget = ctx.budget + budgetDelta;

  // Overload penalties were already deducted during fill phase; track them separately if needed.
  // Here we just compute the round summary delta from revenue alone.
  const summary: RoundSummary = {
    round: ctx.round,
    budgetDelta,
    newSlaCount,
    resolvedCount,
    failedCount: unprotectedFails,
    overloadPenalties: 0, // populated by the machine from fill phase
  };

  const context: GameContext = {
    ...ctx,
    budget: updatedBudget,
    slaCount: newSlaCount,
    slaProtectedCount: 0,
    mitigatedEventIds: [],
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
 * Check win condition.
 */
export function checkWinCondition(ctx: GameContext): boolean {
  return ctx.round >= MAX_ROUNDS && ctx.budget >= 0;
}
