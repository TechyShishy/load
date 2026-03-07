import { describe, expect, it } from 'vitest';
import { AiInferenceCard } from '../data/traffic/AiInferenceCard.js';
import { TRAFFIC_CARDS, TRAFFIC_CARD_REGISTRY } from '../data/traffic/index.js';
import { DEFAULT_TRAFFIC_DECK } from '../deck.js';

describe('AiInferenceCard', () => {
  it('has the expected templateId', () => {
    const card = new AiInferenceCard();
    expect(card.templateId).toBe('traffic-ai-inference');
  });

  it('has the expected revenue', () => {
    const card = new AiInferenceCard();
    expect(card.revenue).toBe(10_000);
  });

  it('default id matches templateId', () => {
    const card = new AiInferenceCard();
    expect(card.id).toBe('traffic-ai-inference');
  });

  it('accepts a custom instance id', () => {
    const card = new AiInferenceCard('traffic-ai-inference-42');
    expect(card.id).toBe('traffic-ai-inference-42');
  });

  it('is findable in TRAFFIC_CARDS', () => {
    const found = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-ai-inference');
    expect(found).toBeDefined();
    expect(found).toBeInstanceOf(AiInferenceCard);
  });

  it('is registered in TRAFFIC_CARD_REGISTRY', () => {
    const Ctor = TRAFFIC_CARD_REGISTRY.get('traffic-ai-inference');
    expect(Ctor).toBeDefined();
    const instance = new Ctor!('test-id');
    expect(instance).toBeInstanceOf(AiInferenceCard);
    expect(instance.id).toBe('test-id');
  });

  it('is present in DEFAULT_TRAFFIC_DECK', () => {
    const entry = DEFAULT_TRAFFIC_DECK.find((e) => e.templateId === 'traffic-ai-inference');
    expect(entry).toBeDefined();
    expect(entry!.count).toBeGreaterThan(0);
  });
});
