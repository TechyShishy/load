import { Track, type EventCard, type GameContext } from '../../types.js';

export function issueTicket(ctx: GameContext, track: Track, ticket: EventCard): GameContext {
  return {
    ...ctx,
    ticketOrders: {
      ...ctx.ticketOrders,
      [track]: [...(ctx.ticketOrders[track] ?? []), ticket.id],
    },
    ticketIssuedRound: {
      ...ctx.ticketIssuedRound,
      [ticket.id]: ctx.round,
    },
  };
}
