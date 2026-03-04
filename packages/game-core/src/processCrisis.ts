import { ActionEffectType, EventSubtype, SLOT_BASE_CAPACITY, type ActionCard, type GameContext, type Period, type TimeSlot, type Track } from './types.js';

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
  /** Optional: Period to target (for BoostSlotCapacity, AddOvernightSlots; overrides card.targetPeriod) */
  targetPeriod?: Period,
  /** Optional: Track to target (for ClearTicket; overrides card.targetTrack) */
  targetTrack?: Track,
): GameContext {
  if (!ctx.hand.find((c) => c.id === card.id)) {
    // Card not in hand — no-op
    return ctx;
  }

  let context = {
    ...ctx,
    budget: ctx.budget - card.cost,
    hand: ctx.hand.filter((c) => c.id !== card.id),
    playedThisRound: [...ctx.playedThisRound, card],
  };

  switch (card.effectType) {
    case ActionEffectType.ClearTicket: {
      const resolvedTrack = targetTrack ?? card.targetTrack;
      const track = ctx.tracks.find((t) => t.track === resolvedTrack);
      if (track && track.tickets.length > 0) {
        context = {
          ...context,
          tracks: context.tracks.map((t) =>
            t.track === resolvedTrack
              ? { ...t, tickets: t.tickets.slice(1) } // remove the oldest ticket
              : t,
          ),
        };
      }
      break;
    }
    case ActionEffectType.RemoveTrafficCard: {
      // Remove the targeted Traffic card from the board and collect its revenue.
      // targetTrafficCardId param takes precedence over card.targetTrafficCardId so
      // the caller can supply the target dynamically (e.g. from UI selection).
      const target = targetTrafficCardId ?? card.targetTrafficCardId;
      if (target) {
        let collectedRevenue = 0;
        context = {
          ...context,
          timeSlots: context.timeSlots.map((slot) => {
            const cardToRemove = slot.cards.find((c) => c.id === target);
            if (cardToRemove) {
              collectedRevenue += cardToRemove.revenue;
              return { ...slot, cards: slot.cards.filter((c) => c.id !== target) };
            }
            return slot;
          }),
        };
        if (collectedRevenue > 0) {
          context = { ...context, budget: context.budget + collectedRevenue };
        }
      }
      break;
    }
    case ActionEffectType.BoostSlotCapacity: {
      const resolvedPeriod = targetPeriod ?? card.targetPeriod;
      if (resolvedPeriod) {
        const existingCount = context.timeSlots.filter((s) => s.period === resolvedPeriod).length;
        const newSlots: TimeSlot[] = Array.from({ length: card.effectValue }, (_, i) => ({
          period: resolvedPeriod,
          index: existingCount + i,
          baseCapacity: SLOT_BASE_CAPACITY,
          cards: [],
          unavailable: false,
          temporary: true,
        }));
        context = {
          ...context,
          timeSlots: [...context.timeSlots, ...newSlots],
        };
      }
      break;
    }
    case ActionEffectType.MitigateDDoS: {
      // If no explicit target is given, auto-target the first unmitigated pending event.
      const resolvedTarget =
        targetEventId ?? ctx.pendingEvents.find((e) => !ctx.mitigatedEventIds.includes(e.id))?.id;
      if (resolvedTarget) {
        context = {
          ...context,
          mitigatedEventIds: [...context.mitigatedEventIds, resolvedTarget],
        };
      }
      break;
    }
    case ActionEffectType.AddOvernightSlots: {
      const resolvedPeriod = targetPeriod ?? card.targetPeriod;
      if (resolvedPeriod) {
        const existingCount = context.timeSlots.filter((s) => s.period === resolvedPeriod).length;
        const newSlots: TimeSlot[] = Array.from({ length: card.effectValue }, (_, i) => ({
          period: resolvedPeriod,
          index: existingCount + i,
          baseCapacity: SLOT_BASE_CAPACITY,
          cards: [],
          unavailable: false,
          temporary: true,
        }));
        context = {
          ...context,
          timeSlots: [...context.timeSlots, ...newSlots],
        };
      }
      break;
    }
  }

  return context;
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

    if (!isMitigated && event.subtype === EventSubtype.IssueTicket && event.targetTrack) {
      // Only issue the ticket when the event is NOT mitigated.
      // A mitigated IssueTicket (e.g. Security Patch on a DDoS Attack) cancels
      // both the financial penalty and the ticket itself.
      context = {
        ...context,
        tracks: context.tracks.map((t) =>
          t.track === event.targetTrack ? { ...t, tickets: [...t.tickets, event] } : t,
        ),
      };
    }

    if (!isMitigated && event.subtype !== EventSubtype.SpawnVendor) {
      context = {
        ...context,
        budget: context.budget - event.unmitigatedPenalty,
      };
      penaltiesApplied += event.unmitigatedPenalty;

      // Apply downtime: mark slots unavailable in the current first available period
      if (event.downtimePenaltyHours > 0) {
        let hoursRemaining = event.downtimePenaltyHours;
        const updatedSlots = [...context.timeSlots];
        for (let i = 0; i < updatedSlots.length && hoursRemaining > 0; i++) {
          const slot = updatedSlots[i]!;
          if (!slot.unavailable) {
            updatedSlots[i] = { ...slot, unavailable: true };
            hoursRemaining--;
          }
        }
        context = { ...context, timeSlots: updatedSlots };
      }
    }
  }

  // Return consumed event cards to the TE discard pile, then clear
  context = {
    ...context,
    trafficEventDiscard: [...context.trafficEventDiscard, ...context.pendingEvents],
    pendingEvents: [],
  };

  return { context, penaltiesApplied };
}
