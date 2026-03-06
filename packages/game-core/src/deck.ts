import seedrandom from 'seedrandom';
import { ACTION_CARDS, EVENT_CARDS, TRAFFIC_CARDS } from './data/index.js';
import type { ActionCard, EventCard, TrafficCard } from './types.js';

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
 * Build the Traffic deck.
 * Composition: 16 Traffic cards, cycling through the 3 base templates.
 */
export function buildTrafficDeck(rng: Rng = Math.random): TrafficCard[] {
  const traffic: TrafficCard[] = [];
  for (let i = 0; i < 16; i++) {
    const template = TRAFFIC_CARDS[i % TRAFFIC_CARDS.length]!;
    traffic.push({ ...template, id: `${template.id}-${Math.floor(rng() * 1e9)}` });
  }
  return shuffle(traffic, rng);
}

/**
 * Build the Event deck.
 * Composition: 8 Event cards, cycling through the 3 base templates.
 */
export function buildEventDeck(rng: Rng = Math.random): EventCard[] {
  const events: EventCard[] = [];
  for (let i = 0; i < 8; i++) {
    const template = EVENT_CARDS[i % EVENT_CARDS.length]!;
    events.push({ ...template, id: `${template.id}-${Math.floor(rng() * 1e9)}` });
  }
  return shuffle(events, rng);
}

/**
 * Build the Action deck.
 * Composition: each card is included `card.deckCount ?? 3` times.
 * Default: 3 copies per card (18 total with Traffic Prioritization at 6 copies).
 */
export function buildActionDeck(rng: Rng = Math.random): ActionCard[] {
  const cards: ActionCard[] = [];
  for (const card of ACTION_CARDS) {
    const copies = card.deckCount ?? 3;
    for (let i = 0; i < copies; i++) {
      cards.push({ ...card, id: `${card.id}-${Math.floor(rng() * 1e9)}` });
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
