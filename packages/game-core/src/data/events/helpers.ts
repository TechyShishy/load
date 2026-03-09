import { Track, type EventCard, type GameContext } from '../../types.js';

export function issueTicket(ctx: GameContext, track: Track, ticket: EventCard): GameContext {
  // Send ISSUE_TICKET to the event card's position actor.
  ctx.eventCardActors[ticket.id]?.send({ type: 'ISSUE_TICKET', track });
  return {
    ...ctx,
    ticketOrders: {
      ...ctx.ticketOrders,
      [track]: [...(ctx.ticketOrders[track] ?? []), ticket.id],
    },
  };
}
