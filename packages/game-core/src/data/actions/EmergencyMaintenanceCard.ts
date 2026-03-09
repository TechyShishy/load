import { ActionCard, Period, Track, type GameContext } from '../../types.js';

export class EmergencyMaintenanceCard extends ActionCard {
  readonly templateId = 'action-emergency-maintenance';
  readonly name = 'Emergency Maintenance';
  readonly cost = 15_000;
  readonly description = 'Clear 1 ticket from the Break/Fix track.';
  readonly allowedOnWeekend = true;
  readonly validDropZones = ['track'] as const;
  override readonly invalidZoneFeedback = 'Drop on a track row to clear a ticket.';

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
    if (ticketIds.length > 0) {
      const removedId = ticketIds[0]!;
      // Move from asTicket → inDiscard in the event card's actor.
      context.eventCardActors[removedId]?.send({ type: 'CLEAR_TICKET' });
      context = {
        ...context,
        ticketOrders: {
          ...context.ticketOrders,
          [resolvedTrack]: ticketIds.slice(1),
        },
        eventDiscardOrder: [...context.eventDiscardOrder, removedId],
      };
    }
    return context;
  }
}
