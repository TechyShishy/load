/**
 * Shared test helpers for game-core unit and integration tests.
 * All helpers build on top of `createInitialContext` from the machine.
 */
import { createInitialContext } from '../machine.js';
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
  const extraInstances: Record<string, ActionCard> = {};

  for (const templateId of templateIds) {
    const id = `${templateId}-hand-test-${Math.random().toString(36).slice(2, 7)}`;
    const Ctor = ACTION_CARD_REGISTRY.get(templateId);
    if (!Ctor) throw new Error(`Unknown action templateId: ${templateId}`);
    const card = new Ctor(id);
    cards.push(card);
    extraInstances[id] = card;
  }

  const handOrder = cards.map((c) => c.id);
  const ctx: GameContext = {
    ...base,
    cardInstances: { ...base.cardInstances, ...extraInstances },
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
  const extraInstances2: Record<string, ActionCard> = {};

  for (const card of cards) {
    extraInstances2[card.id] = card;
  }

  return {
    ...base,
    cardInstances: { ...base.cardInstances, ...extraInstances2 },
    handOrder: cards.map((c) => c.id),
    playedThisRoundOrder: [],
  };
}

// ─── Board slot manipulation ──────────────────────────────────────────────────

/**
/**
 * Place a traffic card on a specific slot.
 * Updates trafficSlotPositions and ensures slotLayout has an entry.
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
    trafficSlotPositions: { ...base.trafficSlotPositions, [id]: { period, slotIndex, slotType } },
    slotLayout,
  };
}

// ─── Event setup ──────────────────────────────────────────────────────────────

/**
 * Returns a context where the specified event cards are in the pending state.
 */
export function ctxWithPendingEvents(
  eventCards: EventCard[],
  base: GameContext = createInitialContext('test-seed'),
): GameContext {
  const extraInstances: Record<string, EventCard> = {};
  const pendingEventsOrder: string[] = [];

  for (const card of eventCards) {
    extraInstances[card.id] = card;
    pendingEventsOrder.push(card.id);
  }

  return {
    ...base,
    cardInstances: { ...base.cardInstances, ...extraInstances },
    pendingEventsOrder,
  };
}

// ─── Re-exports for convenience ───────────────────────────────────────────────

export { SlotType, Period, PhaseId };
