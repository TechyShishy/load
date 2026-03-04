import { ActionEffectType, EventSubtype, type ActionCard, type GameContext } from './types.js';

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
      const track = ctx.tracks.find((t) => t.track === card.targetTrack);
      if (track && track.tickets.length > 0) {
        context = {
          ...context,
          tracks: context.tracks.map((t) =>
            t.track === card.targetTrack
              ? { ...t, tickets: t.tickets.slice(1) } // remove the oldest ticket
              : t,
          ),
        };
      }
      break;
    }
    case ActionEffectType.PreventSLAFail: {
      context = {
        ...context,
        slaProtectedCount: context.slaProtectedCount + card.effectValue,
      };
      break;
    }
    case ActionEffectType.BoostSlotCapacity: {
      if (card.targetPeriod) {
        context = {
          ...context,
          timeSlots: context.timeSlots.map((s) =>
            s.period === card.targetPeriod
              ? { ...s, capacityBoost: s.capacityBoost + card.effectValue }
              : s,
          ),
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
      if (card.targetPeriod) {
        context = {
          ...context,
          timeSlots: context.timeSlots.map((s) =>
            s.period === card.targetPeriod
              ? { ...s, capacityBoost: s.capacityBoost + card.effectValue }
              : s,
          ),
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

    if (event.subtype === EventSubtype.IssueTicket && event.targetTrack) {
      // Always issue the ticket regardless of mitigation
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

  // Clear pending events after processing
  context = { ...context, pendingEvents: [] };

  return { context, penaltiesApplied };
}
