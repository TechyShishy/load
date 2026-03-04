import { describe, expect, it } from 'vitest';
import { playActionCard, processCrisis } from '../processCrisis.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { ACTION_CARDS } from '../data/actionCards.js';
import { EVENT_CARDS } from '../data/eventCards.js';
import { TRAFFIC_CARDS } from '../data/trafficCards.js';
import {
  PhaseId,
  Track,
  type GameContext,
} from '../types.js';

function makeCtx(overrides: Partial<GameContext> = {}): GameContext {
  const emMaint = ACTION_CARDS.find((c) => c.id === 'action-emergency-maintenance')!;
  const secPatch = ACTION_CARDS.find((c) => c.id === 'action-security-patch')!;
  return {
    budget: 500_000,
    round: 1,
    slaCount: 0,
    hand: [emMaint, secPatch],
    playedThisRound: [],
    timeSlots: createInitialTimeSlots(),
    tracks: createInitialTracks(),
    vendorSlots: createVendorSlots(),
    pendingEvents: [],
    mitigatedEventIds: [],
    activePhase: PhaseId.Crisis,
    trafficEventDeck: [],
    trafficEventDiscard: [],
    actionDeck: ACTION_CARDS,
    actionDiscard: [],
    lastRoundSummary: null,
    loseReason: null,
    pendingOverloadCount: 0,
    seed: 'test-seed',
    ...overrides,
  };
}

const ddosEvent = EVENT_CARDS.find((c) => c.id === 'event-ddos-attack')!;
const activationEvent = EVENT_CARDS.find((c) => c.id === 'event-5g-activation')!;
const emMaint = ACTION_CARDS.find((c) => c.id === 'action-emergency-maintenance')!;
const secPatch = ACTION_CARDS.find((c) => c.id === 'action-security-patch')!;
const trafficPrio = ACTION_CARDS.find((c) => c.id === 'action-traffic-prioritization')!;
const bwUpgrade = ACTION_CARDS.find((c) => c.id === 'action-bandwidth-upgrade')!;

describe('playActionCard', () => {
  it('deducts cost from budget', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, emMaint);
    expect(updated.budget).toBe(500_000 - emMaint.cost);
  });

  it('removes the card from hand', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, emMaint);
    expect(updated.hand.find((c) => c.id === emMaint.id)).toBeUndefined();
  });

  it('adds card to playedThisRound', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, emMaint);
    expect(updated.playedThisRound).toContainEqual(emMaint);
  });

  it('ClearTicket removes first ticket from the target track', () => {
    const ctx = makeCtx({
      tracks: createInitialTracks().map((t) =>
        t.track === Track.BreakFix ? { ...t, tickets: [ddosEvent] } : t,
      ),
    });
    const updated = playActionCard(ctx, emMaint);
    const bfTrack = updated.tracks.find((t) => t.track === Track.BreakFix)!;
    expect(bfTrack.tickets).toHaveLength(0);
  });

  it('RemoveTrafficCard removes the targeted traffic card from its slot', () => {
    const trafficCard = TRAFFIC_CARDS[0]!;
    const slotsWithCard = createInitialTimeSlots().map((s, i) =>
      i === 0 ? { ...s, cards: [trafficCard] } : s,
    );
    const ctx = makeCtx({ hand: [trafficPrio], timeSlots: slotsWithCard });
    const updated = playActionCard(ctx, trafficPrio, undefined, trafficCard.id);
    expect(updated.timeSlots.flatMap((s) => s.cards)).not.toContainEqual(trafficCard);
  });

  it('RemoveTrafficCard credits the traffic card revenue to budget', () => {
    const trafficCard = TRAFFIC_CARDS[0]!;
    const slotsWithCard = createInitialTimeSlots().map((s, i) =>
      i === 0 ? { ...s, cards: [trafficCard] } : s,
    );
    const ctx = makeCtx({ hand: [trafficPrio], timeSlots: slotsWithCard });
    const updated = playActionCard(ctx, trafficPrio, undefined, trafficCard.id);
    expect(updated.budget).toBe(500_000 - trafficPrio.cost + trafficCard.revenue);
  });

  it('RemoveTrafficCard is a no-op when no targetTrafficCardId is given', () => {
    const ctx = makeCtx({ hand: [trafficPrio] });
    const updated = playActionCard(ctx, trafficPrio);
    expect(updated.timeSlots).toEqual(ctx.timeSlots);
  });

  it('BoostSlotCapacity increases slot capacityBoost for target period', () => {
    const ctx = makeCtx({ hand: [bwUpgrade] });
    const updated = playActionCard(ctx, bwUpgrade);
    const boostedSlots = updated.timeSlots.filter((s) => s.period === bwUpgrade.targetPeriod);
    expect(boostedSlots.every((s) => s.capacityBoost >= 1)).toBe(true);
  });

  it('MitigateDDoS adds event id to mitigatedEventIds', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, secPatch, ddosEvent.id);
    expect(updated.mitigatedEventIds).toContain(ddosEvent.id);
  });

  it('does nothing if card is not in hand', () => {
    const ctx = makeCtx({ hand: [] });
    const updated = playActionCard(ctx, emMaint);
    expect(updated.budget).toBe(500_000);
  });
});

describe('processCrisis', () => {
  it('issues ticket to Break/Fix for DDoS event', () => {
    const ctx = makeCtx({ pendingEvents: [ddosEvent] });
    const { context } = processCrisis(ctx);
    const bfTrack = context.tracks.find((t) => t.track === Track.BreakFix)!;
    expect(bfTrack.tickets).toHaveLength(1);
  });

  it('applies penalty for unmitigated DDoS event', () => {
    const ctx = makeCtx({ pendingEvents: [ddosEvent] });
    const { context, penaltiesApplied } = processCrisis(ctx);
    expect(context.budget).toBe(500_000 - ddosEvent.unmitigatedPenalty);
    expect(penaltiesApplied).toBe(ddosEvent.unmitigatedPenalty);
  });

  it('skips penalty for mitigated DDoS event', () => {
    const ctx = makeCtx({
      pendingEvents: [ddosEvent],
      mitigatedEventIds: [ddosEvent.id],
    });
    const { context, penaltiesApplied } = processCrisis(ctx);
    expect(context.budget).toBe(500_000);
    expect(penaltiesApplied).toBe(0);
  });

  it('does not file a ticket when a DDoS IssueTicket event is mitigated', () => {
    const ctx = makeCtx({
      pendingEvents: [ddosEvent],
      mitigatedEventIds: [ddosEvent.id],
    });
    const { context } = processCrisis(ctx);
    const bfTrack = context.tracks.find((t) => t.track === Track.BreakFix)!;
    expect(bfTrack.tickets).toHaveLength(0);
  });

  it('clears pendingEvents after processing', () => {
    const ctx = makeCtx({ pendingEvents: [ddosEvent] });
    const { context } = processCrisis(ctx);
    expect(context.pendingEvents).toHaveLength(0);
  });

  it('moves processed event cards into trafficEventDiscard', () => {
    const ctx = makeCtx({
      pendingEvents: [ddosEvent, activationEvent],
      trafficEventDiscard: [],
    });
    const { context } = processCrisis(ctx);
    expect(context.trafficEventDiscard).toHaveLength(2);
    expect(context.trafficEventDiscard).toContainEqual(ddosEvent);
    expect(context.trafficEventDiscard).toContainEqual(activationEvent);
  });

  it('appends to an existing trafficEventDiscard', () => {
    const existingCard = TRAFFIC_CARDS[0]!;
    const ctx = makeCtx({
      pendingEvents: [ddosEvent],
      trafficEventDiscard: [existingCard],
    });
    const { context } = processCrisis(ctx);
    expect(context.trafficEventDiscard).toHaveLength(2);
    expect(context.trafficEventDiscard).toContainEqual(existingCard);
    expect(context.trafficEventDiscard).toContainEqual(ddosEvent);
  });
});
