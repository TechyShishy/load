import { describe, expect, it } from 'vitest';
import { createInitialContext } from '../machine.js';
import { FalseAlarmCard, EVENT_CARDS, EVENT_CARD_REGISTRY } from '../data/events/index.js';

// ─── FalseAlarmCard — unit tests ──────────────────────────────────────────────

describe('FalseAlarmCard — fields', () => {
  it('has the expected templateId', () => {
    const card = new FalseAlarmCard();
    expect(card.templateId).toBe('event-false-alarm');
  });

  it('label is ALL CLEAR', () => {
    const card = new FalseAlarmCard();
    expect(card.label).toBe('ALL CLEAR');
  });
});

describe('FalseAlarmCard — registration', () => {
  it('is present in EVENT_CARDS', () => {
    const found = EVENT_CARDS.find((c) => c.templateId === 'event-false-alarm');
    expect(found).toBeDefined();
  });

  it('is in EVENT_CARD_REGISTRY and constructable', () => {
    const Ctor = EVENT_CARD_REGISTRY.get('event-false-alarm');
    expect(Ctor).toBeDefined();
    const instance = new Ctor!('test-id');
    expect(instance.templateId).toBe('event-false-alarm');
  });
});

describe('FalseAlarmCard — onCrisis', () => {
  it('returns context unchanged when unmitigated', () => {
    const card = new FalseAlarmCard();
    const ctx = createInitialContext();
    const result = card.onCrisis(ctx, false);
    expect(result).toBe(ctx);
  });

  it('returns context unchanged when mitigated', () => {
    const card = new FalseAlarmCard();
    const ctx = createInitialContext();
    const result = card.onCrisis(ctx, true);
    expect(result).toBe(ctx);
  });

  it('does not modify budget', () => {
    const card = new FalseAlarmCard();
    const ctx = { ...createInitialContext(), budget: 300_000 };
    const result = card.onCrisis(ctx, false);
    expect(result.budget).toBe(300_000);
  });

  it('does not spawn traffic cards', () => {
    const card = new FalseAlarmCard();
    const ctx = createInitialContext();
    const result = card.onCrisis(ctx, false);
    expect(result.spawnedTrafficQueue).toHaveLength(0);
  });
});
