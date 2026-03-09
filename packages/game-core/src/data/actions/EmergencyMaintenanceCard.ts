import { ActionCard, CardType, EventCard, Period, Track, type GameContext } from '../../types.js';

export class EmergencyMaintenanceCard extends ActionCard {
  readonly templateId = 'action-emergency-maintenance';
  readonly name = 'Emergency Maintenance';
  readonly cost = 15_000;
  readonly description =
    'Work 1 ticket on any track. Once all required work cycles are complete the ticket closes ' +
    'and pays out up to the card\'s full clearRevenue — reduced by $3,000 for every round it aged.';
  readonly allowedOnWeekend = true;
  readonly validDropZones = ['track'] as const;
  override readonly invalidZoneFeedback = 'Drop on a track row to work a ticket.';

  constructor(public readonly id: string = 'action-emergency-maintenance') {
    super();
  }

  apply(
    _ctx: GameContext,
    commit: () => GameContext,
    _targetEventId?: string,
    _targetTrafficCardId?: string,
    _targetPeriod?: Period,
    targetTrack?: Track,
  ): GameContext {
    let context = commit();
    const resolvedTrack = targetTrack ?? Track.BreakFix;
    const ticketIds = context.ticketOrders[resolvedTrack] ?? [];
    if (ticketIds.length === 0) return context;

    const targetId = ticketIds[0]!;
    const rawCard = context.cardInstances[targetId];
    if (!rawCard || rawCard.type !== CardType.Event) return context;
    const eventCard = rawCard as EventCard;

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
          [resolvedTrack]: ticketIds.slice(1),
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
