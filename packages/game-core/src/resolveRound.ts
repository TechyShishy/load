import { BANKRUPT_THRESHOLD, CardType, MAX_ROUNDS, MAX_SLA_FAILURES, SlotType, type EventCard, type GameContext, type RoundSummary } from './types.js';
import type { TrafficCardPositionContext } from './cardPositionMachines.js';

export interface ResolutionResult {
  context: GameContext;
  summary: RoundSummary;
}

/**
 * Resolve the Resolution phase:
 * 1. Sweep overload slots: each costs 1 SLA failure; cards moved to trafficDiscardOrder
 *    (spawned cards are swept as SLA failures but excluded from trafficDiscardOrder so they
 *    never re-enter the shuffle pool).
 * 2. Count remaining resolved Traffic cards across all normal time slots.
 * 3. Prune spawnedTrafficIds to only IDs that are still on the board.
 * 4. Return a RoundSummary.
 */
export function resolveRound(ctx: GameContext, spawnedTrafficCount = 0, spawnedCardIds: ReadonlySet<string> = new Set()): ResolutionResult {
  // Find all traffic card actors currently in an overloaded slot.
  // Collect overloaded slot positions occupied by spawned cards (to preserve them).
  const spawnedOverloadSlotKeys = new Set<string>();
  const overloadedCardIds: string[] = [];
  for (const [id, actor] of Object.entries(ctx.trafficCardActors)) {
    if (!actor) continue;
    const snap = actor.getSnapshot();
    if (snap.value !== 'onSlot') continue;
    const c = snap.context as TrafficCardPositionContext;
    if (c.slotType !== SlotType.Overloaded) continue;
    if (spawnedCardIds.has(id)) {
      spawnedOverloadSlotKeys.add(`${c.period}:${c.slotIndex}`);
    } else {
      overloadedCardIds.push(id);
    }
  }

  const failedCount = overloadedCardIds.length;

  // Sweep tickets whose clearRevenue has decayed to $0. Each auto-cleared ticket
  // incurs 1 SLA failure (the player ran out of time to service it).
  const expiredTicketIds: string[] = [];
  const allTicketIds = Object.values(ctx.ticketOrders).flat();
  for (const ticketId of allTicketIds) {
    const card = ctx.cardInstances[ticketId];
    if (!card || card.type !== CardType.Event) continue;
    const eventCard = card as EventCard;
    if (eventCard.revenueDecayPerRound <= 0) continue; // no decay mechanic
    const issuedRound = ctx.ticketIssuedRound[ticketId] ?? ctx.round;
    const age = ctx.round - issuedRound;
    const baseRevenue = eventCard.clearRevenue - age * eventCard.revenueDecayPerRound;
    if (baseRevenue <= 0) {
      expiredTicketIds.push(ticketId);
    }
  }

  const expiredTicketCount = expiredTicketIds.length;
  const totalFailures = failedCount + expiredTicketCount;
  const forgivenCount = Math.min(ctx.slaForgivenessThisRound, totalFailures);
  const newSlaCount = ctx.slaCount + totalFailures - forgivenCount;

  // Transition overloaded cards from onSlot → inDiscard.
  for (const id of overloadedCardIds) {
    ctx.trafficCardActors[id]?.send({ type: 'REMOVE' });
  }

  // Transition expired ticket actors to inDiscard.
  for (const id of expiredTicketIds) {
    ctx.eventCardActors[id]?.send({ type: 'CLEAR_TICKET' });
  }

  // Remove overloaded slot entries from layout, preserving slots occupied by
  // just-spawned cards (the player needs a scheduling turn to address them).
  const slotLayout = ctx.slotLayout.filter(
    (s) => s.slotType !== SlotType.Overloaded || spawnedOverloadSlotKeys.has(`${s.period}:${s.index}`),
  );
  // Spawned cards are removed from the board but must NOT enter the shuffle
  // pool — only deck-origin cards go to trafficDiscardOrder.
  const spawnedTrafficIdSet = new Set(ctx.spawnedTrafficIds);
  const trafficDiscardOrder = [
    ...ctx.trafficDiscardOrder,
    ...overloadedCardIds.filter((id) => !spawnedTrafficIdSet.has(id)),
  ];

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

  // Remove expired tickets from all tracking structures.
  const expiredSet = new Set(expiredTicketIds);
  const newTicketOrders = Object.fromEntries(
    Object.entries(ctx.ticketOrders).map(([track, ids]) => [
      track,
      ids.filter((id) => !expiredSet.has(id)),
    ]),
  ) as typeof ctx.ticketOrders;
  const newTicketProgress = Object.fromEntries(
    Object.entries(ctx.ticketProgress).filter(([id]) => !expiredSet.has(id)),
  );
  const newTicketIssuedRound = Object.fromEntries(
    Object.entries(ctx.ticketIssuedRound).filter(([id]) => !expiredSet.has(id)),
  );

  const summary: RoundSummary = {
    round: ctx.round,
    budgetDelta,
    newSlaCount,
    resolvedCount,
    failedCount,
    forgivenCount,
    spawnedTrafficCount,
    expiredTicketCount,
  };

  const context: GameContext = {
    ...ctx,
    slotLayout,
    trafficDiscardOrder,
    // Prune stale IDs (cards that left the board this round or earlier); only keep
    // spawned cards that are still on a slot so the set stays tightly bounded.
    spawnedTrafficIds: ctx.spawnedTrafficIds.filter((id) => {
      const actor = ctx.trafficCardActors[id];
      return actor?.getSnapshot().value === 'onSlot';
    }),
    ticketOrders: newTicketOrders,
    ticketProgress: newTicketProgress,
    ticketIssuedRound: newTicketIssuedRound,
    eventDiscardOrder: [...ctx.eventDiscardOrder, ...expiredTicketIds],
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

