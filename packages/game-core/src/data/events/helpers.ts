import { Track, type EventCard, type GameContext } from '../../types.js';

export function applyDowntime(ctx: GameContext, hours: number): GameContext {
  let hoursRemaining = hours;
  const updatedSlots = [...ctx.timeSlots];
  for (let i = 0; i < updatedSlots.length && hoursRemaining > 0; i++) {
    const slot = updatedSlots[i]!;
    if (!slot.unavailable) {
      updatedSlots[i] = { ...slot, unavailable: true };
      hoursRemaining--;
    }
  }
  return { ...ctx, timeSlots: updatedSlots };
}

export function issueTicket(ctx: GameContext, track: Track, ticket: EventCard): GameContext {
  return {
    ...ctx,
    tracks: ctx.tracks.map((t) =>
      t.track === track ? { ...t, tickets: [...t.tickets, ticket] } : t,
    ),
  };
}
