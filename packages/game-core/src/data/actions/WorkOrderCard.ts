import { ActionCard, CardType, EventCard, Period, Track, type GameContext } from '../../types.js';

export class WorkOrderCard extends ActionCard {
  readonly templateId = 'action-work-order';
  readonly name = 'Work Order';
  readonly cost = 5_000;
  readonly description =
    'Assign 1 work cycle to a specific open ticket. Once all required cycles are ' +
    'complete the ticket closes and pays out up to the full clearRevenue — reduced ' +
    'by $3,000 for every round it aged.';
  readonly allowedOnWeekend = true;
  readonly validDropZones = ['ticket'] as const;
  override readonly invalidZoneFeedback = 'Drop on an open ticket to assign a work cycle.';

  constructor(public readonly id: string = 'action-work-order') {
    super();
  }

  apply(
    ctx: GameContext,
    commit: () => GameContext,
    targetEventId?: string,
    _targetTrafficCardId?: string,
    _targetPeriod?: Period,
    _targetTrack?: Track,
  ): GameContext {
    // Validate target against pre-commit context so the $5k cost is only
    // deducted when there is actually a ticket to work on.
    let targetId: string | undefined;
    let resolvedTrack: Track | undefined;
    if (targetEventId !== undefined) {
      for (const track of Object.values(Track)) {
        if ((ctx.ticketOrders[track] ?? []).includes(targetEventId)) {
          targetId = targetEventId;
          resolvedTrack = track;
          break;
        }
      }
    } else {
      for (const track of Object.values(Track)) {
        const ids = ctx.ticketOrders[track] ?? [];
        if (ids.length > 0) {
          targetId = ids[0]!;
          resolvedTrack = track;
          break;
        }
      }
    }

    if (targetId === undefined || resolvedTrack === undefined) return ctx;

    let context = commit();

    const rawCard = context.cardInstances[targetId];
    if (!rawCard || rawCard.type !== CardType.Event) return ctx;
    const eventCard = rawCard;

    const currentProgress = (context.ticketProgress[targetId] ?? 0) + 1;

    if (currentProgress >= eventCard.requiredClears) {
      // Ticket fully resolved — pay out revenue and remove it.
      const issuedRound = context.ticketIssuedRound[targetId] ?? context.round;
      const age = context.round - issuedRound;
      const baseRevenue = Math.max(0, eventCard.clearRevenue - age * eventCard.revenueDecayPerRound);
      // revenueBoostMultiplier applies only at the moment a ticket is cleared —
      // pairing it with Tier-1 Peering creates a genuine strategic choice.
      const revenue = Math.floor(baseRevenue * context.revenueBoostMultiplier);

      // Remove progress and issued-round entries for the cleared ticket.
      const newTicketProgress = { ...context.ticketProgress };
      delete newTicketProgress[targetId];
      const newTicketIssuedRound = { ...context.ticketIssuedRound };
      delete newTicketIssuedRound[targetId];

      context.eventCardActors[targetId]?.send({ type: 'CLEAR_TICKET' });
      context = {
        ...context,
        ticketOrders: {
          ...context.ticketOrders,
          [resolvedTrack]: (context.ticketOrders[resolvedTrack] ?? []).filter((id) => id !== targetId),
        },
        eventDiscardOrder: [...context.eventDiscardOrder, targetId],
        pendingRevenue: context.pendingRevenue + revenue,
        ticketProgress: newTicketProgress,
        ticketIssuedRound: newTicketIssuedRound,
      };
    } else {
      // Work cycle logged — ticket remains open.
      context = {
        ...context,
        ticketProgress: {
          ...context.ticketProgress,
          [targetId]: currentProgress,
        },
      };
    }

    return context;
  }
}
