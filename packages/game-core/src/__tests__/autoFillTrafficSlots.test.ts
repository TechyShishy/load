import { describe, expect, it } from 'vitest';
import { autoFillTrafficSlots } from '../autoFillTrafficSlots.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { ACTION_CARDS } from '../data/actionCards.js';
import { TRAFFIC_CARDS } from '../data/trafficCards.js';
import {
  Period,
  PhaseId,
  type GameContext,
  type TrafficCard,
} from '../types.js';

/** rng that always returns 0.0 → always picks Morning (index 0) */
const alwaysMorning = () => 0;
/** rng that always returns 0.5 → always picks Evening (index 2 = floor(0.5 * 4)) */
const alwaysEvening = () => 0.5;

function makeBaseContext(): GameContext {
  return {
    budget: 500_000,
    round: 1,
    slaCount: 0,
    hand: [],
    playedThisRound: [],
    timeSlots: createInitialTimeSlots(),
    tracks: createInitialTracks(),
    vendorSlots: createVendorSlots(),
    pendingEvents: [],
    mitigatedEventIds: [],
    activePhase: PhaseId.Scheduling,
    trafficDeck: [],
    trafficDiscard: [],
    eventDeck: [],
    eventDiscard: [],
    spawnedTrafficQueue: [],
    actionDeck: [],
    actionDiscard: ACTION_CARDS,
    lastRoundSummary: null,
    loseReason: null,
    pendingOverloadCount: 0,
    pendingRevenue: 0,
    seed: 'test-seed',
  };
}

const iotCard: TrafficCard = TRAFFIC_CARDS.find((c) => c.id === 'traffic-iot-burst')!;

describe('autoFillTrafficSlots', () => {
  it('places a single traffic card in the period chosen by rng', () => {
    const ctx = makeBaseContext();
    const { context } = autoFillTrafficSlots(ctx, [iotCard], alwaysMorning);
    const morningSlotsWithCards = context.timeSlots.filter(
      (s) => s.period === Period.Morning && s.cards.length > 0,
    );
    expect(morningSlotsWithCards.length).toBe(1);
    // No other period should have cards
    const otherCards = context.timeSlots
      .filter((s) => s.period !== Period.Morning)
      .flatMap((s) => s.cards);
    expect(otherCards).toHaveLength(0);
  });

  it('places card in Evening when rng returns 0.5', () => {
    const ctx = makeBaseContext();
    const { context } = autoFillTrafficSlots(ctx, [iotCard], alwaysEvening);
    const eveningSlotsWithCards = context.timeSlots.filter(
      (s) => s.period === Period.Evening && s.cards.length > 0,
    );
    expect(eveningSlotsWithCards.length).toBe(1);
  });

  it('fills up to capacity without overload', () => {
    const ctx = makeBaseContext();
    // 4 cards all directed to Morning (4 slots × capacity 1 = fits all)
    const cards: TrafficCard[] = Array.from({ length: 4 }, () => iotCard);
    const { overloadCount, context } = autoFillTrafficSlots(ctx, cards, alwaysMorning);
    expect(overloadCount).toBe(0);
    expect(context.budget).toBe(500_000);
    const morningCards = context.timeSlots
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.cards);
    expect(morningCards).toHaveLength(4);
  });

  it('triggers Overload when target period is full', () => {
    const ctx = makeBaseContext();
    // Morning has 4 slots. Send 5 cards to Morning → 1 overload.
    const cards: TrafficCard[] = Array.from({ length: 5 }, () => iotCard);
    const { overloadCount, context } = autoFillTrafficSlots(ctx, cards, alwaysMorning);
    expect(overloadCount).toBe(1);
    expect(context.budget).toBe(500_000 - 25_000);
  });

  it('overload disables a slot in the next period (Afternoon when Morning overflows)', () => {
    const ctx = makeBaseContext();
    // Fill Morning (4 slots) and send 1 more → overflow to Afternoon
    const cards: TrafficCard[] = Array.from({ length: 5 }, () => iotCard);
    const { context } = autoFillTrafficSlots(ctx, cards, alwaysMorning);
    const disabledAfternoon = context.timeSlots.filter(
      (s) => s.period === Period.Afternoon && s.unavailable,
    );
    expect(disabledAfternoon.length).toBeGreaterThan(0);
  });

  it('returns overloadCount 0 for empty drawn array', () => {
    const ctx = makeBaseContext();
    const { overloadCount, context } = autoFillTrafficSlots(ctx, [], alwaysMorning);
    expect(overloadCount).toBe(0);
    expect(context.timeSlots.flatMap((s) => s.cards)).toHaveLength(0);
  });
});
