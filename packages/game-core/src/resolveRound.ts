import { BANKRUPT_THRESHOLD, MAX_ROUNDS, MAX_SLA_FAILURES, type GameContext, type RoundSummary } from './types.js';

export interface ResolutionResult {
  context: GameContext;
  summary: RoundSummary;
}

/**
 * Resolve the Execution + Resolution phases:
 * 1. Sweep overload slots: each costs 1 SLA failure; cards go to trafficDiscard.
 * 2. Count remaining resolved Traffic cards across all normal time slots.
 * 3. Return a RoundSummary.
 */
export function resolveRound(ctx: GameContext, spawnedTrafficCount = 0): ResolutionResult {
  // Sweep overload slots — each one is 1 SLA failure; cards discarded without revenue.
  const overloadedSlots = ctx.timeSlots.filter((s) => s.overloaded);
  const failedCount = overloadedSlots.length;
  const newSlaCount = ctx.slaCount + failedCount;
  const cardsFromOverload = overloadedSlots.flatMap((s) => s.card ? [s.card] : []);
  const timeSlots = ctx.timeSlots.filter((s) => !s.overloaded);
  const trafficDiscard = [...ctx.trafficDiscard, ...cardsFromOverload];

  // Count cards remaining in normal slots (carry-over mechanic).
  let resolvedCount = 0;
  for (const slot of timeSlots) {
    resolvedCount += slot.card !== null ? 1 : 0;
  }

  // Revenue was collected during the round when traffic cards were removed from the board
  // (see processCrisis.ts RemoveTrafficCard). pendingRevenue accumulates those amounts;
  // budget was already updated at that point, so we only report it here and reset.
  const budgetDelta = ctx.pendingRevenue;

  const summary: RoundSummary = {
    round: ctx.round,
    budgetDelta,
    newSlaCount,
    resolvedCount,
    failedCount,
    spawnedTrafficCount,
  };

  const context: GameContext = {
    ...ctx,
    timeSlots,
    trafficDiscard,
    slaCount: newSlaCount,
    mitigatedEventIds: [],
    pendingRevenue: 0,
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
