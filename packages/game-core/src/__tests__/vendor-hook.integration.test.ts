import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine } from '../machine.js';
import { VendorCard, type GameContext } from '../types.js';
import { safeContext } from './testHelpers.js';

// ── Mock vendor cards ──────────────────────────────────────────────────────────

/** Adds $100 to budget on every resolution pass, with a matching vendor-revenue ledger entry. */
class MockVendorCard extends VendorCard {
  readonly templateId = 'vendor-mock-integration';
  readonly id: string;
  readonly name = 'Mock Vendor';
  readonly cost = 0;
  readonly description = 'Integration-test-only mock vendor';

  constructor(id = 'vendor-mock-int-1') {
    super();
    this.id = id;
  }

  onResolve(ctx: GameContext): GameContext {
    return {
      ...ctx,
      budget: ctx.budget + 100,
      pendingLedger: [
        ...ctx.pendingLedger,
        { kind: 'vendor-revenue' as const, amount: 100, label: this.name },
      ],
    };
  }
}

/** Deducts $50 from budget on every crisis pass via onCrisis. No resolution effect. */
class MockVendorCardCrisisOnly extends VendorCard {
  readonly templateId = 'vendor-mock-crisis-only';
  readonly id: string;
  readonly name = 'Mock Crisis Vendor';
  readonly cost = 0;
  readonly description = 'Integration-test-only vendor with onCrisis only';

  constructor(id = 'vendor-mock-crisis-1') {
    super();
    this.id = id;
  }

  onResolve(ctx: GameContext): GameContext {
    return ctx;
  }

  override onCrisis(ctx: GameContext): GameContext {
    return { ...ctx, budget: ctx.budget - 50 };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type TestActor = ReturnType<typeof createActor<typeof gameMachine>>;

function drawComplete(actor: TestActor) {
  actor.send({ type: 'DRAW_COMPLETE' });
}

function advanceRound(actor: TestActor) {
  actor.send({ type: 'ADVANCE' }); // scheduling → crisis
  actor.send({ type: 'ADVANCE' }); // crisis → resolution → end → draw
  drawComplete(actor);             // draw → scheduling
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('integration: vendor onResolve accumulates over rounds', () => {
  it('mock vendor budget+100 per round increments by 200 over two rounds', () => {
    const mockCard = new MockVendorCard();
    const base = safeContext('vendor-hook-int-test');
    const ctx = {
      ...base,
      vendorSlots: base.vendorSlots.map((s) =>
        s.index === 0 ? { ...s, card: mockCard } : s,
      ),
    };

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    drawComplete(actor); // draw → scheduling (round 1)

    expect(actor.getSnapshot().value).toBe('scheduling');
    const budgetStart = actor.getSnapshot().context.budget;

    advanceRound(actor); // round 1 resolves → onResolve fires once
    expect(actor.getSnapshot().value).toBe('scheduling');
    const budgetAfterRound1 = actor.getSnapshot().context.budget;
    expect(budgetAfterRound1 - budgetStart).toBe(100);

    advanceRound(actor); // round 2 resolves → onResolve fires again
    expect(actor.getSnapshot().value).toBe('scheduling');
    const budgetAfterRound2 = actor.getSnapshot().context.budget;
    expect(budgetAfterRound2 - budgetStart).toBe(200);
  });

  it('empty vendor slots produce no budget change beyond baseline', () => {
    const base = safeContext('vendor-hook-empty-test');
    // No cards in slots — all card: null (the safeContext default)

    const actor = createActor(gameMachine, { input: base });
    actor.start();
    drawComplete(actor);

    const budgetStart = actor.getSnapshot().context.budget;

    advanceRound(actor);
    advanceRound(actor);

    // safeContext has no events and no action cards played, so the only budget
    // change would be from vendor hooks — which should be zero here.
    const budgetAfterTwoRounds = actor.getSnapshot().context.budget;
    expect(budgetAfterTwoRounds).toBe(budgetStart);
  });

  it('two occupied slots each with onResolve compound: +200 per round over two rounds', () => {
    const card0 = new MockVendorCard('vendor-int-0');
    const card1 = new MockVendorCard('vendor-int-1');
    const base = safeContext('vendor-hook-two-cards-test');
    const ctx = {
      ...base,
      vendorSlots: base.vendorSlots.map((s) => {
        if (s.index === 0) return { ...s, card: card0 };
        if (s.index === 1) return { ...s, card: card1 };
        return s;
      }),
    };

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    drawComplete(actor);

    const budgetStart = actor.getSnapshot().context.budget;

    advanceRound(actor);
    const budgetAfterRound1 = actor.getSnapshot().context.budget;
    expect(budgetAfterRound1 - budgetStart).toBe(200);

    advanceRound(actor);
    const budgetAfterRound2 = actor.getSnapshot().context.budget;
    expect(budgetAfterRound2 - budgetStart).toBe(400);
  });
});

describe('integration: vendor onCrisis fires through full machine cycle', () => {
  it('mock vendor with onCrisis budget-50 applies during crisis pass each round', () => {
    const crisisCard = new MockVendorCardCrisisOnly();
    const base = safeContext('vendor-hook-crisis-test');
    const ctx = {
      ...base,
      vendorSlots: base.vendorSlots.map((s) =>
        s.index === 0 ? { ...s, card: crisisCard } : s,
      ),
    };

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    drawComplete(actor);

    const budgetStart = actor.getSnapshot().context.budget;

    advanceRound(actor); // round 1: onCrisis -50, onResolve no-op
    expect(actor.getSnapshot().value).toBe('scheduling');
    const budgetAfterRound1 = actor.getSnapshot().context.budget;
    expect(budgetAfterRound1 - budgetStart).toBe(-50);

    advanceRound(actor); // round 2: second crisis pass
    const budgetAfterRound2 = actor.getSnapshot().context.budget;
    expect(budgetAfterRound2 - budgetStart).toBe(-100);
  });
});
