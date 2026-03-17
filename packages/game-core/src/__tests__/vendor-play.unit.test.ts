import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine } from '../machine.js';
import { playVendorCard } from '../processCrisis.js';
import { dehydrateContext, hydrateContext } from '../serialization.js';
import { VENDOR_CARD_REGISTRY } from '../data/vendors/index.js';
import { CardType, PhaseId, VendorCard, type GameContext } from '../types.js';
import { safeContext } from './testHelpers.js';

// ─── Slot-index dual-convention note ──────────────────────────────────────────
// vendorSlots[i].index === i for all i is an invariant established by
// createVendorSlots() and preserved by hydrateContext. The guard uses
// positional access (vendorSlots[slotIndex]?) while playVendorCard writes
// using field equality (s.index === slotIndex). These are equivalent while the
// invariant holds; a comment here documents the dependency so it isn't silently
// broken by a future reorder.

// ─── Minimal concrete VendorCard for testing ──────────────────────────────────

class MockVendorCard extends VendorCard {
  readonly templateId = 'vendor-mock-play';
  readonly id: string;
  readonly name = 'Mock Vendor Play';
  readonly cost: number;
  readonly description = 'A mock vendor card for play tests.';

  constructor(instanceId: string, cost = 10_000) {
    super();
    this.id = instanceId;
    this.cost = cost;
  }

  onResolve(ctx: GameContext): GameContext {
    return ctx;
  }
}

VENDOR_CARD_REGISTRY.set('vendor-mock-play', MockVendorCard);
afterAll(() => { VENDOR_CARD_REGISTRY.delete('vendor-mock-play'); });

// ─── Helper: context with vendor card in hand ─────────────────────────────────

function ctxWithVendorInHand(cost = 10_000): { ctx: GameContext; card: MockVendorCard } {
  const card = new MockVendorCard('vendor-play-instance-1', cost);
  const base = safeContext();
  const ctx: GameContext = {
    ...base,
    cardInstances: { ...base.cardInstances, [card.id]: card },
    handOrder: [...base.handOrder, card.id],
  };
  return { ctx, card };
}

// ─── playVendorCard (direct function) ────────────────────────────────────────

describe('playVendorCard — successful play', () => {
  it('removes the card from handOrder', () => {
    const { ctx, card } = ctxWithVendorInHand();
    const result = playVendorCard(ctx, card, 0);
    expect(result.handOrder).not.toContain(card.id);
  });

  it('places the card in the target vendor slot', () => {
    const { ctx, card } = ctxWithVendorInHand();
    const result = playVendorCard(ctx, card, 0);
    expect(result.vendorSlots[0]?.card).toBe(card);
  });

  it('decrements budget by card.cost', () => {
    const { ctx, card } = ctxWithVendorInHand(10_000);
    const result = playVendorCard(ctx, card, 0);
    expect(result.budget).toBe(ctx.budget - 10_000);
  });

  it('appends a vendor-spend ledger entry when cost > 0', () => {
    const { ctx, card } = ctxWithVendorInHand(10_000);
    const result = playVendorCard(ctx, card, 0);
    expect(result.pendingLedger).toHaveLength(ctx.pendingLedger.length + 1);
    const entry = result.pendingLedger[result.pendingLedger.length - 1]!;
    expect(entry.kind).toBe('vendor-spend');
    expect(entry.amount).toBe(10_000);
    expect(entry.label).toBe(card.name);
  });

  it('does NOT enter playedThisRoundOrder or actionDiscardOrder', () => {
    const { ctx, card } = ctxWithVendorInHand();
    const result = playVendorCard(ctx, card, 0);
    expect(result.playedThisRoundOrder).not.toContain(card.id);
    expect(result.actionDiscardOrder).not.toContain(card.id);
  });

  it('places into a non-zero slot index', () => {
    const { ctx, card } = ctxWithVendorInHand();
    const result = playVendorCard(ctx, card, 2);
    expect(result.vendorSlots[2]?.card).toBe(card);
    expect(result.vendorSlots[0]?.card).toBeNull();
  });
});

describe('playVendorCard — zero-cost card', () => {
  it('does not append a ledger entry when cost is 0', () => {
    const { ctx, card } = ctxWithVendorInHand(0);
    const result = playVendorCard(ctx, card, 0);
    expect(result.pendingLedger).toHaveLength(ctx.pendingLedger.length);
  });

  it('budget is unchanged for zero-cost card', () => {
    const { ctx, card } = ctxWithVendorInHand(0);
    const result = playVendorCard(ctx, card, 0);
    expect(result.budget).toBe(ctx.budget);
  });
});

describe('playVendorCard — guard fallbacks (no-op on precondition failure)', () => {
  it('returns ctx unchanged when card is not in hand', () => {
    const base = safeContext();
    const card = new MockVendorCard('not-in-hand', 5_000);
    const result = playVendorCard(base, card, 0);
    expect(result).toBe(base);
  });

  it('returns ctx unchanged when slot is already occupied', () => {
    const { ctx, card } = ctxWithVendorInHand();
    const occupyingCard = new MockVendorCard('occupying', 1_000);
    const ctxOccupied: GameContext = {
      ...ctx,
      vendorSlots: ctx.vendorSlots.map((s) =>
        s.index === 0 ? { ...s, card: occupyingCard } : s,
      ),
    };
    const result = playVendorCard(ctxOccupied, card, 0);
    expect(result).toBe(ctxOccupied);
  });

  it('returns ctx unchanged when budget is insufficient', () => {
    const { ctx, card } = ctxWithVendorInHand(10_000);
    const poorCtx: GameContext = { ...ctx, budget: 5_000 };
    const result = playVendorCard(poorCtx, card, 0);
    expect(result).toBe(poorCtx);
  });

  it('succeeds when budget exactly equals card cost (canAffordVendor boundary)', () => {
    const { ctx, card } = ctxWithVendorInHand(10_000);
    const exactCtx: GameContext = { ...ctx, budget: 10_000 };
    const result = playVendorCard(exactCtx, card, 0);
    expect(result.vendorSlots[0]?.card).toBe(card);
    expect(result.budget).toBe(0);
  });
});

// ─── Machine: PLAY_VENDOR event ───────────────────────────────────────────────

let vendorCard: MockVendorCard;

beforeAll(() => {
  vendorCard = new MockVendorCard('vendor-machine-instance', 10_000);
});

function getToSchedulingWithVendor(): ReturnType<typeof createActor<typeof gameMachine>> {
  // Use isSavedScheduling: pass activePhase: Scheduling so the machine's init
  // state transitions directly to scheduling without firing performDraw.
  const base = safeContext('test-seed', { activePhase: PhaseId.Scheduling, budget: 500_000 });
  const input: GameContext = {
    ...base,
    cardInstances: { ...base.cardInstances, [vendorCard.id]: vendorCard },
    handOrder: [...base.handOrder, vendorCard.id],
  };
  const actor = createActor(gameMachine, { input });
  actor.start();
  // init → scheduling via isSavedScheduling; no DRAW_COMPLETE needed.
  expect(actor.getSnapshot().value).toBe('scheduling');
  return actor;
}

describe('machine PLAY_VENDOR — scheduling state', () => {
  it('transitions slot and hand correctly', () => {
    const actor = getToSchedulingWithVendor();
    actor.send({ type: 'PLAY_VENDOR', card: vendorCard, slotIndex: 0 });
    const ctx = actor.getSnapshot().context;
    expect(ctx.handOrder).not.toContain(vendorCard.id);
    expect(ctx.vendorSlots[0]?.card).toBe(vendorCard);
    expect(ctx.budget).toBe(500_000 - 10_000);
    expect(actor.getSnapshot().value).toBe('scheduling');
  });

  it('appends vendor-spend ledger entry', () => {
    const actor = getToSchedulingWithVendor();
    actor.send({ type: 'PLAY_VENDOR', card: vendorCard, slotIndex: 0 });
    const { pendingLedger } = actor.getSnapshot().context;
    expect(pendingLedger.some((e) => e.kind === 'vendor-spend' && e.amount === 10_000)).toBe(true);
  });

  it('guard blocks play to occupied slot — snapshot unchanged', () => {
    const actor = getToSchedulingWithVendor();
    // Occupy slot 0 first.
    actor.send({ type: 'PLAY_VENDOR', card: vendorCard, slotIndex: 0 });
    const snapAfterFirst = actor.getSnapshot().context;

    const card2 = new MockVendorCard('vendor-machine-instance-2', 1_000);
    const input2: GameContext = {
      ...snapAfterFirst,
      activePhase: PhaseId.Scheduling,
      cardInstances: { ...snapAfterFirst.cardInstances, [card2.id]: card2 },
      handOrder: [...snapAfterFirst.handOrder, card2.id],
    };
    const actor2 = createActor(gameMachine, { input: input2 });
    actor2.start(); // isSavedScheduling fires → enters scheduling directly
    expect(actor2.getSnapshot().value).toBe('scheduling');

    const snapBefore = actor2.getSnapshot().context;
    actor2.send({ type: 'PLAY_VENDOR', card: card2, slotIndex: 0 });
    const snapAfter = actor2.getSnapshot().context;
    expect(snapAfter.handOrder).toContain(card2.id);
    expect(snapAfter.budget).toBe(snapBefore.budget);
  });

  it('guard blocks play with insufficient budget — snapshot unchanged', () => {
    const poorCard = new MockVendorCard('vendor-poor', 10_000);
    const base = safeContext('test-seed', { activePhase: PhaseId.Scheduling, budget: 5_000 });
    const input: GameContext = {
      ...base,
      cardInstances: { ...base.cardInstances, [poorCard.id]: poorCard },
      handOrder: [...base.handOrder, poorCard.id],
    };
    const actor = createActor(gameMachine, { input });
    actor.start(); // isSavedScheduling fires → enters scheduling directly
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'PLAY_VENDOR', card: poorCard, slotIndex: 0 });
    const ctx = actor.getSnapshot().context;
    expect(ctx.handOrder).toContain(poorCard.id);
    expect(ctx.budget).toBe(5_000);
  });

  it('guard allows play when budget exactly equals card cost', () => {
    const exactCard = new MockVendorCard('vendor-exact', 10_000);
    const base = safeContext('test-seed', { activePhase: PhaseId.Scheduling, budget: 10_000 });
    const input: GameContext = {
      ...base,
      cardInstances: { ...base.cardInstances, [exactCard.id]: exactCard },
      handOrder: [...base.handOrder, exactCard.id],
    };
    const actor = createActor(gameMachine, { input });
    actor.start();
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'PLAY_VENDOR', card: exactCard, slotIndex: 0 });
    const ctx = actor.getSnapshot().context;
    expect(ctx.handOrder).not.toContain(exactCard.id);
    expect(ctx.vendorSlots[0]?.card).toBe(exactCard);
    expect(ctx.budget).toBe(0);
  });

  it('guard blocks play when card id is not in handOrder', () => {
    const absentCard = new MockVendorCard('vendor-absent', 1_000);
    // Card is in cardInstances but NOT in handOrder.
    const base = safeContext('test-seed', { activePhase: PhaseId.Scheduling, budget: 500_000 });
    const input: GameContext = {
      ...base,
      cardInstances: { ...base.cardInstances, [absentCard.id]: absentCard },
      // handOrder intentionally does not include absentCard.id
    };
    const actor = createActor(gameMachine, { input });
    actor.start();
    expect(actor.getSnapshot().value).toBe('scheduling');

    const snapBefore = actor.getSnapshot().context;
    actor.send({ type: 'PLAY_VENDOR', card: absentCard, slotIndex: 0 });
    const snapAfter = actor.getSnapshot().context;
    expect(snapAfter.vendorSlots[0]?.card).toBeNull();
    expect(snapAfter.budget).toBe(snapBefore.budget);
  });
});

describe('machine PLAY_VENDOR — crisis state rejects event', () => {
  it('PLAY_VENDOR is silently ignored during crisis', () => {
    const crisisCard = new MockVendorCard('vendor-crisis', 10_000);
    const base = safeContext('test-seed', { activePhase: PhaseId.Scheduling, budget: 500_000 });
    const input: GameContext = {
      ...base,
      cardInstances: { ...base.cardInstances, [crisisCard.id]: crisisCard },
      handOrder: [...base.handOrder, crisisCard.id],
    };
    const actor = createActor(gameMachine, { input });
    actor.start(); // enters scheduling via isSavedScheduling
    actor.send({ type: 'ADVANCE' }); // scheduling → crisis
    expect(actor.getSnapshot().value).toBe('crisis');

    const snapBefore = actor.getSnapshot().context;
    actor.send({ type: 'PLAY_VENDOR', card: crisisCard, slotIndex: 0 });
    const snapAfter = actor.getSnapshot().context;
    expect(snapAfter.handOrder).toContain(crisisCard.id);
    expect(snapAfter.budget).toBe(snapBefore.budget);
    expect(actor.getSnapshot().value).toBe('crisis');
  });
});

// ─── Save/load round-trip with placed vendor card ─────────────────────────────

describe('playVendorCard — save/load round-trip', () => {
  it('vendor card in slot survives dehydrate → hydrateContext round-trip', () => {
    const { ctx, card } = ctxWithVendorInHand();
    const placed = playVendorCard(ctx, card, 0);
    expect(placed.vendorSlots[0]?.card).toBe(card);

    const serialized = dehydrateContext(placed);
    expect(serialized.vendorSlots[0]?.card).toEqual({ templateId: card.templateId, instanceId: card.id });

    const restored = hydrateContext(serialized);
    expect(restored).not.toBeNull();
    expect(restored!.vendorSlots[0]?.card?.id).toBe(card.id);
    expect(restored!.vendorSlots[0]?.card?.type).toBe(CardType.Vendor);
    expect(restored!.cardInstances[card.id]).toBeDefined();
  });
});
