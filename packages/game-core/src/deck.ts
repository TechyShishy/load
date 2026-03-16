import seedrandom from 'seedrandom';
import { ACTION_CARD_REGISTRY, EVENT_CARD_REGISTRY, TRAFFIC_CARD_REGISTRY } from './data/index.js';
import type { ActionCard, DeckSpec, EventCard, TrafficCard } from './types.js';

/** Injectable RNG function — default is Math.random, tests can seed it. */
export type Rng = () => number;

/** Create a seeded Rng from an optional seed value. */
export function makeRng(seed?: string | number): Rng {
  return seed !== undefined ? seedrandom(String(seed)) : Math.random;
}

/** Fisher-Yates shuffle — returns a new shuffled array */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    // biome-ignore lint: index access is safe here
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Canonical traffic-deck composition.
 * Total: 21 cards (FourKStream×6, IoTBurst×5, CloudBackup×5, AiInference×3, ViralTrafficSpike×2).
 */
export const DEFAULT_TRAFFIC_DECK: ReadonlyArray<DeckSpec> = [
  { templateId: 'traffic-4k-stream',    count: 6 },
  { templateId: 'traffic-iot-burst',    count: 5 },
  { templateId: 'traffic-cloud-backup', count: 5 },
  { templateId: 'traffic-ai-inference', count: 3 },
  { templateId: 'traffic-viral-spike',  count: 2 },
];

/**
 * Build the Traffic deck.
 * Composition is defined by DEFAULT_TRAFFIC_DECK unless overridden by `spec`.
 */
export function buildTrafficDeck(rng: Rng = Math.random, spec?: ReadonlyArray<DeckSpec>): TrafficCard[] {
  const traffic: TrafficCard[] = [];
  for (const { templateId, count } of (spec ?? DEFAULT_TRAFFIC_DECK)) {
    const Ctor = TRAFFIC_CARD_REGISTRY.get(templateId)!;
    for (let i = 0; i < count; i++) {
      const instanceId = `${templateId}-${Math.floor(rng() * 1e9)}`;
      traffic.push(new Ctor(instanceId));
    }
  }
  return shuffle(traffic, rng);
}

/**
 * Canonical event-deck composition.
 * Total: 14 cards (DDoSAttack×3, AWSOutage×3, FiveGActivation×2, FalseAlarm×4, TierOnePeering×2).
 */
export const DEFAULT_EVENT_DECK: ReadonlyArray<DeckSpec> = [
  { templateId: 'event-ddos-attack',    count: 3 },
  { templateId: 'event-aws-outage',     count: 3 },
  { templateId: 'event-5g-activation',  count: 2 },
  { templateId: 'event-false-alarm',    count: 4 },
  { templateId: 'event-tier1-peering',  count: 2 },
];

/**
 * Build the Event deck.
 * Composition is defined by DEFAULT_EVENT_DECK unless overridden by `spec`.
 */
export function buildEventDeck(rng: Rng = Math.random, spec?: ReadonlyArray<DeckSpec>): EventCard[] {
  const events: EventCard[] = [];
  for (const { templateId, count } of (spec ?? DEFAULT_EVENT_DECK)) {
    const Ctor = EVENT_CARD_REGISTRY.get(templateId)!;
    for (let i = 0; i < count; i++) {
      const instanceId = `${templateId}-${Math.floor(rng() * 1e9)}`;
      events.push(new Ctor(instanceId));
    }
  }
  return shuffle(events, rng);
}

/**
 * Minimum number of cards a custom action deck must contain.
 * Enforced by the Deck Builder UI; save is blocked when below this threshold.
 */
export const MIN_DECK_SIZE = 20;

/**
 * Validate a custom deck spec. Returns the total card count and whether it
 * meets the minimum size requirement.
 */
export function validateDeckSpec(spec: ReadonlyArray<DeckSpec>): { valid: boolean; total: number } {
  const total = spec.reduce((sum, e) => sum + e.count, 0);
  return { valid: total >= MIN_DECK_SIZE, total };
}

/**
 * Canonical action-deck composition.
 * Each entry specifies how many copies of a given template to include.
 * Total: 29 cards (WorkOrder×6, TrafficPrioritization×12, Bandwidth×3, DataCenter×3, StreamCompression×3, RedundantLink×2).
 * Null Route is intentionally absent — it is crisisOnly and DDoS-specific;
 * players who want it should add it via the Deck Builder.
 */
export const DEFAULT_ACTION_DECK: ReadonlyArray<DeckSpec> = [
  { templateId: 'action-work-order',             count: 6 },
  { templateId: 'action-traffic-prioritization', count: 12 },
  { templateId: 'action-bandwidth-upgrade',      count: 3 },
  { templateId: 'action-datacenter-expansion',   count: 3 },
  { templateId: 'action-stream-compression',     count: 3 },
  { templateId: 'action-redundant-link',         count: 2 },
];

/**
 * Build the Action deck.
 * Composition is defined by DEFAULT_ACTION_DECK unless overridden by `spec`.
 */
export function buildActionDeck(rng: Rng = Math.random, spec?: ReadonlyArray<DeckSpec>): ActionCard[] {
  const specTotal = spec !== undefined ? spec.reduce((s, e) => s + e.count, 0) : undefined;
  if (specTotal === 0) {
    console.warn('buildActionDeck: spec sums to zero cards; falling back to DEFAULT_ACTION_DECK');
    spec = undefined;
  }
  const cards: ActionCard[] = [];
  for (const { templateId, count } of (spec ?? DEFAULT_ACTION_DECK)) {
    const Ctor = ACTION_CARD_REGISTRY.get(templateId)!;
    for (let i = 0; i < count; i++) {
      const instanceId = `${templateId}-${Math.floor(rng() * 1e9)}`;
      cards.push(new Ctor(instanceId));
    }
  }
  return shuffle(cards, rng);
}

/**
 * Draw n cards from a deck. Returns [drawn, remaining].
 * If the deck has fewer than n cards, returns all remaining.
 */
export function drawN<T>(deck: readonly T[], n: number): [drawn: T[], remaining: T[]] {
  const drawn = deck.slice(0, n);
  const remaining = deck.slice(n);
  return [drawn, remaining];
}

/**
 * Reshuffle the discard pile back into the deck when the deck is exhausted.
 * Returns [newDeck, emptyDiscard].
 */
export function reshuffleDiscard<T>(deck: readonly T[], discard: readonly T[], rng: Rng = Math.random): [T[], T[]] {
  if (deck.length > 0) return [deck.slice(), discard.slice()];
  return [shuffle(discard, rng), []];
}
