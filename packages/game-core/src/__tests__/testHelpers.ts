/**
 * Shared test helpers for game-core unit and integration tests.
 * All helpers build on top of `createInitialContext` from the machine.
 */
import { createActor } from 'xstate';
import { createInitialContext } from '../machine.js';
import {
  trafficCardPositionMachine,
  actionCardPositionMachine,
  eventCardPositionMachine,
  type ActionCardActorRef,
  type EventCardActorRef,
} from '../cardPositionMachines.js';
import { ACTION_CARD_REGISTRY } from '../data/actions/index.js';
import {
  PhaseId,
  SlotType,
  Period,
  type ActionCard,
  type EventCard,
  type GameContext,
  type TrafficCard,
} from '../types.js';

// ─── Base context builder ─────────────────────────────────────────────────────

type ScalarOverrides = Partial<Pick<GameContext,
  'budget' | 'round' | 'slaCount' | 'pendingRevenue' | 'seed' |
  'skipNextTrafficDraw' | 'revenueBoostMultiplier' | 'slaForgivenessThisRound' | 'activePhase' | 'mitigatedEventIds'
>>;

/**
 * Returns a fully-constructed GameContext with no event cards in the deck,
 * so rounds always complete without surprise game-overs.
 * All traffic and action card actors are properly initialised.
 * Scalar overrides are applied on top.
 *
 * Note: traffic deck is preserved; pass `trafficDeckOrder: []` explicitly
 * if the test must prevent a traffic draw from running.
 */
export function safeContext(seed = 'test-seed', overrides: ScalarOverrides = {}): GameContext {
  const ctx = createInitialContext(seed);
  // Clear the event deck so rounds always complete cleanly (original intent from old safeContext helpers).
  return { ...ctx, eventDeckOrder: [], ...overrides };
}

// ─── Hand manipulation ────────────────────────────────────────────────────────

/**
 * Returns a context where `handOrder` contains exactly the specified cards.
 * Creates fresh actors for each card and moves them to inHand state.
 * Replaces the hand entirely — the prior hand from `base` is discarded.
 */
export function ctxWithHandCards(
  templateIds: string[],
  base: GameContext = createInitialContext('test-seed'),
): { ctx: GameContext; cards: ActionCard[] } {
  const cards: ActionCard[] = [];
  const extraActors: Record<string, ActionCardActorRef> = {};
  const extraInstances: Record<string, ActionCard> = {};

  for (const templateId of templateIds) {
    const id = `${templateId}-hand-test-${Math.random().toString(36).slice(2, 7)}`;
    const Ctor = ACTION_CARD_REGISTRY.get(templateId);
    if (!Ctor) throw new Error(`Unknown action templateId: ${templateId}`);
    const card = new Ctor(id);
    cards.push(card);
    extraInstances[id] = card;

    const actor = createActor(actionCardPositionMachine, { input: { instanceId: id, templateId } });
    actor.start();
    actor.send({ type: 'DRAW' }); // inDeck → inHand
    extraActors[id] = actor;
  }

  const handOrder = cards.map((c) => c.id);
  const ctx: GameContext = {
    ...base,
    cardInstances: { ...base.cardInstances, ...extraInstances },
    actionCardActors: { ...base.actionCardActors, ...extraActors },
    handOrder,
    playedThisRoundOrder: [],
  };

  return { ctx, cards };
}

/**
 * Variant of ctxWithHandCards that uses fixed IDs (deterministic — good for find-by-id assertions).
 */
export function ctxWithHandCardsFixedIds(
  cards: ActionCard[],
  base: GameContext = createInitialContext('test-seed'),
): GameContext {
  const extraActors: Record<string, ActionCardActorRef> = {};
  const extraInstances2: Record<string, ActionCard> = {};

  for (const card of cards) {
    extraInstances2[card.id] = card;
    // Always create a fresh actor to guarantee deterministic inHand state.
    // Reusing an existing actor risks sending DRAW from an unexpected state (silent no-op).
    const actor = createActor(actionCardPositionMachine, { input: { instanceId: card.id, templateId: card.templateId } });
    actor.start();
    actor.send({ type: 'DRAW' }); // inDeck → inHand
    extraActors[card.id] = actor;
  }

  return {
    ...base,
    cardInstances: { ...base.cardInstances, ...extraInstances2 },
    actionCardActors: { ...base.actionCardActors, ...extraActors },
    handOrder: cards.map((c) => c.id),
    playedThisRoundOrder: [],
  };
}

// ─── Board slot manipulation ──────────────────────────────────────────────────

/**
 * Place a traffic card actor on a specific slot.
 * Creates an actor for the card and sends it a PLACE event.
 * Returns the updated context.
 */
export function ctxWithCardOnSlot(
  card: TrafficCard,
  period: Period,
  slotIndex: number,
  base: GameContext = createInitialContext('test-seed'),
  slotType: SlotType = SlotType.Normal,
): GameContext {
  const id = card.id;
  let actor = base.trafficCardActors[id];
  if (!actor) {
    actor = createActor(trafficCardPositionMachine, {
      input: { instanceId: id, templateId: card.templateId },
    });
    actor.start();
  }
  // If the actor is already onSlot, PLACE has no transition — use UPDATE_SLOT_TYPE instead.
  if (actor.getSnapshot().value === 'onSlot') {
    actor.send({ type: 'UPDATE_SLOT_TYPE', slotType });
  } else {
    actor.send({ type: 'PLACE', period, slotIndex, slotType });
  }

  // Ensure the slotLayout has an entry for this slot.
  const existingSlotIdx = base.slotLayout.findIndex(
    (s) => s.period === period && s.index === slotIndex,
  );
  const slotLayout = existingSlotIdx >= 0
    ? base.slotLayout.map((s, i) => i === existingSlotIdx ? { ...s, slotType } : s)
    : [...base.slotLayout, { period, index: slotIndex, slotType }];

  return {
    ...base,
    cardInstances: { ...base.cardInstances, [id]: card },
    trafficCardActors: { ...base.trafficCardActors, [id]: actor },
    slotLayout,
  };
}

// ─── Event setup ──────────────────────────────────────────────────────────────

/**
 * Returns a context where the specified event cards are in the pending state.
 * Creates actors for each card and moves them to the pending state.
 */
export function ctxWithPendingEvents(
  eventCards: EventCard[],
  base: GameContext = createInitialContext('test-seed'),
): GameContext {
  const extraActors: Record<string, EventCardActorRef> = {};
  const extraInstances: Record<string, EventCard> = {};
  const pendingEventsOrder: string[] = [];

  for (const card of eventCards) {
    const id = card.id;
    extraInstances[id] = card;
    pendingEventsOrder.push(id);

    // Always create a fresh actor to guarantee deterministic pending state.
    const actor = createActor(eventCardPositionMachine, {
      input: { instanceId: id, templateId: card.templateId },
    });
    actor.start();
    actor.send({ type: 'DRAW' }); // inDeck → pending
    extraActors[id] = actor;
  }

  return {
    ...base,
    cardInstances: { ...base.cardInstances, ...extraInstances },
    eventCardActors: { ...base.eventCardActors, ...extraActors },
    pendingEventsOrder,
  };
}

// ─── Re-exports for convenience ───────────────────────────────────────────────

export { SlotType, Period, PhaseId };
