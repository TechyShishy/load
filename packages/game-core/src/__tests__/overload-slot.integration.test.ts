import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine } from '../machine.js';
import { createInitialSlotLayout } from '../boardState.js';
import { getFilledTimeSlots } from '../cardPositionViews.js';
import { ACTION_CARDS } from '../data/actions/index.js';
import { TRAFFIC_CARD_REGISTRY } from '../data/traffic/index.js';
import { Period, PhaseId, SlotType, type TrafficCard } from '../types.js';
import { safeContext, ctxWithHandCardsFixedIds, ctxWithCardOnSlot } from './testHelpers.js';

/** Helper: create a fresh traffic card instance from the registry. */
function freshTrafficCard(templateId: string, instanceId: string): TrafficCard {
  const Ctor = TRAFFIC_CARD_REGISTRY.get(templateId);
  if (!Ctor) throw new Error(`Unknown traffic templateId: ${templateId}`);
  return new Ctor(instanceId) as TrafficCard;
}

const bandwidthUpgrade = ACTION_CARDS.find((c) => c.templateId === 'action-bandwidth-upgrade')!;
const dataCenterExpansion = ACTION_CARDS.find(
  (c) => c.templateId === 'action-datacenter-expansion',
)!;
const trafficPrioritization = ACTION_CARDS.find(
  (c) => c.templateId === 'action-traffic-prioritization',
)!;
const streamCompression = ACTION_CARDS.find((c) => c.templateId === 'action-stream-compression')!;

// ─── Traffic Prioritization on overload slot ─────────────────────────────────

describe('integration: Traffic Prioritization clears overload slot', () => {
  it('removes the traffic card and deletes the overload slot; revenue collected', () => {
    const cloudInst = freshTrafficCard('traffic-cloud-backup', 'cloud-tp-1');
    let ctx = safeContext('tp-test', { activePhase: PhaseId.Scheduling });
    ctx = ctxWithCardOnSlot(cloudInst, Period.Morning, 4, ctx, SlotType.Overloaded);
    ctx = ctxWithHandCardsFixedIds([trafficPrioritization], ctx);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({
      type: 'PLAY_ACTION',
      card: trafficPrioritization,
      targetTrafficCardId: cloudInst.id,
    });

    const snap = actor.getSnapshot();
    expect(snap.context.slotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
    expect(snap.context.budget).toBe(
      ctx.budget - trafficPrioritization.cost + cloudInst.revenue,
    );
    expect(snap.context.trafficDiscardOrder).toContain(cloudInst.id);
  });
});

// ─── Stream Compression on overload slot ─────────────────────────────────────

describe('integration: Stream Compression clears overload slot', () => {
  it('removes empty overload slot after card is compressed out', () => {
    // Afternoon slot 0: regular iot card; Afternoon slot 4: overload iot card.
    // SC targets Afternoon → removes both; overload slot becomes empty → removed.
    const iotA = freshTrafficCard('traffic-iot-burst', 'iot-sc-a');
    const iotB = freshTrafficCard('traffic-iot-burst', 'iot-sc-b');
    let ctx = safeContext('sc-test', { activePhase: PhaseId.Scheduling });
    ctx = ctxWithCardOnSlot(iotA, Period.Afternoon, 0, ctx);
    ctx = ctxWithCardOnSlot(iotB, Period.Afternoon, 4, ctx, SlotType.Overloaded);
    ctx = ctxWithHandCardsFixedIds([streamCompression], ctx);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'PLAY_ACTION', card: streamCompression, targetPeriod: Period.Afternoon });

    const snap = actor.getSnapshot();
    expect(snap.context.slotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
    // Both cards removed → in discard
    expect(snap.context.trafficDiscardOrder).toContain('iot-sc-a');
    expect(snap.context.trafficDiscardOrder).toContain('iot-sc-b');
  });
});

// ─── Bandwidth Upgrade converts overload slot ─────────────────────────────────

describe('integration: Bandwidth Upgrade converts overload slot', () => {
  it('converts 1 overload slot to normal weeklyTemporary, net +1 slot in period', () => {
    const iotInst = freshTrafficCard('traffic-iot-burst', 'iot-bu-1');
    const initialMorningCount = createInitialSlotLayout().filter(
      (s) => s.period === Period.Morning,
    ).length;

    let ctx = safeContext('bu-test', { round: 2, activePhase: PhaseId.Scheduling });
    ctx = ctxWithCardOnSlot(iotInst, Period.Morning, initialMorningCount, ctx, SlotType.Overloaded);
    ctx = ctxWithHandCardsFixedIds([bandwidthUpgrade], ctx);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'PLAY_ACTION', card: bandwidthUpgrade, targetPeriod: Period.Morning });

    const snap = actor.getSnapshot();
    const morningSlots = snap.context.slotLayout.filter((s) => s.period === Period.Morning);
    expect(morningSlots.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
    expect(morningSlots).toHaveLength(initialMorningCount + 1);
    const converted = morningSlots.find((s) => s.slotType === SlotType.WeeklyTemporary);
    expect(converted).toBeDefined();
    // Converted slot still holds its card
    const filledMorning = getFilledTimeSlots(snap.context).find(
      (s) => s.period === Period.Morning && s.weeklyTemporary === true,
    );
    expect(filledMorning).toBeDefined();
    expect(filledMorning!.card!.id).toBe(iotInst.id);
  });

  it('adds a new empty slot when no overload slots exist in the period', () => {
    const initialMorningCount = createInitialSlotLayout().filter(
      (s) => s.period === Period.Morning,
    ).length;

    let ctx = safeContext('bu-empty-test', { round: 2, activePhase: PhaseId.Scheduling });
    ctx = ctxWithHandCardsFixedIds([bandwidthUpgrade], ctx);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'PLAY_ACTION', card: bandwidthUpgrade, targetPeriod: Period.Morning });

    const snap = actor.getSnapshot();
    const morningSlots = snap.context.slotLayout.filter((s) => s.period === Period.Morning);
    expect(morningSlots).toHaveLength(initialMorningCount + 1);
    const newSlot = morningSlots.find((s) => s.slotType === SlotType.WeeklyTemporary);
    expect(newSlot).toBeDefined();
    // New slot is empty (no card on it) — use filter with card !== null
    const filledMorning = getFilledTimeSlots(snap.context).filter(
      (s) => s.period === Period.Morning && s.weeklyTemporary === true && s.card !== null,
    );
    expect(filledMorning).toHaveLength(0);
  });
});

// ─── Data Center Expansion converts overload slots ────────────────────────────

describe('integration: Data Center Expansion converts overload slots', () => {
  it('converts 2 overload slots to normal; no extra empty slot added', () => {
    const iotInst = freshTrafficCard('traffic-iot-burst', 'iot-dce-1');
    const cloudInst = freshTrafficCard('traffic-cloud-backup', 'cloud-dce-2');
    const initialEveningCount = createInitialSlotLayout().filter(
      (s) => s.period === Period.Evening,
    ).length;

    let ctx = safeContext('dce-test', { round: 2, activePhase: PhaseId.Scheduling });
    ctx = ctxWithCardOnSlot(iotInst, Period.Evening, initialEveningCount, ctx, SlotType.Overloaded);
    ctx = ctxWithCardOnSlot(cloudInst, Period.Evening, initialEveningCount + 1, ctx, SlotType.Overloaded);
    ctx = ctxWithHandCardsFixedIds([dataCenterExpansion], ctx);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'PLAY_ACTION', card: dataCenterExpansion, targetPeriod: Period.Evening });

    const snap = actor.getSnapshot();
    const eveningSlots = snap.context.slotLayout.filter((s) => s.period === Period.Evening);
    expect(eveningSlots.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
    // 2 overload slots converted, 0 new empty slots: net = initial + 2
    expect(eveningSlots).toHaveLength(initialEveningCount + 2);
    const converted = eveningSlots.filter((s) => s.slotType === SlotType.WeeklyTemporary);
    expect(converted).toHaveLength(2);
  });

  it('converts 1 overload and adds 1 new empty slot when only 1 overload exists', () => {
    const iotInst = freshTrafficCard('traffic-iot-burst', 'iot-dce-3');
    const initialEveningCount = createInitialSlotLayout().filter(
      (s) => s.period === Period.Evening,
    ).length;

    let ctx = safeContext('dce-test2', { round: 2, activePhase: PhaseId.Scheduling });
    ctx = ctxWithCardOnSlot(iotInst, Period.Evening, initialEveningCount, ctx, SlotType.Overloaded);
    ctx = ctxWithHandCardsFixedIds([dataCenterExpansion], ctx);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('scheduling');

    actor.send({ type: 'PLAY_ACTION', card: dataCenterExpansion, targetPeriod: Period.Evening });

    const snap = actor.getSnapshot();
    const eveningSlots = snap.context.slotLayout.filter((s) => s.period === Period.Evening);
    expect(eveningSlots.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
    // 1 converted + 1 new empty = initial + 2
    expect(eveningSlots).toHaveLength(initialEveningCount + 2);
    const weeklySlots = eveningSlots.filter((s) => s.slotType === SlotType.WeeklyTemporary);
    expect(weeklySlots).toHaveLength(2);
  });
});
