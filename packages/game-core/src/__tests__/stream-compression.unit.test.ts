import { describe, expect, it } from 'vitest';
import { playActionCard } from '../processCrisis.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { FourKStreamCard } from '../data/traffic/FourKStreamCard.js';
import { IoTBurstCard } from '../data/traffic/IoTBurstCard.js';
import { CloudBackupCard } from '../data/traffic/CloudBackupCard.js';
import { Period, PhaseId, type GameContext } from '../types.js';

const streamComp = ACTION_CARDS.find((c) => c.id === 'action-stream-compression')!;

function makeCtx(overrides: Partial<GameContext> = {}): GameContext {
  return {
    budget: 500_000,
    round: 1,
    slaCount: 0,
    hand: [streamComp],
    playedThisRound: [],
    timeSlots: createInitialTimeSlots(),
    tracks: createInitialTracks(),
    vendorSlots: createVendorSlots(),
    pendingEvents: [],
    mitigatedEventIds: [],
    activePhase: PhaseId.Crisis,
    trafficDeck: [],
    trafficDiscard: [],
    eventDeck: [],
    eventDiscard: [],
    spawnedTrafficQueue: [],
    actionDeck: ACTION_CARDS,
    actionDiscard: [],
    lastRoundSummary: null,
    loseReason: null,
    pendingRevenue: 0,
    seed: 'test-seed',
    skipNextTrafficDraw: false,
    drawLog: null,
    ...overrides,
  };
}

describe('StreamCompressionCard', () => {
  it('is registered and findable in ACTION_CARDS', () => {
    expect(streamComp).toBeDefined();
    expect(streamComp.templateId).toBe('action-stream-compression');
  });

  it('deducts cost from budget', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);
    expect(updated.budget).toBe(500_000 - streamComp.cost);
  });

  it('removes the card from hand', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);
    expect(updated.hand.find((c) => c.id === streamComp.id)).toBeUndefined();
  });

  it('adds the card to playedThisRound', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);
    expect(updated.playedThisRound.find((c) => c.id === streamComp.id)).toBeDefined();
  });

  it('removes both duplicate cards when 2 of the same type are in the period', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    // Place them in slot 0 and slot 1 of Morning
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: a };
      if (slot.period === Period.Morning && slot.index === 1) return { ...slot, card: b };
      return slot;
    });
    const ctx = makeCtx({ timeSlots });
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = updated.timeSlots
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(morningCards).toHaveLength(0);
  });

  it('collects revenue for both removed cards', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: a };
      if (slot.period === Period.Morning && slot.index === 1) return { ...slot, card: b };
      return slot;
    });
    const ctx = makeCtx({ timeSlots });
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const expectedBudget = 500_000 - streamComp.cost + a.revenue + b.revenue;
    expect(updated.budget).toBe(expectedBudget);
    expect(updated.pendingRevenue).toBe(a.revenue + b.revenue);
  });

  it('only removes the duplicated type when mixed types are present', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    const iot = new IoTBurstCard('iot-1');
    // IoT appears first (slot 0), 4K appears in slots 1 and 2
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: iot };
      if (slot.period === Period.Morning && slot.index === 1) return { ...slot, card: a };
      if (slot.period === Period.Morning && slot.index === 2) return { ...slot, card: b };
      return slot;
    });
    const ctx = makeCtx({ timeSlots });
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = updated.timeSlots
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    // IoT is unique (first in order) so iteration skips it; 4K has a duplicate → both 4K removed
    expect(morningCards).toHaveLength(1);
    expect(morningCards[0]!.id).toBe(iot.id);
  });

  it('removes exactly 2 when 3 of the same type exist', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    const c = new FourKStreamCard('4k-c');
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: a };
      if (slot.period === Period.Morning && slot.index === 1) return { ...slot, card: b };
      if (slot.period === Period.Morning && slot.index === 2) return { ...slot, card: c };
      return slot;
    });
    const ctx = makeCtx({ timeSlots });
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = updated.timeSlots
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(morningCards).toHaveLength(1);
    expect(morningCards[0]!.templateId).toBe('traffic-4k-stream');
  });

  it('skips first unique type and removes 2 of the second type when it has a duplicate', () => {
    const iot = new IoTBurstCard('iot-1');
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    // IoT is first, appears only once; 4K appears twice after it
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: iot };
      if (slot.period === Period.Morning && slot.index === 1) return { ...slot, card: a };
      if (slot.period === Period.Morning && slot.index === 2) return { ...slot, card: b };
      return slot;
    });
    const ctx = makeCtx({ timeSlots });
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = updated.timeSlots
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(morningCards).toHaveLength(1);
    expect(morningCards[0]!.id).toBe(iot.id);
  });

  it('falls back to removing 1 card when all types in the period are unique', () => {
    const iot = new IoTBurstCard('iot-1');
    const fk = new FourKStreamCard('4k-1');
    const cb = new CloudBackupCard('cb-1');
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: iot };
      if (slot.period === Period.Morning && slot.index === 1) return { ...slot, card: fk };
      if (slot.period === Period.Morning && slot.index === 2) return { ...slot, card: cb };
      return slot;
    });
    const ctx = makeCtx({ timeSlots });
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = updated.timeSlots
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    // First card (IoT) removed; the other two remain
    expect(morningCards).toHaveLength(2);
    expect(morningCards.find((c) => c.id === iot.id)).toBeUndefined();
  });

  it('leaves context unchanged when the targeted period is empty', () => {
    const ctx = makeCtx(); // all slots start empty
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const morningCards = updated.timeSlots
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(morningCards).toHaveLength(0);
    // Budget only decremented by cost; no revenue change
    expect(updated.budget).toBe(500_000 - streamComp.cost);
    expect(updated.pendingRevenue).toBe(0);
  });

  it('is a no-op (other than cost) when targetPeriod is omitted', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: a };
      if (slot.period === Period.Morning && slot.index === 1) return { ...slot, card: b };
      return slot;
    });
    const ctx = makeCtx({ timeSlots });
    const updated = playActionCard(ctx, streamComp); // no targetPeriod

    const morningCards = updated.timeSlots
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    // Cards untouched; cost still deducted (commit() always runs)
    expect(morningCards).toHaveLength(2);
    expect(updated.budget).toBe(500_000 - streamComp.cost);
  });

  it('leaves context fully unchanged when card is not in hand', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: a };
      if (slot.period === Period.Morning && slot.index === 1) return { ...slot, card: b };
      return slot;
    });
    const ctx = makeCtx({ hand: [], timeSlots }); // card not in hand
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    expect(updated.budget).toBe(500_000); // no cost deducted
    const morningCards = updated.timeSlots
      .filter((s) => s.period === Period.Morning)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(morningCards).toHaveLength(2);
  });

  it('does not affect cards outside the targeted period', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    const eve = new FourKStreamCard('4k-eve');
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: a };
      if (slot.period === Period.Morning && slot.index === 1) return { ...slot, card: b };
      if (slot.period === Period.Evening && slot.index === 0) return { ...slot, card: eve };
      return slot;
    });
    const ctx = makeCtx({ timeSlots });
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    const eveningCards = updated.timeSlots
      .filter((s) => s.period === Period.Evening)
      .flatMap((s) => s.card ? [s.card] : []);
    expect(eveningCards).toHaveLength(1);
    expect(eveningCards[0]!.id).toBe(eve.id);
  });

  it('adds removed cards to trafficDiscard', () => {
    const a = new FourKStreamCard('4k-a');
    const b = new FourKStreamCard('4k-b');
    const timeSlots = createInitialTimeSlots().map((slot) => {
      if (slot.period === Period.Morning && slot.index === 0) return { ...slot, card: a };
      if (slot.period === Period.Morning && slot.index === 1) return { ...slot, card: b };
      return slot;
    });
    const ctx = makeCtx({ timeSlots });
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);

    expect(updated.trafficDiscard).toHaveLength(2);
    expect(updated.trafficDiscard.map((c) => c.id)).toContain(a.id);
    expect(updated.trafficDiscard.map((c) => c.id)).toContain(b.id);
  });

  it('does not add to trafficDiscard when period is empty', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, streamComp, undefined, undefined, Period.Morning);
    expect(updated.trafficDiscard).toHaveLength(0);
  });
});
