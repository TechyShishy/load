import { describe, expect, it } from 'vitest';
import { autoFillTrafficSlots } from '../autoFillTrafficSlots.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { ACTION_CARDS } from '../data/actionCards.js';
import { EVENT_CARDS } from '../data/eventCards.js';
import { TRAFFIC_CARDS } from '../data/trafficCards.js';
import {
  CardType,
  EventSubtype,
  Period,
  PhaseId,
  type EventCard,
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
    trafficEventDeck: [],
    trafficEventDiscard: [],
    actionDeck: [],
    actionDiscard: ACTION_CARDS,
    lastRoundSummary: null,
    loseReason: null,
    seed: 'test-seed',
  };
}

const iotCard: TrafficCard = TRAFFIC_CARDS.find((c) => c.id === 'traffic-iot-burst')!;
const ddosEvent: EventCard = EVENT_CARDS.find((c) => c.id === 'event-ddos-attack')!;
const awsOutageEvent: EventCard = EVENT_CARDS.find((c) => c.id === 'event-aws-outage')!;

describe('autoFillTrafficSlots', () => {
  it('places a single traffic card in the first Morning slot', () => {
    const ctx = makeBaseContext();
    const { context } = autoFillTrafficSlots(ctx, [iotCard]);
    const morningSlotsWithCards = context.timeSlots.filter(
      (s) => s.period === Period.Morning && s.cards.length > 0,
    );
    expect(morningSlotsWithCards.length).toBeGreaterThan(0);
  });

  it('puts event cards in pendingEvents, not time slots', () => {
    const ctx = makeBaseContext();
    const { context } = autoFillTrafficSlots(ctx, [ddosEvent]);
    expect(context.pendingEvents).toHaveLength(1);
    expect(context.pendingEvents[0]?.id).toBe('event-ddos-attack');
    const allCards = context.timeSlots.flatMap((s) => s.cards);
    expect(allCards.every((c) => c.type === CardType.Traffic)).toBe(true);
  });

  it('fills up to capacity without overload', () => {
    const ctx = makeBaseContext();
    // 3 cards, 1 Morning slot capacity is 3, should fit
    const cards: TrafficCard[] = [iotCard, iotCard, iotCard];
    const { context, overloadCount } = autoFillTrafficSlots(ctx, cards);
    expect(overloadCount).toBe(0);
    expect(context.budget).toBe(500_000);
  });

  it('triggers Overload penalty when all slots are full', () => {
    const ctx = makeBaseContext();
    // Fill all 20 slots × 3 capacity = 60 slots. We'll overflow by 1.
    const manyCards: TrafficCard[] = Array.from({ length: 61 }, () => iotCard);
    const { overloadCount, context } = autoFillTrafficSlots(ctx, manyCards);
    expect(overloadCount).toBeGreaterThan(0);
    expect(context.budget).toBeLessThan(500_000);
  });

  it('spawns additional traffic cards from SpawnTraffic event', () => {
    const ctx = makeBaseContext();
    // AWS Outage spawns 2 Cloud Backup cards
    const { context } = autoFillTrafficSlots(ctx, [awsOutageEvent]);
    const allCards = context.timeSlots.flatMap((s) => s.cards);
    // Should have 2 spawned cloud backup cards (IDs are now UUIDs; match by name)
    expect(allCards.filter((c) => c.name === 'Cloud Backup')).toHaveLength(2);
  });

  it('overload disables a slot in the period after the last attempted period, not always Afternoon', () => {
    // Fill Morning, Afternoon, and Evening to full capacity (5 slots × 3 = 15 cards each)
    // so only Overnight slots remain. The next card triggers overload after exhausting
    // Overnight (lastPeriodIndex = 3), so the overflow target wraps to Morning (index 0),
    // NOT Afternoon (index 1) as the bug produced.
    const ctx = makeBaseContext();
    const totalSlots = ctx.timeSlots.length; // 20 slots, 5 per period
    const capacity = 3; // default effectiveCapacity

    // Fill Morning (5 slots × 3 = 15), Afternoon (15), Evening (15) = 45 cards
    // Then fill Overnight (5 slots × 3 = 15) = 60 cards total, then 1 more to trigger overload
    const fillCount = totalSlots * capacity + 1;
    const manyCards: TrafficCard[] = Array.from({ length: fillCount }, () => iotCard);
    const { overloadCount, context } = autoFillTrafficSlots(ctx, manyCards);

    expect(overloadCount).toBeGreaterThan(0);
    // The overload exhausted all periods (last attempted = Overnight, index 3),
    // so overflow wraps to Morning (index 0) — not Afternoon.
    const disabledAfternoon = context.timeSlots.filter(
      (s) => s.period === Period.Afternoon && s.unavailable,
    );
    const disabledMorning = context.timeSlots.filter(
      (s) => s.period === Period.Morning && s.unavailable,
    );
    expect(disabledMorning.length).toBeGreaterThan(0);
    expect(disabledAfternoon.length).toBe(0);
  });

  it('SpawnVendor events are ignored (noOpMVP)', () => {
    const vendorEvent: EventCard = {
      id: 'event-vendor-spawn-test',
      type: CardType.Event,
      name: 'Vendor Spawn Test',
      subtype: EventSubtype.SpawnVendor,
      unmitigatedPenalty: 0,
      downtimePenaltyHours: 0,
      noOpMVP: true,
      description: 'Test no-op vendor spawn event',
    };
    const ctx = makeBaseContext();
    const { context } = autoFillTrafficSlots(ctx, [vendorEvent]);
    // Vendor event goes to pendingEvents but spawns nothing
    expect(context.pendingEvents[0]?.id).toBe('event-vendor-spawn-test');
    expect(context.timeSlots.flatMap((s) => s.cards)).toHaveLength(0);
  });
});
