import { describe, expect, it } from 'vitest';
import { playActionCard, processCrisis } from '../processCrisis.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { EVENT_CARDS } from '../data/events/index.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import {
  Period,
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
    expect(updated.pendingRevenue).toBe(trafficCard.revenue);
  });

  it('RemoveTrafficCard is a no-op when no targetTrafficCardId is given', () => {
    const ctx = makeCtx({ hand: [trafficPrio] });
    const updated = playActionCard(ctx, trafficPrio);
    expect(updated.timeSlots).toEqual(ctx.timeSlots);
  });

  it('BoostSlotCapacity adds new weeklyTemporary slots for target period', () => {
    const ctx = makeCtx({ hand: [bwUpgrade] });
    const beforeCount = ctx.timeSlots.filter((s) => s.period === Period.Afternoon).length;
    const updated = playActionCard(ctx, bwUpgrade);
    const afterSlots = updated.timeSlots.filter((s) => s.period === Period.Afternoon);
    expect(afterSlots.length).toBe(beforeCount + 1);
    expect(afterSlots.filter((s) => s.weeklyTemporary).length).toBe(1);
  });

  it('BoostSlotCapacity runtime targetPeriod overrides card.targetPeriod', () => {
    const ctx = makeCtx({ hand: [bwUpgrade] });
    const beforeMorning = ctx.timeSlots.filter((s) => s.period === Period.Morning).length;
    const beforeAfternoon = ctx.timeSlots.filter((s) => s.period === Period.Afternoon).length;
    // bwUpgrade targets Afternoon; override to Morning
    const updated = playActionCard(ctx, bwUpgrade, undefined, undefined, Period.Morning);
    const morningSlots = updated.timeSlots.filter((s) => s.period === Period.Morning);
    const afternoonSlots = updated.timeSlots.filter((s) => s.period === Period.Afternoon);
    expect(morningSlots.length).toBe(beforeMorning + 1);
    expect(morningSlots.filter((s) => s.weeklyTemporary).length).toBe(1);
    expect(afternoonSlots.length).toBe(beforeAfternoon);
  });

  it('ClearTicket runtime targetTrack overrides card.targetTrack', () => {
    // emMaint targets BreakFix; override to Maintenance
    const ctx = makeCtx({
      tracks: createInitialTracks().map((t) =>
        t.track === Track.Maintenance ? { ...t, tickets: [ddosEvent] } : t,
      ),
    });
    const updated = playActionCard(ctx, emMaint, undefined, undefined, undefined, Track.Maintenance);
    const maintTrack = updated.tracks.find((t) => t.track === Track.Maintenance)!;
    const bfTrack = updated.tracks.find((t) => t.track === Track.BreakFix)!;
    expect(maintTrack.tickets).toHaveLength(0);
    expect(bfTrack.tickets).toHaveLength(0);
  });

  it('AddOvernightSlots runtime targetPeriod overrides card.targetPeriod', () => {
    const dcExpansion = ACTION_CARDS.find((c) => c.id === 'action-datacenter-expansion')!;
    const ctx = makeCtx({ hand: [dcExpansion] });
    const beforeEvening = ctx.timeSlots.filter((s) => s.period === Period.Evening).length;
    const beforeOvernight = ctx.timeSlots.filter((s) => s.period === Period.Overnight).length;
    // dcExpansion targets Overnight; override to Evening
    const updated = playActionCard(ctx, dcExpansion, undefined, undefined, Period.Evening);
    const eveningSlots = updated.timeSlots.filter((s) => s.period === Period.Evening);
    const overnightSlots = updated.timeSlots.filter((s) => s.period === Period.Overnight);
    expect(eveningSlots.length).toBe(beforeEvening + 2);
    expect(eveningSlots.filter((s) => s.weeklyTemporary).length).toBe(2);
    expect(overnightSlots.length).toBe(beforeOvernight);
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
  it('spawns 8 DDoS traffic cards when unmitigated', () => {
    const ctx = makeCtx({ pendingEvents: [ddosEvent] });
    const { context } = processCrisis(ctx);
    expect(context.spawnedTrafficQueue).toHaveLength(8);
    expect(context.spawnedTrafficQueue.every((c) => c.templateId === 'traffic-ddos')).toBe(true);
  });

  it('does not spawn traffic cards when DDoS event is mitigated', () => {
    const ctx = makeCtx({
      pendingEvents: [ddosEvent],
      mitigatedEventIds: [ddosEvent.id],
    });
    const { context } = processCrisis(ctx);
    expect(context.spawnedTrafficQueue).toHaveLength(0);
  });

  it('does nothing to budget when DDoS event is mitigated', () => {
    const ctx = makeCtx({
      pendingEvents: [ddosEvent],
      mitigatedEventIds: [ddosEvent.id],
    });
    const { context, penaltiesApplied } = processCrisis(ctx);
    expect(context.budget).toBe(500_000);
    expect(penaltiesApplied).toBe(0);
  });

  it('clears pendingEvents after processing', () => {
    const ctx = makeCtx({ pendingEvents: [ddosEvent] });
    const { context } = processCrisis(ctx);
    expect(context.pendingEvents).toHaveLength(0);
  });

  it('moves processed event cards into eventDiscard', () => {
    const ctx = makeCtx({
      pendingEvents: [ddosEvent, activationEvent],
      eventDiscard: [],
    });
    const { context } = processCrisis(ctx);
    expect(context.eventDiscard).toHaveLength(2);
    expect(context.eventDiscard).toContainEqual(ddosEvent);
    expect(context.eventDiscard).toContainEqual(activationEvent);
  });

  it('appends to an existing eventDiscard', () => {
    const existingCard = EVENT_CARDS[0]!;
    const ctx = makeCtx({
      pendingEvents: [ddosEvent],
      eventDiscard: [existingCard],
    });
    const { context } = processCrisis(ctx);
    expect(context.eventDiscard).toHaveLength(2);
    expect(context.eventDiscard).toContainEqual(existingCard);
    expect(context.eventDiscard).toContainEqual(ddosEvent);
  });
});
