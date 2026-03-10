import { Period, SlotType, Track, type ActionCard, type EventCard, type GameContext, type TimeSlot, type TrackSlot, type TrafficCard } from './types.js';

// ─── Traffic views ────────────────────────────────────────────────────────────

export function getTrafficDeck(ctx: GameContext): TrafficCard[] {
  return ctx.trafficDeckOrder.map((id) => ctx.cardInstances[id] as TrafficCard);
}

export function getTrafficDiscard(ctx: GameContext): TrafficCard[] {
  return ctx.trafficDiscardOrder.map((id) => ctx.cardInstances[id] as TrafficCard);
}

export function getSpawnedTrafficQueue(ctx: GameContext): TrafficCard[] {
  return ctx.spawnedQueueOrder.map((id) => ctx.cardInstances[id] as TrafficCard);
}

/**
 * Returns the full slot list with card refs, mirroring the old timeSlots field.
 * Builds a position→instanceId index from actor states, then maps slotLayout.
 */
export function getFilledTimeSlots(ctx: GameContext): TimeSlot[] {
  // Build a single-pass lookup: 'period:index' → instanceId
  const slotMap = new Map<string, string>();
  for (const [id, actor] of Object.entries(ctx.trafficCardActors)) {
    if (!actor) continue;
    const snap = actor.getSnapshot();
    if (snap.value === 'onSlot') {
      const c = snap.context;
      if (c.period !== undefined && c.slotIndex !== undefined) {
        slotMap.set(`${c.period}:${c.slotIndex}`, id);
      }
    }
  }

  return ctx.slotLayout.map((layout) => {
    const cardId = slotMap.get(`${layout.period}:${layout.index}`);
    const card = cardId !== undefined ? (ctx.cardInstances[cardId] as TrafficCard) : null;
    return {
      period: layout.period,
      index: layout.index,
      card,
      ...(layout.slotType === SlotType.Temporary && { temporary: true as const }),
      ...(layout.slotType === SlotType.Overloaded && { overloaded: true as const }),
    };
  });
}

// ─── Action views ─────────────────────────────────────────────────────────────

export function getActionDeck(ctx: GameContext): ActionCard[] {
  return ctx.actionDeckOrder.map((id) => ctx.cardInstances[id] as ActionCard);
}

export function getActionDiscard(ctx: GameContext): ActionCard[] {
  return ctx.actionDiscardOrder.map((id) => ctx.cardInstances[id] as ActionCard);
}

export function getHand(ctx: GameContext): ActionCard[] {
  return ctx.handOrder.map((id) => ctx.cardInstances[id] as ActionCard);
}

export function getPlayedThisRound(ctx: GameContext): ActionCard[] {
  return ctx.playedThisRoundOrder.map((id) => ctx.cardInstances[id] as ActionCard);
}

// ─── Event views ──────────────────────────────────────────────────────────────

export function getEventDeck(ctx: GameContext): EventCard[] {
  return ctx.eventDeckOrder.map((id) => ctx.cardInstances[id] as EventCard);
}

export function getEventDiscard(ctx: GameContext): EventCard[] {
  return ctx.eventDiscardOrder.map((id) => ctx.cardInstances[id] as EventCard);
}

export function getPendingEvents(ctx: GameContext): EventCard[] {
  return ctx.pendingEventsOrder.map((id) => ctx.cardInstances[id] as EventCard);
}

export function getTrackTickets(ctx: GameContext, track: Track): EventCard[] {
  return (ctx.ticketOrders[track] ?? []).map((id) => ctx.cardInstances[id] as EventCard);
}

export function getTracks(ctx: GameContext): TrackSlot[] {
  return [Track.BreakFix, Track.Projects, Track.Maintenance].map((track) => ({
    track,
    tickets: getTrackTickets(ctx, track),
  }));
}

// ─── Slot helpers (used by card apply() methods) ──────────────────────────────

/**
 * Find the actor currently occupying the given slot position.
 * Returns undefined if the slot is empty.
 */
export function getActorAtSlot(
  ctx: GameContext,
  period: Period,
  slotIndex: number,
) {
  for (const [id, actor] of Object.entries(ctx.trafficCardActors)) {
    const snap = actor.getSnapshot();
    if (snap.value === 'onSlot') {
      const c = snap.context;
      if (c.period === period && c.slotIndex === slotIndex) {
        return { id, actor };
      }
    }
  }
  return undefined;
}
