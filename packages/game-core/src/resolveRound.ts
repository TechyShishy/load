import { BANKRUPT_THRESHOLD, MAX_ROUNDS, MAX_SLA_FAILURES, SlotType, type GameContext, type RoundSummary } from './types.js';
import type { TrafficCardPositionContext } from './cardPositionMachines.js';

export interface ResolutionResult {
  context: GameContext;
  summary: RoundSummary;
}

/**
 * Resolve the Resolution phase:
 * 1. Sweep overload slots: each costs 1 SLA failure; cards moved to trafficDiscard.
 * 2. Count remaining resolved Traffic cards across all normal time slots.
 * 3. Return a RoundSummary.
 */
export function resolveRound(ctx: GameContext, spawnedTrafficCount = 0): ResolutionResult {
  // Find all traffic card actors currently in an overloaded slot.
  const overloadedCardIds: string[] = [];
  for (const [id, actor] of Object.entries(ctx.trafficCardActors)) {
    if (!actor) continue;
    const snap = actor.getSnapshot();
    if (snap.value === 'onSlot') {
      const c = snap.context as TrafficCardPositionContext;
      if (c.slotType === SlotType.Overloaded) {
        overloadedCardIds.push(id);
      }
    }
  }

  const failedCount = overloadedCardIds.length;
  const forgivenCount = Math.min(ctx.slaForgivenessThisRound, failedCount);
  const newSlaCount = ctx.slaCount + failedCount - forgivenCount;

  // Transition overloaded cards from onSlot → inDiscard.
  for (const id of overloadedCardIds) {
    ctx.trafficCardActors[id]?.send({ type: 'REMOVE' });
  }

  // Remove overloaded slot entries from layout.
  const slotLayout = ctx.slotLayout.filter((s) => s.slotType !== SlotType.Overloaded);
  const trafficDiscardOrder = [...ctx.trafficDiscardOrder, ...overloadedCardIds];

  // Count cards remaining on board (non-overloaded slots with a card).
  let resolvedCount = 0;
  for (const actor of Object.values(ctx.trafficCardActors)) {
    if (!actor) continue;
    const snap = actor.getSnapshot();
    if (snap.value === 'onSlot') {
      const c = snap.context as TrafficCardPositionContext;
      if (c.slotType !== SlotType.Overloaded) resolvedCount++;
    }
  }

  const budgetDelta = ctx.pendingRevenue;

  const summary: RoundSummary = {
    round: ctx.round,
    budgetDelta,
    newSlaCount,
    resolvedCount,
    failedCount,
    forgivenCount,
    spawnedTrafficCount,
  };

  const context: GameContext = {
    ...ctx,
    slotLayout,
    trafficDiscardOrder,
    slaCount: newSlaCount,
    mitigatedEventIds: [],
    pendingRevenue: 0,
    slaForgivenessThisRound: 0,
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

