import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { playActionCard, processCrisis } from '../processCrisis.js';
import { createVendorSlots } from '../boardState.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { EVENT_CARDS } from '../data/events/index.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import { EmergencyMaintenanceCard } from '../data/actions/EmergencyMaintenanceCard.js';
import { FiveGActivationCard } from '../data/events/FiveGActivationCard.js';
import { eventCardPositionMachine } from '../cardPositionMachines.js';
import { getFilledTimeSlots } from '../cardPositionViews.js';
import {
  Period,
  PhaseId,
  SlotType,
  Track,
} from '../types.js';
import { safeContext, ctxWithHandCardsFixedIds, ctxWithCardOnSlot, ctxWithPendingEvents } from './testHelpers.js';

// ─── Card fixtures ────────────────────────────────────────────────────────────

const ddosEvent = EVENT_CARDS.find((c) => c.id === 'event-ddos-attack')!;
const activationEvent = EVENT_CARDS.find((c) => c.id === 'event-5g-activation')!;
const falseAlarmEvent = EVENT_CARDS.find((c) => c.id === 'event-false-alarm')!;
const emMaint = ACTION_CARDS.find((c) => c.id === 'action-emergency-maintenance')!;
const secPatch = ACTION_CARDS.find((c) => c.id === 'action-security-patch')!;
const trafficPrio = ACTION_CARDS.find((c) => c.id === 'action-traffic-prioritization')!;
const bwUpgrade = ACTION_CARDS.find((c) => c.id === 'action-bandwidth-upgrade')!;

/** Base crisis context with emMaint and secPatch in hand. */
function makeCtx() {
  return ctxWithHandCardsFixedIds(
    [emMaint, secPatch],
    safeContext('test-seed', { activePhase: PhaseId.Crisis }),
  );
}

describe('playActionCard', () => {
  it('deducts cost from budget', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, emMaint);
    expect(updated.budget).toBe(500_000 - emMaint.cost);
  });

  it('removes the card from hand', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, emMaint);
    expect(updated.handOrder).not.toContain(emMaint.id);
  });

  it('adds card to playedThisRound', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, emMaint);
    expect(updated.playedThisRoundOrder).toContain(emMaint.id);
  });

  it('ClearTicket removes first ticket from the target track', () => {
    const base = makeCtx();
    // Issue ddosEvent as a ticket on BreakFix by building actor + ticketOrders manually.
    const ticketActor = createActor(eventCardPositionMachine, {
      input: { instanceId: ddosEvent.id, templateId: ddosEvent.templateId },
    });
    ticketActor.start();
    ticketActor.send({ type: 'DRAW' });
    ticketActor.send({ type: 'ISSUE_TICKET', track: Track.BreakFix });
    const ctx = {
      ...base,
      cardInstances: { ...base.cardInstances, [ddosEvent.id]: ddosEvent },
      eventCardActors: { ...base.eventCardActors, [ddosEvent.id]: ticketActor },
      ticketOrders: { ...base.ticketOrders, [Track.BreakFix]: [ddosEvent.id] },
    };
    const updated = playActionCard(ctx, emMaint);
    expect(updated.ticketOrders[Track.BreakFix]).toHaveLength(0);
  });

  it('RemoveTrafficCard removes the targeted traffic card from its slot', () => {
    const trafficCard = TRAFFIC_CARDS[0]!;
    const base = ctxWithHandCardsFixedIds([trafficPrio], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const ctx = ctxWithCardOnSlot(trafficCard, Period.Morning, 0, base);
    const updated = playActionCard(ctx, trafficPrio, undefined, trafficCard.id);
    expect(getFilledTimeSlots(updated).flatMap((s) => s.card ? [s.card] : [])).not.toContainEqual(trafficCard);
  });

  it('RemoveTrafficCard credits the traffic card revenue to budget', () => {
    const trafficCard = TRAFFIC_CARDS[0]!;
    const base = ctxWithHandCardsFixedIds([trafficPrio], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const ctx = ctxWithCardOnSlot(trafficCard, Period.Morning, 0, base);
    const updated = playActionCard(ctx, trafficPrio, undefined, trafficCard.id);
    expect(updated.budget).toBe(500_000 - trafficPrio.cost + trafficCard.revenue);
    expect(updated.pendingRevenue).toBe(trafficCard.revenue);
  });

  it('RemoveTrafficCard is a no-op when no targetTrafficCardId is given', () => {
    const base = ctxWithHandCardsFixedIds([trafficPrio], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const before = getFilledTimeSlots(base).length;
    const updated = playActionCard(base, trafficPrio);
    expect(getFilledTimeSlots(updated).length).toBe(before);
  });

  it('BoostSlotCapacity adds new weeklyTemporary slots for target period', () => {
    const base = ctxWithHandCardsFixedIds([bwUpgrade], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    const beforeCount = base.slotLayout.filter((s) => s.period === Period.Afternoon).length;
    const updated = playActionCard(base, bwUpgrade);
    const afterSlots = updated.slotLayout.filter((s) => s.period === Period.Afternoon);
    expect(afterSlots.length).toBe(beforeCount + 1);
    expect(afterSlots.filter((s) => s.slotType === SlotType.WeeklyTemporary).length).toBe(1);
  });

  it('BoostSlotCapacity runtime targetPeriod overrides card.targetPeriod', () => {
    const base = ctxWithHandCardsFixedIds([bwUpgrade], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    const beforeMorning = base.slotLayout.filter((s) => s.period === Period.Morning).length;
    const beforeAfternoon = base.slotLayout.filter((s) => s.period === Period.Afternoon).length;
    const updated = playActionCard(base, bwUpgrade, undefined, undefined, Period.Morning);
    const morningSlots = updated.slotLayout.filter((s) => s.period === Period.Morning);
    const afternoonSlots = updated.slotLayout.filter((s) => s.period === Period.Afternoon);
    expect(morningSlots.length).toBe(beforeMorning + 1);
    expect(morningSlots.filter((s) => s.slotType === SlotType.WeeklyTemporary).length).toBe(1);
    expect(afternoonSlots.length).toBe(beforeAfternoon);
  });

  it('ClearTicket runtime targetTrack overrides card.targetTrack', () => {
    const base = makeCtx();
    const maintActor = createActor(eventCardPositionMachine, {
      input: { instanceId: ddosEvent.id, templateId: ddosEvent.templateId },
    });
    maintActor.start();
    maintActor.send({ type: 'DRAW' });
    maintActor.send({ type: 'ISSUE_TICKET', track: Track.Maintenance });
    const ctx = {
      ...base,
      cardInstances: { ...base.cardInstances, [ddosEvent.id]: ddosEvent },
      eventCardActors: { ...base.eventCardActors, [ddosEvent.id]: maintActor },
      ticketOrders: { ...base.ticketOrders, [Track.Maintenance]: [ddosEvent.id] },
    };
    // emMaint targets BreakFix by default; override to Maintenance
    const updated = playActionCard(ctx, emMaint, undefined, undefined, undefined, Track.Maintenance);
    expect(updated.ticketOrders[Track.Maintenance]).toHaveLength(0);
    expect(updated.ticketOrders[Track.BreakFix]).toHaveLength(0);
  });

  it('AddPeriodSlots adds temporary slots to the runtime targetPeriod', () => {
    const dcExpansion = ACTION_CARDS.find((c) => c.id === 'action-datacenter-expansion')!;
    const base = ctxWithHandCardsFixedIds([dcExpansion], safeContext('test-seed', { activePhase: PhaseId.Scheduling }));
    const beforeEvening = base.slotLayout.filter((s) => s.period === Period.Evening).length;
    const beforeOvernight = base.slotLayout.filter((s) => s.period === Period.Overnight).length;
    const updated = playActionCard(base, dcExpansion, undefined, undefined, Period.Evening);
    const eveningSlots = updated.slotLayout.filter((s) => s.period === Period.Evening);
    const overnightSlots = updated.slotLayout.filter((s) => s.period === Period.Overnight);
    expect(eveningSlots.length).toBe(beforeEvening + 2);
    expect(eveningSlots.filter((s) => s.slotType === SlotType.WeeklyTemporary).length).toBe(2);
    expect(overnightSlots.length).toBe(beforeOvernight);
  });

  it('MitigateDDoS adds event id to mitigatedEventIds', () => {
    const ctx = makeCtx();
    const updated = playActionCard(ctx, secPatch, ddosEvent.id);
    expect(updated.mitigatedEventIds).toContain(ddosEvent.id);
  });

  it('does nothing if card is not in hand', () => {
    const ctx = safeContext('test-seed', { activePhase: PhaseId.Crisis, budget: 500_000 });
    const updated = playActionCard(ctx, emMaint);
    expect(updated.budget).toBe(500_000);
  });
});

describe('processCrisis', () => {
  it('spawns 5 DDoS traffic cards when unmitigated', () => {
    const ctx = ctxWithPendingEvents([ddosEvent], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const { context } = processCrisis(ctx);
    expect(context.spawnedQueueOrder).toHaveLength(5);
    expect(context.spawnedQueueOrder.every((id) => context.cardInstances[id]?.templateId === 'traffic-ddos')).toBe(true);
  });

  it('does not spawn traffic cards when DDoS event is mitigated', () => {
    const base = ctxWithPendingEvents([ddosEvent], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const ctx = { ...base, mitigatedEventIds: [ddosEvent.id] };
    const { context } = processCrisis(ctx);
    expect(context.spawnedQueueOrder).toHaveLength(0);
  });

  it('does nothing to budget when DDoS event is mitigated', () => {
    const base = ctxWithPendingEvents([ddosEvent], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const ctx = { ...base, mitigatedEventIds: [ddosEvent.id] };
    const { context, penaltiesApplied } = processCrisis(ctx);
    expect(context.budget).toBe(500_000);
    expect(penaltiesApplied).toBe(0);
  });

  it('clears pendingEvents after processing', () => {
    const ctx = ctxWithPendingEvents([ddosEvent], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const { context } = processCrisis(ctx);
    expect(context.pendingEventsOrder).toHaveLength(0);
  });

  it('moves non-ticket events into eventDiscard; ticket-issuing events stay on the track', () => {
    const ctx = ctxWithPendingEvents(
      [ddosEvent, activationEvent],
      safeContext('test-seed', { activePhase: PhaseId.Crisis }),
    );
    const { context } = processCrisis(ctx);
    // DDoS goes to discard (no ticket issued).
    expect(context.eventDiscardOrder).toContain(ddosEvent.id);
    // 5G Activation issued a Projects ticket — must NOT be in discard yet.
    expect(context.eventDiscardOrder).not.toContain(activationEvent.id);
    expect(context.ticketOrders[Track.Projects]).toContain(activationEvent.id);
  });

  it('moves FalseAlarm into eventDiscard with no other side-effects', () => {
    const ctx = ctxWithPendingEvents([falseAlarmEvent], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const { context } = processCrisis(ctx);
    expect(context.pendingEventsOrder).toHaveLength(0);
    expect(context.eventDiscardOrder).toContain(falseAlarmEvent.id);
    expect(context.budget).toBe(500_000);
    expect(context.spawnedQueueOrder).toHaveLength(0);
  });

  it('appends to an existing eventDiscardOrder', () => {
    const existingCard = EVENT_CARDS[0]!;
    // Pre-populate eventDiscardOrder with the existing card.
    const base = safeContext('test-seed', { activePhase: PhaseId.Crisis });
    const baseWithDiscard = {
      ...base,
      cardInstances: { ...base.cardInstances, [existingCard.id]: existingCard },
      eventDiscardOrder: [existingCard.id],
    };
    const ctx = ctxWithPendingEvents([ddosEvent], baseWithDiscard);
    const { context } = processCrisis(ctx);
    expect(context.eventDiscardOrder.length).toBeGreaterThanOrEqual(2);
    expect(context.eventDiscardOrder).toContain(existingCard.id);
    expect(context.eventDiscardOrder).toContain(ddosEvent.id);
  });

  it('deducts $15,000 from budget when 5G Activation is unmitigated', () => {
    const ctx = ctxWithPendingEvents([activationEvent], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const { context } = processCrisis(ctx);
    expect(context.budget).toBe(500_000 - 15_000);
  });

  it('issues a Projects ticket when 5G Activation is unmitigated', () => {
    const ctx = ctxWithPendingEvents([activationEvent], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const { context } = processCrisis(ctx);
    const projectsTickets = context.ticketOrders[Track.Projects] ?? [];
    expect(projectsTickets).toHaveLength(1);
    expect(context.cardInstances[projectsTickets[0]!]?.templateId).toBe('event-5g-activation');
  });

  it('does nothing when 5G Activation is mitigated', () => {
    const base = ctxWithPendingEvents([activationEvent], safeContext('test-seed', { activePhase: PhaseId.Crisis }));
    const ctx = { ...base, mitigatedEventIds: [activationEvent.id] };
    const { context } = processCrisis(ctx);
    expect(context.budget).toBe(500_000);
    expect((context.ticketOrders[Track.Projects] ?? []).length).toBe(0);
  });
});

// ─── EmergencyMaintenance multi-step ticket mechanic ──────────────────────────

/** Build a base context with one FiveGActivation ticket already issued on Projects. */
function makeCtxWithFiveGTicket() {
  const ticket = new FiveGActivationCard('ticket-5g-test');
  const ticketActor = createActor(eventCardPositionMachine, {
    input: { instanceId: ticket.id, templateId: ticket.templateId },
  });
  ticketActor.start();
  ticketActor.send({ type: 'DRAW' });
  ticketActor.send({ type: 'ISSUE_TICKET', track: Track.Projects });

  const base = safeContext('test-seed', { round: 1, activePhase: PhaseId.Crisis });
  return {
    ...base,
    cardInstances: { ...base.cardInstances, [ticket.id]: ticket },
    eventCardActors: { ...base.eventCardActors, [ticket.id]: ticketActor },
    ticketOrders: { ...base.ticketOrders, [Track.Projects]: [ticket.id] },
    ticketIssuedRound: { ...base.ticketIssuedRound, [ticket.id]: 1 },
  };
}

/** Create a fresh EmergencyMaintenanceCard instance, registered and in-hand. */
function makeEmMaintInHand(id: string, baseCtx: ReturnType<typeof makeCtxWithFiveGTicket>) {
  const card = new EmergencyMaintenanceCard(id);
  return ctxWithHandCardsFixedIds([card], baseCtx);
}

describe('EmergencyMaintenance multi-step ticket mechanic', () => {
  it('records progress on first play without clearing the ticket', () => {
    const base = makeCtxWithFiveGTicket();
    const ctx = makeEmMaintInHand('em-1', base);
    const updated = playActionCard(ctx, ctx.cardInstances['em-1'] as import('../types.js').ActionCard, undefined, undefined, undefined, Track.Projects);
    expect(updated.ticketOrders[Track.Projects]).toHaveLength(1);
    expect(updated.ticketProgress['ticket-5g-test']).toBe(1);
  });

  it('records progress on second play without clearing the ticket', () => {
    const base = makeCtxWithFiveGTicket();
    const em1 = new EmergencyMaintenanceCard('em-1');
    const em2 = new EmergencyMaintenanceCard('em-2');
    let ctx = makeEmMaintInHand('em-1', base);
    ctx = playActionCard(ctx, em1, undefined, undefined, undefined, Track.Projects);
    ctx = makeEmMaintInHand('em-2', ctx);
    ctx = playActionCard(ctx, em2, undefined, undefined, undefined, Track.Projects);
    expect(ctx.ticketOrders[Track.Projects]).toHaveLength(1);
    expect(ctx.ticketProgress['ticket-5g-test']).toBe(2);
  });

  it('clears the ticket on the third (requiredClears) play', () => {
    const base = makeCtxWithFiveGTicket();
    const em1 = new EmergencyMaintenanceCard('em-1');
    const em2 = new EmergencyMaintenanceCard('em-2');
    const em3 = new EmergencyMaintenanceCard('em-3');
    let ctx = makeEmMaintInHand('em-1', base);
    ctx = playActionCard(ctx, em1, undefined, undefined, undefined, Track.Projects);
    ctx = makeEmMaintInHand('em-2', ctx);
    ctx = playActionCard(ctx, em2, undefined, undefined, undefined, Track.Projects);
    ctx = makeEmMaintInHand('em-3', ctx);
    ctx = playActionCard(ctx, em3, undefined, undefined, undefined, Track.Projects);

    expect(ctx.ticketOrders[Track.Projects]).toHaveLength(0);
    expect(ctx.ticketProgress['ticket-5g-test']).toBeUndefined();
    expect(ctx.eventDiscardOrder).toContain('ticket-5g-test');
  });

  it('earns full clearRevenue ($60k) when cleared in the same round it was issued', () => {
    // Same round: round=1, issuedRound=1 → age=0 → revenue = 60_000 - 0 = 60_000
    const base = makeCtxWithFiveGTicket(); // issuedRound=1, ctx.round=1
    const em1 = new EmergencyMaintenanceCard('em-1');
    const em2 = new EmergencyMaintenanceCard('em-2');
    const em3 = new EmergencyMaintenanceCard('em-3');
    let ctx = makeEmMaintInHand('em-1', base);
    ctx = playActionCard(ctx, em1, undefined, undefined, undefined, Track.Projects);
    ctx = makeEmMaintInHand('em-2', ctx);
    ctx = playActionCard(ctx, em2, undefined, undefined, undefined, Track.Projects);
    ctx = makeEmMaintInHand('em-3', ctx);
    ctx = playActionCard(ctx, em3, undefined, undefined, undefined, Track.Projects);

    // Each play costs $15k; the 3rd play also adds $60k to pendingRevenue.
    expect(ctx.pendingRevenue).toBe(60_000);
    expect(ctx.budget).toBe(500_000 - 3 * 15_000);
  });

  it('reduces clearRevenue by $3,000 per round of age', () => {
    // Ticket issued on round 1, cleared on round 3 → age=2 → revenue = 60_000 - 2*3_000 = 54_000
    const base = {
      ...makeCtxWithFiveGTicket(),
      round: 3,                                            // current round is 3
      ticketIssuedRound: { 'ticket-5g-test': 1 },         // issued on round 1
    };
    const em1 = new EmergencyMaintenanceCard('em-a');
    const em2 = new EmergencyMaintenanceCard('em-b');
    const em3 = new EmergencyMaintenanceCard('em-c');
    let ctx = makeEmMaintInHand('em-a', base);
    ctx = playActionCard(ctx, em1, undefined, undefined, undefined, Track.Projects);
    ctx = makeEmMaintInHand('em-b', ctx);
    ctx = playActionCard(ctx, em2, undefined, undefined, undefined, Track.Projects);
    ctx = makeEmMaintInHand('em-c', ctx);
    ctx = playActionCard(ctx, em3, undefined, undefined, undefined, Track.Projects);

    expect(ctx.pendingRevenue).toBe(54_000);
  });

  it('clamps clearRevenue to 0 when ticket is older than clearRevenue / revenueDecayPerRound rounds', () => {
    // clearRevenue = 60_000, revenueDecayPerRound = 3_000 → zeroed after 20 rounds of age
    const base = {
      ...makeCtxWithFiveGTicket(),
      round: 25,
      ticketIssuedRound: { 'ticket-5g-test': 1 },  // age = 24 → negative without clamp
    };
    const em1 = new EmergencyMaintenanceCard('em-x');
    const em2 = new EmergencyMaintenanceCard('em-y');
    const em3 = new EmergencyMaintenanceCard('em-z');
    let ctx = makeEmMaintInHand('em-x', base);
    ctx = playActionCard(ctx, em1, undefined, undefined, undefined, Track.Projects);
    ctx = makeEmMaintInHand('em-y', ctx);
    ctx = playActionCard(ctx, em2, undefined, undefined, undefined, Track.Projects);
    ctx = makeEmMaintInHand('em-z', ctx);
    ctx = playActionCard(ctx, em3, undefined, undefined, undefined, Track.Projects);

    expect(ctx.pendingRevenue).toBe(0);
  });

  it('preserves a second ticket on the same track when the first is worked', () => {
    // Two 5G tickets on Projects — working one should not affect the other.
    const ticket1 = new FiveGActivationCard('ticket-5g-1');
    const ticket2 = new FiveGActivationCard('ticket-5g-2');
    const makeActor = (t: FiveGActivationCard) => {
      const a = createActor(eventCardPositionMachine, { input: { instanceId: t.id, templateId: t.templateId } });
      a.start();
      a.send({ type: 'DRAW' });
      a.send({ type: 'ISSUE_TICKET', track: Track.Projects });
      return a;
    };
    const base = safeContext('test-seed', { round: 1, activePhase: PhaseId.Crisis });
    const ctx = {
      ...base,
      cardInstances: { ...base.cardInstances, [ticket1.id]: ticket1, [ticket2.id]: ticket2 },
      eventCardActors: { ...base.eventCardActors, [ticket1.id]: makeActor(ticket1), [ticket2.id]: makeActor(ticket2) },
      ticketOrders: { ...base.ticketOrders, [Track.Projects]: [ticket1.id, ticket2.id] },
      ticketIssuedRound: { [ticket1.id]: 1, [ticket2.id]: 1 },
    };
    const em = new EmergencyMaintenanceCard('em-single');
    const updated = playActionCard(ctxWithHandCardsFixedIds([em], ctx), em, undefined, undefined, undefined, Track.Projects);
    // First ticket should have 1 progress; second should be untouched.
    expect(updated.ticketOrders[Track.Projects]).toHaveLength(2);
    expect(updated.ticketProgress[ticket1.id]).toBe(1);
    expect(updated.ticketProgress[ticket2.id]).toBeUndefined();
  });

  it('applies revenueBoostMultiplier to clearRevenue on ticket clear', () => {
    // revenueBoostMultiplier=1.5, age=0 → base=60_000 → boosted=90_000
    const base = { ...makeCtxWithFiveGTicket(), revenueBoostMultiplier: 1.5 };
    const em1 = new EmergencyMaintenanceCard('em-b1');
    const em2 = new EmergencyMaintenanceCard('em-b2');
    const em3 = new EmergencyMaintenanceCard('em-b3');
    let ctx = makeEmMaintInHand('em-b1', base);
    ctx = playActionCard(ctx, em1, undefined, undefined, undefined, Track.Projects);
    ctx = makeEmMaintInHand('em-b2', ctx);
    ctx = playActionCard(ctx, em2, undefined, undefined, undefined, Track.Projects);
    ctx = makeEmMaintInHand('em-b3', ctx);
    ctx = playActionCard(ctx, em3, undefined, undefined, undefined, Track.Projects);

    expect(ctx.pendingRevenue).toBe(90_000);
  });
});

