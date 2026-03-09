import { describe, expect, it } from 'vitest';
import { autoFillTrafficSlots } from '../autoFillTrafficSlots.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import {
  Period,
  PhaseId,
  type GameContext,
  type TrafficCard,
} from '../types.js';

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
    pendingRevenue: 0,
    seed: 'test-seed',
    skipNextTrafficDraw: false,
    revenueBoostMultiplier: 1,
    drawLog: null,
  };
}

const iotCard: TrafficCard = TRAFFIC_CARDS.find((c) => c.id === 'traffic-iot-burst')!;

/** Returns a context where all 4 Morning slots are pre-filled with iotCard. */
function makeFullMorningContext(): GameContext {
  const ctx = makeBaseContext();
  return {
    ...ctx,
    timeSlots: ctx.timeSlots.map((s) =>
      s.period === Period.Morning ? { ...s, card: iotCard } : s,
    ),
  };
}

describe('autoFillTrafficSlots', () => {
  it('places first card in Morning (round-robin index 0)', () => {
    const ctx = makeBaseContext();
    const { context } = autoFillTrafficSlots(ctx, [iotCard]);
    const morningSlotsWithCards = context.timeSlots.filter(
      (s) => s.period === Period.Morning && s.card !== null,
    );
    expect(morningSlotsWithCards.length).toBe(1);
    // No other period should have cards
    const otherCards = context.timeSlots
      .filter((s) => s.period !== Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(otherCards).toHaveLength(0);
  });

  it('cycles Morning → Afternoon → Evening → Overnight → Morning (round-robin)', () => {
    const ctx = makeBaseContext();
    // card[0]→Morning, card[1]→Afternoon, card[2]→Evening, card[3]→Overnight, card[4]→Morning
    const cards: TrafficCard[] = Array.from({ length: 5 }, () => iotCard);
    const { context } = autoFillTrafficSlots(ctx, cards);
    expect(
      context.timeSlots.filter((s) => s.period === Period.Morning && s.card !== null),
    ).toHaveLength(2);
    expect(
      context.timeSlots.filter((s) => s.period === Period.Afternoon && s.card !== null),
    ).toHaveLength(1);
    expect(
      context.timeSlots.filter((s) => s.period === Period.Evening && s.card !== null),
    ).toHaveLength(1);
    expect(
      context.timeSlots.filter((s) => s.period === Period.Overnight && s.card !== null),
    ).toHaveLength(1);
  });

  it('fills all 16 slots to capacity without overload', () => {
    const ctx = makeBaseContext();
    // 4 periods × 4 slots each = 16 total capacity; round-robin fills one per period per cycle
    const cards: TrafficCard[] = Array.from({ length: 16 }, () => iotCard);
    const { context } = autoFillTrafficSlots(ctx, cards);
    expect(context.budget).toBe(500_000);
    expect(context.timeSlots.flatMap((s) => s.card ? [s.card] : [])).toHaveLength(16);
    // No overload slots created
    expect(context.timeSlots.filter((s) => s.overloaded)).toHaveLength(0);
  });

  it('creates an overload slot when target period is full', () => {
    // Pre-fill all Morning slots; card[0] round-robins to Morning → full → overload
    const ctx = makeFullMorningContext();
    const { context } = autoFillTrafficSlots(ctx, [iotCard]);
    // Budget must not be affected — no monetary penalty
    expect(context.budget).toBe(500_000);
    const overloadSlots = context.timeSlots.filter((s) => s.overloaded === true);
    expect(overloadSlots).toHaveLength(1);
    expect(overloadSlots[0]!.period).toBe(Period.Morning);
    expect(overloadSlots[0]!.card).toBe(iotCard);
  });

  it('overload slot holds the card — does not drop it', () => {
    // Pre-fill Morning (4 slots), send 1 card → 1 overload slot containing the card
    const ctx = makeFullMorningContext();
    const { context } = autoFillTrafficSlots(ctx, [iotCard]);
    const morningNormalCards = context.timeSlots
      .filter((s) => s.period === Period.Morning && !s.overloaded)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(morningNormalCards).toHaveLength(4);
    const overloadCards = context.timeSlots
      .filter((s) => s.period === Period.Morning && s.overloaded)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(overloadCards).toHaveLength(1);
    // Other periods untouched
    const otherCards = context.timeSlots
      .filter((s) => s.period !== Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(otherCards).toHaveLength(0);
  });

  it('returns empty drawn array without changes', () => {
    const ctx = makeBaseContext();
    const { context } = autoFillTrafficSlots(ctx, []);
    expect(context.timeSlots.flatMap((s) => s.card ? [s.card] : [])).toHaveLength(0);
    expect(context.timeSlots.filter((s) => s.overloaded)).toHaveLength(0);
  });
});
