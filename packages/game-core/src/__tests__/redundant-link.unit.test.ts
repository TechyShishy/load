import { describe, expect, it } from 'vitest';
import { playActionCard } from '../processCrisis.js';
import { resolveRound } from '../resolveRound.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { RedundantLinkCard } from '../data/actions/RedundantLinkCard.js';
import { PhaseId, SlotType, Period } from '../types.js';
import { safeContext, ctxWithHandCardsFixedIds, ctxWithCardOnSlot } from './testHelpers.js';
import { FourKStreamCard } from '../data/traffic/FourKStreamCard.js';

const redundantLink = ACTION_CARDS.find((c) => c.id === 'action-redundant-link')!;

describe('RedundantLinkCard', () => {
  it('is registered and findable in ACTION_CARDS', () => {
    expect(redundantLink).toBeDefined();
    expect(redundantLink.templateId).toBe('action-redundant-link');
  });

  it('has cost of 45_000', () => {
    expect(redundantLink.cost).toBe(45_000);
  });

  it('is allowed on weekends', () => {
    expect(redundantLink.allowedOnWeekend).toBe(true);
  });

  it('deducts cost from budget', () => {
    const ctx = ctxWithHandCardsFixedIds(
      [redundantLink],
      safeContext('test-seed', { activePhase: PhaseId.Scheduling }),
    );
    const updated = playActionCard(ctx, redundantLink);
    expect(updated.budget).toBe(500_000 - 45_000);
  });

  it('removes the card from hand', () => {
    const ctx = ctxWithHandCardsFixedIds(
      [redundantLink],
      safeContext('test-seed', { activePhase: PhaseId.Scheduling }),
    );
    const updated = playActionCard(ctx, redundantLink);
    expect(updated.handOrder).not.toContain(redundantLink.id);
  });

  it('adds the card to playedThisRound', () => {
    const ctx = ctxWithHandCardsFixedIds(
      [redundantLink],
      safeContext('test-seed', { activePhase: PhaseId.Scheduling }),
    );
    const updated = playActionCard(ctx, redundantLink);
    expect(updated.playedThisRoundOrder).toContain(redundantLink.id);
  });

  it('sets slaForgivenessThisRound to 2', () => {
    const ctx = ctxWithHandCardsFixedIds(
      [redundantLink],
      safeContext('test-seed', { activePhase: PhaseId.Scheduling }),
    );
    const updated = playActionCard(ctx, redundantLink);
    expect(updated.slaForgivenessThisRound).toBe(2);
  });

  it('resolveRound forgives up to 2 overloaded cards and resets the field to 0', () => {
    const cardA = new FourKStreamCard('4k-a');
    const cardB = new FourKStreamCard('4k-b');
    // Place both in overloaded slots
    let ctx = safeContext('test-seed', { slaCount: 0, slaForgivenessThisRound: 2 });
    ctx = ctxWithCardOnSlot(cardA, Period.Morning, 0, ctx, SlotType.Overloaded);
    ctx = ctxWithCardOnSlot(cardB, Period.Morning, 1, ctx, SlotType.Overloaded);

    const { context, summary } = resolveRound(ctx);
    // 2 overloaded, 2 forgiven → net 0 SLA increment
    expect(context.slaCount).toBe(0);
    expect(summary.failedCount).toBe(2);
    expect(summary.forgivenCount).toBe(2);
    // forgiveness is consumed and reset
    expect(context.slaForgivenessThisRound).toBe(0);
  });

  it('resolveRound only forgives up to the number of actual failures (partial forgiveness)', () => {
    const cardA = new FourKStreamCard('4k-a');
    // 1 overload but 2 forgiveness available → only 1 failure, 1 forgiven, net 0
    let ctx = safeContext('test-seed', { slaCount: 1, slaForgivenessThisRound: 2 });
    ctx = ctxWithCardOnSlot(cardA, Period.Morning, 0, ctx, SlotType.Overloaded);

    const { context } = resolveRound(ctx);
    expect(context.slaCount).toBe(1); // slaCount unchanged (was 1, +1 failure, -1 forgiven)
    expect(context.slaForgivenessThisRound).toBe(0);
  });

  it('resolveRound with no forgiveness behaves as before', () => {
    const cardA = new FourKStreamCard('4k-a');
    let ctx = safeContext('test-seed', { slaCount: 0, slaForgivenessThisRound: 0 });
    ctx = ctxWithCardOnSlot(cardA, Period.Morning, 0, ctx, SlotType.Overloaded);

    const { context, summary } = resolveRound(ctx);
    expect(context.slaCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.forgivenCount).toBe(0);
    expect(context.slaForgivenessThisRound).toBe(0);
  });

  it('playing two copies stacks additively to 4 forgiveness', () => {
    const card1 = new RedundantLinkCard('redundant-link-1');
    const card2 = new RedundantLinkCard('redundant-link-2');
    let ctx = ctxWithHandCardsFixedIds(
      [card1, card2],
      safeContext('test-seed', { activePhase: PhaseId.Scheduling }),
    );
    ctx = playActionCard(ctx, card1);
    ctx = playActionCard(ctx, ctx.cardInstances[card2.id] as typeof card2);
    expect(ctx.slaForgivenessThisRound).toBe(4);
    // Both cards paid for and consumed
    expect(ctx.budget).toBe(500_000 - 45_000 - 45_000);
    expect(ctx.handOrder).not.toContain(card1.id);
    expect(ctx.handOrder).not.toContain(card2.id);
  });
});
