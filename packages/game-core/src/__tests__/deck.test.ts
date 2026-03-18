import { describe, expect, it } from 'vitest';
import {
  buildActionDeck,
  buildEventDeck,
  buildTrafficDeck,
  buildVendorDeck,
  drawN,
  makeRng,
  reshuffleDiscard,
  shuffle,
} from '../deck.js';
import { CardType, VendorCard } from '../types.js';
import type { GameContext } from '../types.js';
import { VENDOR_CARD_REGISTRY, VENDOR_CARDS } from '../data/index.js';

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

describe('buildTrafficDeck', () => {
  it('contains 21 Traffic cards', () => {
    const deck = buildTrafficDeck();
    expect(deck).toHaveLength(21);
    expect(deck.every((c) => c.type === CardType.Traffic)).toBe(true);
  });

  it('builds deck from a custom DeckSpec — correct total and types', () => {
    const spec = [
      { templateId: 'traffic-4k-stream',    count: 3 },
      { templateId: 'traffic-iot-burst',    count: 2 },
    ];
    const deck = buildTrafficDeck(makeRng('custom-traffic-spec'), spec);
    expect(deck).toHaveLength(5);
    expect(deck.every((c) => c.type === CardType.Traffic)).toBe(true);
  });

  it('builds correct templateId counts from a custom DeckSpec', () => {
    const spec = [
      { templateId: 'traffic-4k-stream',    count: 2 },
      { templateId: 'traffic-cloud-backup', count: 1 },
    ];
    const deck = buildTrafficDeck(makeRng('custom-traffic-counts'), spec);
    expect(deck.filter((c) => c.templateId === 'traffic-4k-stream')).toHaveLength(2);
    expect(deck.filter((c) => c.templateId === 'traffic-cloud-backup')).toHaveLength(1);
  });

  it('all card IDs are unique with a custom DeckSpec', () => {
    const spec = [{ templateId: 'traffic-iot-burst', count: 5 }];
    const deck = buildTrafficDeck(makeRng('custom-unique'), spec);
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(deck.length);
  });

  it('all card IDs are unique', () => {
    const deck = buildTrafficDeck();
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(deck.length);
  });

  it('produces identical card IDs when given the same seed', () => {
    const deck1 = buildTrafficDeck(makeRng('test-seed'));
    const deck2 = buildTrafficDeck(makeRng('test-seed'));
    expect(deck1.map((c) => c.id)).toEqual(deck2.map((c) => c.id));
  });

  it('produces different card IDs when given different seeds', () => {
    const deck1 = buildTrafficDeck(makeRng('seed-a'));
    const deck2 = buildTrafficDeck(makeRng('seed-b'));
    expect(deck1.map((c) => c.id)).not.toEqual(deck2.map((c) => c.id));
  });
});

describe('buildEventDeck', () => {
  it('contains 14 Event cards', () => {
    const deck = buildEventDeck();
    expect(deck).toHaveLength(14);
    expect(deck.every((c) => c.type === CardType.Event)).toBe(true);
  });

  it('builds deck from a custom DeckSpec — correct total and types', () => {
    const spec = [
      { templateId: 'event-false-alarm',   count: 4 },
      { templateId: 'event-tier1-peering', count: 2 },
    ];
    const deck = buildEventDeck(makeRng('custom-event-spec'), spec);
    expect(deck).toHaveLength(6);
    expect(deck.every((c) => c.type === CardType.Event)).toBe(true);
  });

  it('builds correct templateId counts from a custom DeckSpec', () => {
    const spec = [
      { templateId: 'event-aws-outage',  count: 1 },
      { templateId: 'event-false-alarm', count: 3 },
    ];
    const deck = buildEventDeck(makeRng('custom-event-counts'), spec);
    expect(deck.filter((c) => c.templateId === 'event-aws-outage')).toHaveLength(1);
    expect(deck.filter((c) => c.templateId === 'event-false-alarm')).toHaveLength(3);
  });

  it('all card IDs are unique with a custom DeckSpec', () => {
    const spec = [{ templateId: 'event-5g-activation', count: 4 }];
    const deck = buildEventDeck(makeRng('custom-event-unique'), spec);
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(deck.length);
  });

  it('all card IDs are unique', () => {
    const deck = buildEventDeck();
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(deck.length);
  });

  it('produces identical card IDs when given the same seed', () => {
    const deck1 = buildEventDeck(makeRng('test-seed'));
    const deck2 = buildEventDeck(makeRng('test-seed'));
    expect(deck1.map((c) => c.id)).toEqual(deck2.map((c) => c.id));
  });

  it('produces different card IDs when given different seeds', () => {
    const deck1 = buildEventDeck(makeRng('seed-a'));
    const deck2 = buildEventDeck(makeRng('seed-b'));
    expect(deck1.map((c) => c.id)).not.toEqual(deck2.map((c) => c.id));
  });
});

describe('buildActionDeck', () => {
  it('contains 29 cards total', () => {
    const deck = buildActionDeck();
    expect(deck).toHaveLength(29);
  });

  it('all cards are Action type', () => {
    const deck = buildActionDeck();
    expect(deck.every((c) => c.type === CardType.Action)).toBe(true);
  });

  it('contains correct copies of each action card (by templateId)', () => {
    const deck = buildActionDeck();
    const counts = new Map<string, number>();
    for (const card of deck) {
      counts.set(card.templateId, (counts.get(card.templateId) ?? 0) + 1);
    }
    expect(counts.get('action-work-order')).toBe(6);
    expect(counts.get('action-traffic-prioritization')).toBe(12);
    expect(counts.get('action-bandwidth-upgrade')).toBe(3);
    expect(counts.get('action-datacenter-expansion')).toBe(3);
    expect(counts.get('action-stream-compression')).toBe(3);
    expect(counts.get('action-redundant-link')).toBe(2);
    expect(counts.has('action-null-route')).toBe(false);
  });

  it('all card IDs are unique', () => {
    const deck = buildActionDeck();
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(deck.length);
  });

  it('produces identical card IDs when given the same seed', () => {
    const deck1 = buildActionDeck(makeRng('test-seed'));
    const deck2 = buildActionDeck(makeRng('test-seed'));
    expect(deck1.map((c) => c.id)).toEqual(deck2.map((c) => c.id));
  });

  it('produces different card IDs when given different seeds', () => {
    const deck1 = buildActionDeck(makeRng('seed-a'));
    const deck2 = buildActionDeck(makeRng('seed-b'));
    expect(deck1.map((c) => c.id)).not.toEqual(deck2.map((c) => c.id));
  });
});

// ── minimal concrete VendorCard for tests ─────────────────────────────────────

class StubVendorCard extends VendorCard {
  readonly templateId = 'vendor-stub';
  readonly id: string;
  readonly name = 'Stub Appliance';
  readonly cost = 500;
  readonly description = 'A test vendor card';
  constructor(instanceId = 'vendor-stub') {
    super();
    this.id = instanceId;
  }
  onResolve(ctx: GameContext): GameContext { return ctx; }
}

describe('buildVendorDeck', () => {
  it('returns an empty array when no spec is provided', () => {
    expect(buildVendorDeck()).toEqual([]);
  });

  it('returns an empty array for an empty spec', () => {
    expect(buildVendorDeck(Math.random, [])).toEqual([]);
  });

  it('silently skips action and traffic templateIds', () => {
    const spec = [
      { templateId: 'action-work-order', count: 3 },
      { templateId: 'traffic-4k-stream', count: 2 },
    ];
    expect(buildVendorDeck(Math.random, spec)).toEqual([]);
  });

  describe('with a registered StubVendorCard', () => {
    const stub = new StubVendorCard();

    // Register / unregister around each test so module state stays clean.
    // (VENDOR_CARD_REGISTRY is exported as a mutable Map.)
    // biome-ignore lint/suspicious/noDuplicateTestHooks: paired setup/teardown pattern
    const setup = () => {
      VENDOR_CARD_REGISTRY.set('vendor-stub', StubVendorCard as unknown as new (instanceId: string) => VendorCard);
      VENDOR_CARDS.push(stub);
    };
    const teardown = () => {
      VENDOR_CARD_REGISTRY.delete('vendor-stub');
      const idx = VENDOR_CARDS.indexOf(stub);
      if (idx !== -1) VENDOR_CARDS.splice(idx, 1);
    };

    it('builds the correct number of vendor card instances', () => {
      setup();
      try {
        const deck = buildVendorDeck(Math.random, [{ templateId: 'vendor-stub', count: 3 }]);
        expect(deck).toHaveLength(3);
        expect(deck.every((c) => c.type === CardType.Vendor)).toBe(true);
        expect(deck.every((c) => c.templateId === 'vendor-stub')).toBe(true);
      } finally {
        teardown();
      }
    });

    it('generates unique instance IDs', () => {
      setup();
      try {
        const deck = buildVendorDeck(makeRng('seed-v'), [{ templateId: 'vendor-stub', count: 5 }]);
        const ids = deck.map((c) => c.id);
        expect(new Set(ids).size).toBe(5);
      } finally {
        teardown();
      }
    });

    it('produces the same IDs for the same seed', () => {
      setup();
      try {
        const spec = [{ templateId: 'vendor-stub', count: 3 }];
        const deck1 = buildVendorDeck(makeRng('seed-v'), spec);
        const deck2 = buildVendorDeck(makeRng('seed-v'), spec);
        expect(deck1.map((c) => c.id)).toEqual(deck2.map((c) => c.id));
      } finally {
        teardown();
      }
    });

    it('skips unknown templateIds alongside known vendor ones', () => {
      setup();
      try {
        const spec = [
          { templateId: 'action-work-order', count: 2 },
          { templateId: 'vendor-stub', count: 1 },
        ];
        const deck = buildVendorDeck(Math.random, spec);
        expect(deck).toHaveLength(1);
        expect(deck[0]!.templateId).toBe('vendor-stub');
      } finally {
        teardown();
      }
    });
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

  it('seeded buildTrafficDeck is deterministic', () => {
    const deck1 = buildTrafficDeck(makeRng('game-seed'));
    const deck2 = buildTrafficDeck(makeRng('game-seed'));
    expect(deck1.map((c) => c.type)).toEqual(deck2.map((c) => c.type));
    expect(deck1.map((c) => c.name)).toEqual(deck2.map((c) => c.name));
  });

  it('seeded buildEventDeck is deterministic', () => {
    const deck1 = buildEventDeck(makeRng('game-seed'));
    const deck2 = buildEventDeck(makeRng('game-seed'));
    expect(deck1.map((c) => c.type)).toEqual(deck2.map((c) => c.type));
    expect(deck1.map((c) => c.name)).toEqual(deck2.map((c) => c.name));
  });

  it('seeded buildActionDeck is deterministic', () => {
    const deck1 = buildActionDeck(makeRng('game-seed'));
    const deck2 = buildActionDeck(makeRng('game-seed'));
    expect(deck1.map((c) => c.name)).toEqual(deck2.map((c) => c.name));
  });
});
