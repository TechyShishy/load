import { describe, it, expect } from 'vitest';
import {
  MIN_DECK_SIZE,
  validateDeckSpec,
  DEFAULT_ACTION_DECK,
  buildActionDeck,
  makeRng,
} from '../deck.js';
import { createInitialContext } from '../machine.js';
import { CardType } from '../types.js';
import type { DeckSpec, ContractDef } from '../types.js';

describe('MIN_DECK_SIZE', () => {
  it('equals 20', () => {
    expect(MIN_DECK_SIZE).toBe(20);
  });
});

describe('validateDeckSpec', () => {
  it('returns valid when total equals MIN_DECK_SIZE', () => {
    const spec: DeckSpec[] = [{ templateId: 'action-work-order', count: MIN_DECK_SIZE }];
    expect(validateDeckSpec(spec)).toEqual({ valid: true, total: MIN_DECK_SIZE });
  });

  it('returns valid when total exceeds MIN_DECK_SIZE', () => {
    const spec: DeckSpec[] = [{ templateId: 'action-work-order', count: 25 }];
    const result = validateDeckSpec(spec);
    expect(result.valid).toBe(true);
    expect(result.total).toBe(25);
  });

  it('returns invalid when total is below MIN_DECK_SIZE', () => {
    const spec: DeckSpec[] = [{ templateId: 'action-work-order', count: MIN_DECK_SIZE - 1 }];
    expect(validateDeckSpec(spec)).toEqual({ valid: false, total: MIN_DECK_SIZE - 1 });
  });

  it('returns invalid for an empty array', () => {
    expect(validateDeckSpec([])).toEqual({ valid: false, total: 0 });
  });

  it('sums counts across multiple entries', () => {
    const spec: DeckSpec[] = [
      { templateId: 'action-work-order', count: 10 },
      { templateId: 'action-traffic-prioritization', count: 12 },
    ];
    expect(validateDeckSpec(spec)).toEqual({ valid: true, total: 22 });
  });
});

describe('DEFAULT_ACTION_DECK', () => {
  it('is valid (total >= MIN_DECK_SIZE)', () => {
    expect(validateDeckSpec(DEFAULT_ACTION_DECK).valid).toBe(true);
  });

  it('includes Work Order × 6', () => {
    const entry = DEFAULT_ACTION_DECK.find((e) => e.templateId === 'action-work-order');
    expect(entry?.count).toBe(6);
  });

  it('does not include Null Route', () => {
    const entry = DEFAULT_ACTION_DECK.find((e) => e.templateId === 'action-null-route');
    expect(entry).toBeUndefined();
  });
});

describe('buildActionDeck with custom deckSpec', () => {
  it('builds deck from the provided spec', () => {
    const spec: DeckSpec[] = [
      { templateId: 'action-work-order', count: 3 },
      { templateId: 'action-null-route', count: 2 },
    ];
    const deck = buildActionDeck(makeRng('custom-spec'), spec);
    expect(deck).toHaveLength(5);
    expect(deck.filter((c) => c.templateId === 'action-work-order')).toHaveLength(3);
    expect(deck.filter((c) => c.templateId === 'action-null-route')).toHaveLength(2);
  });
});

describe('createInitialContext deckSpec parameter', () => {
  it('uses the provided deckSpec when no contract is given', () => {
    const spec: DeckSpec[] = [{ templateId: 'action-null-route', count: 29 }];
    const ctx = createInitialContext('spec-seed', undefined, spec);
    const actionCards = Object.values(ctx.cardInstances).filter((c) => c.type === CardType.Action);
    expect(actionCards.every((c) => c.templateId === 'action-null-route')).toBe(true);
    expect(actionCards).toHaveLength(29);
  });

  it('falls back to DEFAULT_ACTION_DECK when deckSpec is omitted', () => {
    const ctx = createInitialContext('fallback-seed');
    const actionCards = Object.values(ctx.cardInstances).filter((c) => c.type === CardType.Action);
    const workOrders = actionCards.filter((c) => c.templateId === 'action-work-order');
    const nullRoutes = actionCards.filter((c) => c.templateId === 'action-null-route');
    expect(workOrders).toHaveLength(6);
    expect(nullRoutes).toHaveLength(0);
  });

  it('contract.actionDeck takes priority over deckSpec', () => {
    const contract: ContractDef = {
      id: 'test-contract',
      name: 'Test Contract',
      description: 'Priority test',
      trafficDeck: [{ templateId: 'traffic-4k-stream', count: 1 }],
      eventDeck: [],
      actionDeck: [{ templateId: 'action-bandwidth-upgrade', count: 5 }],
      startingBudget: 500_000,
      slaLimit: 3,
    };
    const spec: DeckSpec[] = [{ templateId: 'action-null-route', count: 25 }];
    const ctx = createInitialContext('priority-seed', contract, spec);
    const actionCards = Object.values(ctx.cardInstances).filter((c) => c.type === CardType.Action);
    expect(actionCards.every((c) => c.templateId === 'action-bandwidth-upgrade')).toBe(true);
    expect(actionCards).toHaveLength(5);
  });
});
