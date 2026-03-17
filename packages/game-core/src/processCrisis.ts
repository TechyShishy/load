import { type ActionCard, type GameContext, type LedgerEntry, type Period, type Track, type VendorCard } from './types.js';
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
      ...(card.cost > 0 ? {
        pendingLedger: [
          ...ctx.pendingLedger,
          { kind: 'action-spend', amount: card.cost, label: card.name } satisfies LedgerEntry,
        ],
      } : {}),
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
    const penalty = budgetBefore - context.budget;
    penaltiesApplied += penalty;
    if (penalty > 0) {
      context = {
        ...context,
        pendingLedger: [
          ...context.pendingLedger,
          { kind: 'crisis-penalty', amount: penalty, label: event.name } satisfies LedgerEntry,
        ],
      };
    }
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

  // ── Vendor card crisis hooks ─────────────────────────────────────────────────
  // Called after all event penalties and discards are applied so vendor effects
  // see the final post-crisis context. onCrisis is optional; slots that do not
  // define it are safely skipped via optional method check.
  const vendorSlotsSnapshot = context.vendorSlots;
  for (const slot of vendorSlotsSnapshot) {
    if (slot.card !== null && slot.card.onCrisis !== undefined) {
      context = slot.card.onCrisis(context);
    }
  }

  return { context, penaltiesApplied };
}

/**
 * Play a vendor card from hand into a gear slot during the scheduling phase.
 * Deducts the card's cost from budget and appends a 'vendor-spend' ledger entry
 * when cost > 0 (zero-cost plays record no entry, matching action-spend behaviour).
 * Returns the original context unchanged when any precondition fails — the
 * machine guards are authoritative; this is a belt-and-suspenders fallback.
 */
export function playVendorCard(
  ctx: GameContext,
  card: VendorCard,
  slotIndex: number,
): GameContext {
  if (!ctx.handOrder.includes(card.id)) return ctx;
  const slot = ctx.vendorSlots[slotIndex];
  if (slot == null || slot.card !== null) return ctx;
  if (ctx.budget < card.cost) return ctx;

  const newSlots = ctx.vendorSlots.map((s) =>
    s.index === slotIndex ? { ...s, card } : s,
  );

  return {
    ...ctx,
    budget: ctx.budget - card.cost,
    ...(card.cost > 0 ? {
      pendingLedger: [
        ...ctx.pendingLedger,
        { kind: 'vendor-spend', amount: card.cost, label: card.name } satisfies LedgerEntry,
      ],
    } : {}),
    handOrder: ctx.handOrder.filter((id) => id !== card.id),
    vendorSlots: newSlots,
    // Vendor cards do NOT enter playedThisRoundOrder or actionDiscardOrder —
    // they remain in the slot for the duration of the run.
  };
}

