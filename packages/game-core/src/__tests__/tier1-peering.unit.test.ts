import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { createInitialContext, gameMachine } from '../machine.js';
import { TierOnePeeringCard, EVENT_CARDS, EVENT_CARD_REGISTRY } from '../data/events/index.js';
import { getDayOfWeek } from '../types.js';
import { safeContext } from './testHelpers.js';

function advanceRound(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  actor.send({ type: 'ADVANCE' }); // scheduling → crisis
  actor.send({ type: 'ADVANCE' }); // crisis → resolution → auto → end → draw
  actor.send({ type: 'DRAW_COMPLETE' }); // draw → scheduling
}

// ─── TierOnePeeringCard — fields ──────────────────────────────────────────────

describe('TierOnePeeringCard — fields', () => {
  it('has the expected templateId', () => {
    const card = new TierOnePeeringCard();
    expect(card.templateId).toBe('event-tier1-peering');
  });

  it('label is REVENUE BOOST', () => {
    const card = new TierOnePeeringCard();
    expect(card.label).toBe('REVENUE BOOST');
  });
});

// ─── TierOnePeeringCard — registration ───────────────────────────────────────

describe('TierOnePeeringCard — registration', () => {
  it('is present in EVENT_CARDS', () => {
    const found = EVENT_CARDS.find((c) => c.templateId === 'event-tier1-peering');
    expect(found).toBeDefined();
  });

  it('is in EVENT_CARD_REGISTRY and constructable', () => {
    const Ctor = EVENT_CARD_REGISTRY.get('event-tier1-peering');
    expect(Ctor).toBeDefined();
    const instance = new Ctor!('test-id');
    expect(instance.templateId).toBe('event-tier1-peering');
  });
});

// ─── TierOnePeeringCard — onCrisis ───────────────────────────────────────────

describe('TierOnePeeringCard — onCrisis', () => {
  it('adds 0.5 to revenueBoostMultiplier when unmitigated', () => {
    const card = new TierOnePeeringCard();
    const ctx = createInitialContext();
    const result = card.onCrisis(ctx, false);
    expect(result.revenueBoostMultiplier).toBe(1.5); // 1.0 + 0.5
  });

  it('adds 0.5 to revenueBoostMultiplier when mitigated (beneficial — cannot be cancelled)', () => {
    const card = new TierOnePeeringCard();
    const ctx = createInitialContext();
    const result = card.onCrisis(ctx, true);
    expect(result.revenueBoostMultiplier).toBe(1.5); // 1.0 + 0.5
  });

  it('adds 0.5 to a pre-elevated multiplier (additive stacking)', () => {
    const card = new TierOnePeeringCard();
    const ctx = { ...createInitialContext(), revenueBoostMultiplier: 1.3 };
    const result = card.onCrisis(ctx, false);
    expect(result.revenueBoostMultiplier).toBeCloseTo(1.8, 10);
  });

  it('does not affect budget, SLA count, or spawned traffic', () => {
    const card = new TierOnePeeringCard();
    const ctx = createInitialContext();
    const result = card.onCrisis(ctx, false);
    expect(result.budget).toBe(ctx.budget);
    expect(result.slaCount).toBe(ctx.slaCount);
    expect(result.spawnedQueueOrder).toHaveLength(0);
  });
});

// ─── revenueBoostMultiplier — Monday reset ────────────────────────────────────

describe('revenueBoostMultiplier — Monday reset', () => {
  it('resets to 1 at the start of a Monday round', () => {
    // Start at round 7 (Sunday). actor.start() fires performDraw and lands in draw state.
    // DRAW_COMPLETE on a weekend goes to crisis (not scheduling).
    // ADVANCE from crisis goes to resolution → end (performEnd, round → 8) → draw (performDraw, Monday reset).
    const ctx = safeContext('tier1-test-seed', { round: 7, revenueBoostMultiplier: 1.5 });
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();                               // init → draw, performDraw fires (round 7)
    actor.send({ type: 'DRAW_COMPLETE' });       // draw → crisis (weekend round)
    actor.send({ type: 'ADVANCE' });             // crisis → resolution → end → draw (round 8, Monday)
    const snap = actor.getSnapshot();
    expect(snap.value).toBe('draw'); // phase sanity-check before context assertions
    expect(snap.context.round).toBe(8);
    expect(getDayOfWeek(snap.context.round)).toBe(1); // Monday
    expect(snap.context.revenueBoostMultiplier).toBe(1);
  });

  it('does not reset mid-week', () => {
    // Start at round 3 (Wednesday). actor.start() → draw, DRAW_COMPLETE → scheduling.
    // advanceRound goes scheduling → crisis → resolution → end → draw (round 4) → scheduling.
    const ctx = safeContext('tier1-test-seed', { round: 3, revenueBoostMultiplier: 1.5 });
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();                         // init → draw, performDraw fires (round 3)
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → scheduling (weekday)
    advanceRound(actor);                   // round → 4
    const snap = actor.getSnapshot();
    expect(snap.value).toBe('scheduling'); // phase sanity-check
    expect(snap.context.round).toBe(4);
    expect(snap.context.revenueBoostMultiplier).toBe(1.5);
  });
});
