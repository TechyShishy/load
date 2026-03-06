import { Track, type EventCard, type GameContext } from '../../types.js';

export function issueTicket(ctx: GameContext, track: Track, ticket: EventCard): GameContext {
  return {
    ...ctx,
    tracks: ctx.tracks.map((t) =>
      t.track === track ? { ...t, tickets: [...t.tickets, ticket] } : t,
    ),
  };
}
