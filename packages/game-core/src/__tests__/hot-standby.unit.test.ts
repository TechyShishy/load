import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine } from '../machine.js';
import { playActionCard } from '../processCrisis.js';
import { ACTION_CARDS, ACTION_CARD_REGISTRY, HotStandbyCard } from '../data/actions/index.js';
import { AWSOutageCard } from '../data/events/index.js';
import { DDoSAttackCard } from '../data/events/index.js';
import { safeContext, ctxWithHandCardsFixedIds, ctxWithPendingEvents } from './testHelpers.js';
import { PhaseId, type GameContext } from '../types.js';

const hotStandby = ACTION_CARDS.find((c) => c.templateId === 'action-hot-standby')!;

// ─── HotStandbyCard — unit tests ──────────────────────────────────────────────

describe('HotStandbyCard — fields', () => {
  it('is registered and findable in ACTION_CARDS', () => {
    expect(hotStandby).toBeDefined();
    expect(hotStandby.templateId).toBe('action-hot-standby');
  });

  it('is in ACTION_CARD_REGISTRY and constructable', () => {
    const Ctor = ACTION_CARD_REGISTRY.get('action-hot-standby');
    expect(Ctor).toBeDefined();
    const instance = new Ctor!('test-id');
    expect(instance.templateId).toBe('action-hot-standby');
  });

  it('has cost of 15_000', () => {
    expect(hotStandby.cost).toBe(15_000);
  });

  it('is crisis-only', () => {
    expect(hotStandby.crisisOnly).toBe(true);
  });

  it('is allowed on weekends', () => {
    expect(hotStandby.allowedOnWeekend).toBe(true);
  });

  it('is valid only for event-aws-outage', () => {
    expect(hotStandby.validForEventTemplateIds).toEqual(['event-aws-outage']);
  });

  it('has no valid drop zones (auto-applied)', () => {
    expect(hotStandby.validDropZones).toHaveLength(0);
  });
});

describe('HotStandbyCard — apply', () => {
  function ctxWithOutageInHand(): { ctx: GameContext; card: HotStandbyCard; outage: AWSOutageCard } {
    const card = new HotStandbyCard('action-hot-standby-test');
    const outage = new AWSOutageCard('event-aws-outage-test');
    const base = safeContext('test-seed', { activePhase: PhaseId.Crisis });
    const withCard = ctxWithHandCardsFixedIds([card], base);
    const ctx: GameContext = {
      ...withCard,
      cardInstances: {
        ...withCard.cardInstances,
        [outage.id]: outage,
      },
      pendingEventsOrder: [outage.id],
      mitigatedEventIds: [],
    };
    return { ctx, card, outage };
  }

  it('deducts cost from budget', () => {
    const { ctx, card } = ctxWithOutageInHand();
    const result = playActionCard(ctx, card);
    expect(result.budget).toBe(500_000 - 15_000);
  });

  it('removes the card from hand', () => {
    const { ctx, card } = ctxWithOutageInHand();
    const result = playActionCard(ctx, card);
    expect(result.handOrder).not.toContain(card.id);
  });

  it('adds the card to playedThisRound', () => {
    const { ctx, card } = ctxWithOutageInHand();
    const result = playActionCard(ctx, card);
    expect(result.playedThisRoundOrder).toContain(card.id);
  });

  it('adds the outage event id to mitigatedEventIds', () => {
    const { ctx, card, outage } = ctxWithOutageInHand();
    const result = playActionCard(ctx, card);
    expect(result.mitigatedEventIds).toContain(outage.id);
  });

  it('AWSOutageCard.onCrisis does nothing when mitigated', () => {
    const { ctx, card, outage } = ctxWithOutageInHand();
    const afterPlay = playActionCard(ctx, card);
    const mitigated = afterPlay.mitigatedEventIds.includes(outage.id);
    const afterCrisis = outage.onCrisis(afterPlay, mitigated);
    expect(afterCrisis.budget).toBe(afterPlay.budget); // no $25k deduction
    expect(afterCrisis.skipNextTrafficDraw).toBe(false); // draw not skipped
  });
});

// ─── HotStandbyCard — guard integration ───────────────────────────────────────
// These tests drive PLAY_ACTION through the machine to verify
// isActionValidForCrisisTarget auto-discovers only event-aws-outage events,
// not the first unmitigated event of any type.

describe('HotStandbyCard — guard: auto-discovery with mixed pending events', () => {
  it('is playable when the outage is the only pending event', () => {
    const hotStandby = new HotStandbyCard('hs-test');
    const outage = new AWSOutageCard('ev-outage');
    const base = ctxWithPendingEvents(
      [outage],
      safeContext('guard-test', { round: 1, budget: 100_000, activePhase: PhaseId.Crisis }),
    );
    const ctx = ctxWithHandCardsFixedIds([hotStandby], base);
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    actor.send({ type: 'PLAY_ACTION', card: hotStandby });
    expect(actor.getSnapshot().context.mitigatedEventIds).toContain(outage.id);
    expect(actor.getSnapshot().context.budget).toBe(100_000 - 15_000);
  });

  it('is playable when a non-outage event precedes the outage in pendingEventsOrder', () => {
    // This is the regression case: if the guard picked the first unmitigated event
    // regardless of type, it would pick the DDoS event, fail the templateId check,
    // and silently block HotStandby even though a valid target exists.
    const hotStandby = new HotStandbyCard('hs-test-2');
    const ddos = new DDoSAttackCard('ev-ddos-first');
    const outage = new AWSOutageCard('ev-outage-second');
    const base = ctxWithPendingEvents(
      [ddos, outage],
      safeContext('guard-test-2', { round: 1, budget: 100_000, activePhase: PhaseId.Crisis }),
    );
    const ctx = ctxWithHandCardsFixedIds([hotStandby], base);
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    actor.send({ type: 'PLAY_ACTION', card: hotStandby });
    // Should have played: outage is mitigated, DDoS is not, cost deducted
    expect(actor.getSnapshot().context.mitigatedEventIds).toContain(outage.id);
    expect(actor.getSnapshot().context.mitigatedEventIds).not.toContain(ddos.id);
    expect(actor.getSnapshot().context.budget).toBe(100_000 - 15_000);
  });

  it('is rejected when no AWS Outage is pending (only DDoS)', () => {
    const hotStandby = new HotStandbyCard('hs-test-3');
    const ddos = new DDoSAttackCard('ev-ddos-only');
    const base = ctxWithPendingEvents(
      [ddos],
      safeContext('guard-test-3', { round: 1, budget: 100_000, activePhase: PhaseId.Crisis }),
    );
    const ctx = ctxWithHandCardsFixedIds([hotStandby], base);
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    actor.send({ type: 'PLAY_ACTION', card: hotStandby });
    // Guard should block: no valid target → hand and budget unchanged
    expect(actor.getSnapshot().context.playedThisRoundOrder).toHaveLength(0);
    expect(actor.getSnapshot().context.handOrder).toHaveLength(1);
    expect(actor.getSnapshot().context.budget).toBe(100_000);
  });
});
