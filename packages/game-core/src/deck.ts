import { ACTION_CARDS, EVENT_CARDS, TRAFFIC_CARDS } from './data/index.js';
import type { ActionCard, EventCard, TrafficCard } from './types.js';

/** Fisher-Yates shuffle — returns a new shuffled array */
export function shuffle<T>(items: readonly T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // biome-ignore lint: index access is safe here
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Build the Traffic + Event deck.
 * Composition: 16 Traffic cards (shuffle 3 base cards, repeat to fill) + 8 Event cards.
 */
export function buildTrafficEventDeck(): Array<TrafficCard | EventCard> {
  const traffic: TrafficCard[] = [];
  // Fill to 16 by cycling through the 3 base traffic cards
  for (let i = 0; i < 16; i++) {
    traffic.push({ ...(TRAFFIC_CARDS[i % TRAFFIC_CARDS.length]!), id: crypto.randomUUID() });
  }
  const events: EventCard[] = [];
  for (let i = 0; i < 8; i++) {
    events.push({ ...(EVENT_CARDS[i % EVENT_CARDS.length]!), id: crypto.randomUUID() });
  }
  return shuffle([...traffic, ...events]);
}

/**
 * Build the Action deck.
 * Composition: 15 Action cards (3 copies of each of the 5 base Action cards).
 */
export function buildActionDeck(): ActionCard[] {
  const cards: ActionCard[] = [];
  for (let i = 0; i < 3; i++) {
    for (const card of ACTION_CARDS) {
      cards.push({ ...card, id: crypto.randomUUID() });
    }
  }
  return shuffle(cards);
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
export function reshuffleDiscard<T>(deck: readonly T[], discard: readonly T[]): [T[], T[]] {
  if (deck.length > 0) return [deck.slice(), discard.slice()];
  return [shuffle(discard), []];
}
