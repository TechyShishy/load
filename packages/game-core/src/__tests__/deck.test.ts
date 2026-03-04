/// <reference types="vitest" />
import { describe, expect, it } from 'vitest';
import {
  buildActionDeck,
  buildTrafficEventDeck,
  drawN,
  reshuffleDiscard,
  shuffle,
} from '../deck.js';
import { CardType } from '../types.js';

describe('shuffle', () => {
  it('returns a new array with the same elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle(arr);
    expect(shuffled).toHaveLength(arr.length);
    expect(shuffled.sort()).toEqual([...arr].sort());
  });

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3];
    const copy = [...arr];
    shuffle(arr);
    expect(arr).toEqual(copy);
  });
});

describe('buildTrafficEventDeck', () => {
  it('contains 24 cards total', () => {
    const deck = buildTrafficEventDeck();
    expect(deck).toHaveLength(24);
  });

  it('contains 16 Traffic cards', () => {
    const deck = buildTrafficEventDeck();
    expect(deck.filter((c) => c.type === CardType.Traffic)).toHaveLength(16);
  });

  it('contains 8 Event cards', () => {
    const deck = buildTrafficEventDeck();
    expect(deck.filter((c) => c.type === CardType.Event)).toHaveLength(8);
  });
});

describe('buildActionDeck', () => {
  it('contains 15 cards total', () => {
    const deck = buildActionDeck();
    expect(deck).toHaveLength(15);
  });

  it('all cards are Action type', () => {
    const deck = buildActionDeck();
    expect(deck.every((c) => c.type === CardType.Action)).toBe(true);
  });

  it('contains exactly 3 copies of each action', () => {
    const deck = buildActionDeck();
    const counts = new Map<string, number>();
    for (const card of deck) {
      counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBe(3);
    }
  });
});

describe('drawN', () => {
  it('draws n cards from the front', () => {
    const deck = [1, 2, 3, 4, 5];
    const [drawn, remaining] = drawN(deck, 3);
    expect(drawn).toEqual([1, 2, 3]);
    expect(remaining).toEqual([4, 5]);
  });

  it('draws all cards if n >= deck length', () => {
    const deck = [1, 2];
    const [drawn, remaining] = drawN(deck, 10);
    expect(drawn).toEqual([1, 2]);
    expect(remaining).toEqual([]);
  });

  it('draws 0 cards if n is 0', () => {
    const [drawn, remaining] = drawN([1, 2, 3], 0);
    expect(drawn).toEqual([]);
    expect(remaining).toEqual([1, 2, 3]);
  });
});

describe('reshuffleDiscard', () => {
  it('returns unchanged deck if deck is non-empty', () => {
    const [newDeck, newDiscard] = reshuffleDiscard([1, 2], [3, 4]);
    expect(newDeck).toEqual([1, 2]);
    expect(newDiscard).toEqual([3, 4]);
  });

  it('moves discard into deck when deck is empty', () => {
    const [newDeck, newDiscard] = reshuffleDiscard([], [1, 2, 3]);
    expect(newDeck).toHaveLength(3);
    expect(newDiscard).toEqual([]);
  });
});
