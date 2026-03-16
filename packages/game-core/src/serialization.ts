import {
  type Card, type GameContext, type SerializedGameContext, type Track,
} from './types.js';
import { ACTION_CARD_REGISTRY } from './data/actions/index.js';
import { EVENT_CARD_REGISTRY } from './data/events/index.js';
import { TRAFFIC_CARD_REGISTRY } from './data/traffic/index.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a runtime GameContext into a plain JSON-safe SerializedGameContext.
 */
export function dehydrateContext(ctx: GameContext): SerializedGameContext {
  // Build the instanceId → templateId map from all card instances.
  const cardTemplateIds: Record<string, string> = {};
  for (const [id, card] of Object.entries(ctx.cardInstances)) {
    cardTemplateIds[id] = card.templateId;
  }

  return {
    budget: ctx.budget,
    round: ctx.round,
    slaCount: ctx.slaCount,
    contractId: ctx.contractId,
    slaLimit: ctx.slaLimit,
    cardTemplateIds,
    trafficSlotPositions: ctx.trafficSlotPositions,
    slotLayout: ctx.slotLayout,
    ticketOrders: ctx.ticketOrders,
    ticketProgress: ctx.ticketProgress,
    ticketIssuedRound: ctx.ticketIssuedRound,
    trafficDeckOrder: ctx.trafficDeckOrder,
    trafficDiscardOrder: ctx.trafficDiscardOrder,
    actionDeckOrder: ctx.actionDeckOrder,
    actionDiscardOrder: ctx.actionDiscardOrder,
    eventDeckOrder: ctx.eventDeckOrder,
    eventDiscardOrder: ctx.eventDiscardOrder,
    handOrder: ctx.handOrder,
    playedThisRoundOrder: ctx.playedThisRoundOrder,
    pendingEventsOrder: ctx.pendingEventsOrder,
    spawnedQueueOrder: ctx.spawnedQueueOrder,
    spawnedTrafficIds: ctx.spawnedTrafficIds,
    vendorSlots: ctx.vendorSlots,
    mitigatedEventIds: ctx.mitigatedEventIds,
    activePhase: ctx.activePhase,
    lastRoundSummary: ctx.lastRoundSummary,
    roundHistory: ctx.roundHistory,
    loseReason: ctx.loseReason,
    pendingRevenue: ctx.pendingRevenue,
    pendingActionSpend: ctx.pendingActionSpend,
    pendingCrisisPenalty: ctx.pendingCrisisPenalty,
    seed: ctx.seed,
    skipNextTrafficDraw: ctx.skipNextTrafficDraw,
    revenueBoostMultiplier: ctx.revenueBoostMultiplier,
    slaForgivenessThisRound: ctx.slaForgivenessThisRound,
  };
}

/**
 * Reconstruct a runtime GameContext from a serialized form.
 * Returns null if any card templateId cannot be resolved (stale/corrupt save).
 */
export function hydrateContext(raw: SerializedGameContext): GameContext | null {
  const cardInstances: Record<string, Card> = {};

  for (const [id, templateId] of Object.entries(raw.cardTemplateIds)) {
    const trafficCtor = TRAFFIC_CARD_REGISTRY.get(templateId);
    if (trafficCtor) { cardInstances[id] = new trafficCtor(id); continue; }
    const actionCtor = ACTION_CARD_REGISTRY.get(templateId);
    if (actionCtor) { cardInstances[id] = new actionCtor(id); continue; }
    const eventCtor = EVENT_CARD_REGISTRY.get(templateId);
    if (eventCtor) { cardInstances[id] = new eventCtor(id); continue; }
    return null; // unknown templateId — save is stale
  }

  return {
    budget: raw.budget,
    round: raw.round,
    slaCount: raw.slaCount,
    contractId: raw.contractId,
    slaLimit: raw.slaLimit,
    cardInstances,
    trafficSlotPositions: raw.trafficSlotPositions as import('./types.js').GameContext['trafficSlotPositions'],
    slotLayout: raw.slotLayout as import('./types.js').TimeSlotLayout[],
    ticketOrders: raw.ticketOrders as Record<Track, string[]>,
    ticketProgress: raw.ticketProgress,
    ticketIssuedRound: raw.ticketIssuedRound,
    trafficDeckOrder: raw.trafficDeckOrder,
    trafficDiscardOrder: raw.trafficDiscardOrder,
    actionDeckOrder: raw.actionDeckOrder,
    actionDiscardOrder: raw.actionDiscardOrder,
    eventDeckOrder: raw.eventDeckOrder,
    eventDiscardOrder: raw.eventDiscardOrder,
    handOrder: raw.handOrder,
    playedThisRoundOrder: raw.playedThisRoundOrder,
    pendingEventsOrder: raw.pendingEventsOrder,
    spawnedQueueOrder: raw.spawnedQueueOrder,
    spawnedTrafficIds: raw.spawnedTrafficIds,
    vendorSlots: raw.vendorSlots,
    mitigatedEventIds: raw.mitigatedEventIds,
    activePhase: raw.activePhase,
    lastRoundSummary: raw.lastRoundSummary,
    roundHistory: raw.roundHistory ?? [],
    loseReason: raw.loseReason,
    pendingRevenue: raw.pendingRevenue,
    pendingActionSpend: raw.pendingActionSpend ?? 0,
    pendingCrisisPenalty: raw.pendingCrisisPenalty ?? 0,
    seed: raw.seed,
    skipNextTrafficDraw: raw.skipNextTrafficDraw,
    revenueBoostMultiplier: raw.revenueBoostMultiplier,
    slaForgivenessThisRound: raw.slaForgivenessThisRound,
    drawLog: null,
  };
}

