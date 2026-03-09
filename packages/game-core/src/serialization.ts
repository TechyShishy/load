import { createActor, type SnapshotFrom } from 'xstate';
import {
  type Card, type GameContext, type SerializedGameContext, type Track,
  type TrafficCardActorRegistry, type ActionCardActorRegistry, type EventCardActorRegistry,
} from './types.js';
import {
  trafficCardPositionMachine,
  actionCardPositionMachine,
  eventCardPositionMachine,
} from './cardPositionMachines.js';
import { ACTION_CARD_REGISTRY } from './data/actions/index.js';
import { EVENT_CARD_REGISTRY } from './data/events/index.js';
import { TRAFFIC_CARD_REGISTRY } from './data/traffic/index.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a runtime GameContext into a plain JSON-safe SerializedGameContext.
 * Actor state is persisted using actor.getPersistedSnapshot().
 */
export function dehydrateContext(ctx: GameContext): SerializedGameContext {
  const trafficActorSnapshots: SerializedGameContext['trafficActorSnapshots'] = {};
  for (const [id, actor] of Object.entries(ctx.trafficCardActors)) {
    trafficActorSnapshots[id] = actor.getPersistedSnapshot() as unknown as SerializedGameContext['trafficActorSnapshots'][string];
  }

  const actionActorSnapshots: SerializedGameContext['actionActorSnapshots'] = {};
  for (const [id, actor] of Object.entries(ctx.actionCardActors)) {
    actionActorSnapshots[id] = actor.getPersistedSnapshot() as unknown as SerializedGameContext['actionActorSnapshots'][string];
  }

  const eventActorSnapshots: SerializedGameContext['eventActorSnapshots'] = {};
  for (const [id, actor] of Object.entries(ctx.eventCardActors)) {
    eventActorSnapshots[id] = actor.getPersistedSnapshot() as unknown as SerializedGameContext['eventActorSnapshots'][string];
  }

  return {
    budget: ctx.budget,
    round: ctx.round,
    slaCount: ctx.slaCount,
    trafficActorSnapshots,
    actionActorSnapshots,
    eventActorSnapshots,
    slotLayout: ctx.slotLayout,
    ticketOrders: ctx.ticketOrders,
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
    vendorSlots: ctx.vendorSlots,
    mitigatedEventIds: ctx.mitigatedEventIds,
    activePhase: ctx.activePhase,
    lastRoundSummary: ctx.lastRoundSummary,
    loseReason: ctx.loseReason,
    pendingRevenue: ctx.pendingRevenue,
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
  const trafficCardActors: TrafficCardActorRegistry = {};
  const actionCardActors: ActionCardActorRegistry = {};
  const eventCardActors: EventCardActorRegistry = {};

  // ─ traffic actors ─
  for (const [id, snapshot] of Object.entries(raw.trafficActorSnapshots)) {
    const templateId = (snapshot as { context: { templateId: string } }).context.templateId;
    const Ctor = TRAFFIC_CARD_REGISTRY.get(templateId);
    if (!Ctor) return null; // unknown card — save is stale
    cardInstances[id] = new Ctor(id);
    const actor = createActor(trafficCardPositionMachine, {
      input: { instanceId: id, templateId },
      snapshot: snapshot as unknown as SnapshotFrom<typeof trafficCardPositionMachine>,
    });
    actor.start();
    trafficCardActors[id] = actor;
  }

  // ─ action actors ─
  for (const [id, snapshot] of Object.entries(raw.actionActorSnapshots)) {
    const templateId = (snapshot as { context: { templateId: string } }).context.templateId;
    const Ctor = ACTION_CARD_REGISTRY.get(templateId);
    if (!Ctor) return null;
    cardInstances[id] = new Ctor(id);
    const actor = createActor(actionCardPositionMachine, {
      input: { instanceId: id, templateId },
      snapshot: snapshot as unknown as SnapshotFrom<typeof actionCardPositionMachine>,
    });
    actor.start();
    actionCardActors[id] = actor;
  }

  // ─ event actors ─
  for (const [id, snapshot] of Object.entries(raw.eventActorSnapshots)) {
    const templateId = (snapshot as { context: { templateId: string } }).context.templateId;
    const Ctor = EVENT_CARD_REGISTRY.get(templateId);
    if (!Ctor) return null;
    cardInstances[id] = new Ctor(id);
    const actor = createActor(eventCardPositionMachine, {
      input: { instanceId: id, templateId },
      snapshot: snapshot as unknown as SnapshotFrom<typeof eventCardPositionMachine>,
    });
    actor.start();
    eventCardActors[id] = actor;
  }

  return {
    budget: raw.budget,
    round: raw.round,
    slaCount: raw.slaCount,
    cardInstances,
    trafficCardActors,
    actionCardActors,
    eventCardActors,
    slotLayout: raw.slotLayout as import('./types.js').TimeSlotLayout[],
    ticketOrders: raw.ticketOrders as Record<Track, string[]>,
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
    vendorSlots: raw.vendorSlots,
    mitigatedEventIds: raw.mitigatedEventIds,
    activePhase: raw.activePhase,
    lastRoundSummary: raw.lastRoundSummary,
    loseReason: raw.loseReason,
    pendingRevenue: raw.pendingRevenue,
    seed: raw.seed,
    skipNextTrafficDraw: raw.skipNextTrafficDraw,
    revenueBoostMultiplier: raw.revenueBoostMultiplier,
    slaForgivenessThisRound: raw.slaForgivenessThisRound,
    drawLog: null,
  };
}

