import { type GameContext, type SerializedCard, type SerializedGameContext, type TimeSlot } from './types.js';
import { ACTION_CARD_REGISTRY } from './data/actions/index.js';
import { EVENT_CARD_REGISTRY } from './data/events/index.js';
import { TRAFFIC_CARD_REGISTRY } from './data/traffic/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dehydrateCard(card: { templateId: string; id: string }): SerializedCard {
  return { templateId: card.templateId, instanceId: card.id };
}

function hydrateTraffic(ref: SerializedCard) {
  const Ctor = TRAFFIC_CARD_REGISTRY.get(ref.templateId);
  if (!Ctor) return null;
  return new Ctor(ref.instanceId);
}

function hydrateEvent(ref: SerializedCard) {
  const Ctor = EVENT_CARD_REGISTRY.get(ref.templateId);
  if (!Ctor) return null;
  return new Ctor(ref.instanceId);
}

function hydrateAction(ref: SerializedCard) {
  const Ctor = ACTION_CARD_REGISTRY.get(ref.templateId);
  if (!Ctor) return null;
  return new Ctor(ref.instanceId);
}

function hydrateAll<T>(refs: SerializedCard[], hydrator: (r: SerializedCard) => T | null): T[] | null {
  const result: T[] = [];
  for (const ref of refs) {
    const card = hydrator(ref);
    if (card === null) return null; // unknown templateId — save is corrupt/stale
    result.push(card);
  }
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a runtime GameContext (class instances) into a plain JSON-safe object.
 * Every card becomes { templateId, instanceId }.
 */
export function dehydrateContext(ctx: GameContext): SerializedGameContext {
  return {
    budget: ctx.budget,
    round: ctx.round,
    slaCount: ctx.slaCount,
    hand: ctx.hand.map(dehydrateCard),
    playedThisRound: ctx.playedThisRound.map(dehydrateCard),
    timeSlots: ctx.timeSlots.map((slot) => ({
      period: slot.period,
      index: slot.index,
      baseCapacity: slot.baseCapacity,
      ...(slot.temporary !== undefined && { temporary: slot.temporary }),
      ...(slot.weeklyTemporary !== undefined && { weeklyTemporary: slot.weeklyTemporary }),
      ...(slot.overloaded !== undefined && { overloaded: slot.overloaded }),
      cards: slot.cards.map(dehydrateCard),
    })),
    tracks: ctx.tracks.map((t) => ({
      track: t.track,
      tickets: t.tickets.map(dehydrateCard),
    })),
    vendorSlots: ctx.vendorSlots,
    pendingEvents: ctx.pendingEvents.map(dehydrateCard),
    mitigatedEventIds: ctx.mitigatedEventIds,
    activePhase: ctx.activePhase,
    trafficDeck: ctx.trafficDeck.map(dehydrateCard),
    trafficDiscard: ctx.trafficDiscard.map(dehydrateCard),
    eventDeck: ctx.eventDeck.map(dehydrateCard),
    eventDiscard: ctx.eventDiscard.map(dehydrateCard),
    spawnedTrafficQueue: ctx.spawnedTrafficQueue.map(dehydrateCard),
    actionDeck: ctx.actionDeck.map(dehydrateCard),
    actionDiscard: ctx.actionDiscard.map(dehydrateCard),
    lastRoundSummary: ctx.lastRoundSummary,
    loseReason: ctx.loseReason,
    pendingRevenue: ctx.pendingRevenue,
    seed: ctx.seed,
  };
}

/**
 * Reconstruct a runtime GameContext from a serialized form.
 * Returns null if any card reference cannot be resolved (stale/corrupt save).
 */
export function hydrateContext(raw: SerializedGameContext): GameContext | null {
  const hand = hydrateAll(raw.hand, hydrateAction);
  const playedThisRound = hydrateAll(raw.playedThisRound, hydrateAction);
  const pendingEvents = hydrateAll(raw.pendingEvents, hydrateEvent);
  const trafficDeck = hydrateAll(raw.trafficDeck, hydrateTraffic);
  const trafficDiscard = hydrateAll(raw.trafficDiscard, hydrateTraffic);
  const eventDeck = hydrateAll(raw.eventDeck, hydrateEvent);
  const eventDiscard = hydrateAll(raw.eventDiscard, hydrateEvent);
  const spawnedTrafficQueue = hydrateAll(raw.spawnedTrafficQueue, hydrateTraffic);
  const actionDeck = hydrateAll(raw.actionDeck, hydrateAction);
  const actionDiscard = hydrateAll(raw.actionDiscard, hydrateAction);

  if (
    !hand || !playedThisRound || !pendingEvents ||
    !trafficDeck || !trafficDiscard || !eventDeck || !eventDiscard ||
    !spawnedTrafficQueue || !actionDeck || !actionDiscard
  ) {
    return null;
  }

  const timeSlots: TimeSlot[] = [];
  for (const slot of raw.timeSlots) {
    const cards = hydrateAll(slot.cards, hydrateTraffic);
    if (!cards) return null;
    timeSlots.push({
      period: slot.period,
      index: slot.index,
      baseCapacity: slot.baseCapacity,
      ...(slot.temporary !== undefined && { temporary: slot.temporary }),
      ...(slot.weeklyTemporary !== undefined && { weeklyTemporary: slot.weeklyTemporary }),
      ...(slot.overloaded !== undefined && { overloaded: slot.overloaded }),
      cards,
    });
  }

  type HydratedTrack = GameContext['tracks'][number];
  const tracks: HydratedTrack[] = [];
  for (const t of raw.tracks) {
    const tickets = hydrateAll(t.tickets, hydrateEvent);
    if (!tickets) return null;
    tracks.push({ track: t.track, tickets });
  }

  return {
    budget: raw.budget,
    round: raw.round,
    slaCount: raw.slaCount,
    hand,
    playedThisRound,
    timeSlots,
    tracks,
    vendorSlots: raw.vendorSlots,
    pendingEvents,
    mitigatedEventIds: raw.mitigatedEventIds,
    activePhase: raw.activePhase,
    trafficDeck,
    trafficDiscard,
    eventDeck,
    eventDiscard,
    spawnedTrafficQueue,
    actionDeck,
    actionDiscard,
    lastRoundSummary: raw.lastRoundSummary,
    loseReason: raw.loseReason,
    pendingRevenue: raw.pendingRevenue,
    seed: raw.seed,
    drawLog: null,
  };
}
