import { describe, expect, it } from 'vitest';
import {
  buildActionDeck,
  buildTrafficEventDeck,
  drawN,
  makeRng,
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

  it('all card IDs are unique', () => {
    const deck = buildTrafficEventDeck();
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(deck.length);
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

  it('contains exactly 3 copies of each action (by name)', () => {
    const deck = buildActionDeck();
    const counts = new Map<string, number>();
    for (const card of deck) {
      counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBe(3);
    }
  });

  it('all card IDs are unique', () => {
    const deck = buildActionDeck();
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(deck.length);
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

describe('makeRng / seeded shuffle', () => {
  it('same seed produces the same shuffle order', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const result1 = shuffle(input, makeRng('test-seed'));
    const result2 = shuffle(input, makeRng('test-seed'));
    expect(result1).toEqual(result2);
  });

  it('different seeds produce different shuffle orders', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const result1 = shuffle(input, makeRng('seed-a'));
    const result2 = shuffle(input, makeRng('seed-b'));
    // With 8 elements (40320 permutations) the probability of collision is negligible
    expect(result1).not.toEqual(result2);
  });

  it('seeded reshuffleDiscard is deterministic', () => {
    const cards = [1, 2, 3, 4, 5];
    const [deck1] = reshuffleDiscard([], cards, makeRng(42));
    const [deck2] = reshuffleDiscard([], cards, makeRng(42));
    expect(deck1).toEqual(deck2);
  });

  it('seeded buildTrafficEventDeck is deterministic', () => {
    const deck1 = buildTrafficEventDeck(makeRng('game-seed'));
    const deck2 = buildTrafficEventDeck(makeRng('game-seed'));
    // Card IDs differ (crypto.randomUUID), but type and name order must match
    expect(deck1.map((c) => c.type)).toEqual(deck2.map((c) => c.type));
    expect(deck1.map((c) => c.name)).toEqual(deck2.map((c) => c.name));
  });

  it('seeded buildActionDeck is deterministic', () => {
    const deck1 = buildActionDeck(makeRng('game-seed'));
    const deck2 = buildActionDeck(makeRng('game-seed'));
    expect(deck1.map((c) => c.name)).toEqual(deck2.map((c) => c.name));
  });
});
