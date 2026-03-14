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
  return new Ctor(instanceId);
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
  it('converts 1 overload slot to permanent Normal, net +1 slot in period', () => {
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
    expect(morningSlots.every((s) => s.slotType === SlotType.Normal)).toBe(true);
    // Converted slot still holds its card
    const filledMorning = getFilledTimeSlots(snap.context).find(
      (s) => s.period === Period.Morning && s.card?.id === iotInst.id,
    );
    expect(filledMorning).toBeDefined();
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
    expect(morningSlots.every((s) => s.slotType === SlotType.Normal)).toBe(true);
    // New slot is empty (no card on it)
    const filledMorning = getFilledTimeSlots(snap.context).filter(
      (s) => s.period === Period.Morning && s.card !== null,
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
    expect(eveningSlots.every((s) => s.slotType === SlotType.Normal)).toBe(true);
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
    expect(eveningSlots.every((s) => s.slotType === SlotType.Normal)).toBe(true);
  });
});

// ─── Slot compaction (shift) after card removal ───────────────────────────────

describe('integration: slot compaction after Traffic Prioritization removes a normal card', () => {
  it('cards above the removed slot shift down by one index', () => {
    // Slots: Morning 0(A), 1(B) <- removed, 2(C), 3(D)
    // After removal of B: C→1, D→2; slot 3 stays in layout (Normal, now empty).
    const cardA = freshTrafficCard('traffic-iot-burst', 'shift-tp-a');
    const cardB = freshTrafficCard('traffic-iot-burst', 'shift-tp-b');
    const cardC = freshTrafficCard('traffic-cloud-backup', 'shift-tp-c');
    const cardD = freshTrafficCard('traffic-cloud-backup', 'shift-tp-d');

    let ctx = safeContext('shift-tp-test', { activePhase: PhaseId.Scheduling });
    ctx = ctxWithCardOnSlot(cardA, Period.Morning, 0, ctx);
    ctx = ctxWithCardOnSlot(cardB, Period.Morning, 1, ctx);
    ctx = ctxWithCardOnSlot(cardC, Period.Morning, 2, ctx);
    ctx = ctxWithCardOnSlot(cardD, Period.Morning, 3, ctx);
    ctx = ctxWithHandCardsFixedIds([trafficPrioritization], ctx);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'PLAY_ACTION', card: trafficPrioritization, targetTrafficCardId: cardB.id });

    const snap = actor.getSnapshot();
    const filledSlots = getFilledTimeSlots(snap.context).filter((s) => s.period === Period.Morning);

    // A stays at 0; C moved to 1; D moved to 2; slot 3 is now empty.
    expect(filledSlots.find((s) => s.index === 0)?.card?.id).toBe(cardA.id);
    expect(filledSlots.find((s) => s.index === 1)?.card?.id).toBe(cardC.id);
    expect(filledSlots.find((s) => s.index === 2)?.card?.id).toBe(cardD.id);
    expect(filledSlots.find((s) => s.index === 3)?.card).toBeNull();
  });
});

describe('integration: overload card shifts to normal slot when lower card is removed', () => {
  it('overload card promoted to normal slot; overload entry removed from layout', () => {
    // Slots: Morning 0-3 Normal, 4 Overloaded(E)
    // Remove card at slot 2: cards at 3 and 4 shift up.
    // E shifts from slot 4 (Overloaded) to slot 3 (Normal) → actor type becomes Normal.
    // Slot 4 (Overloaded) is now vacant → removed from layout.
    const normalCards = [
      freshTrafficCard('traffic-iot-burst', 'shift-ol-0'),
      freshTrafficCard('traffic-iot-burst', 'shift-ol-1'),
      freshTrafficCard('traffic-iot-burst', 'shift-ol-2'), // will be removed
      freshTrafficCard('traffic-iot-burst', 'shift-ol-3'),
    ];
    const overloadCard = freshTrafficCard('traffic-cloud-backup', 'shift-ol-4');

    let ctx = safeContext('shift-ol-test', { activePhase: PhaseId.Scheduling });
    for (let i = 0; i < 4; i++) {
      ctx = ctxWithCardOnSlot(normalCards[i]!, Period.Morning, i, ctx, SlotType.Normal);
    }
    ctx = ctxWithCardOnSlot(overloadCard, Period.Morning, 4, ctx, SlotType.Overloaded);
    ctx = ctxWithHandCardsFixedIds([trafficPrioritization], ctx);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({
      type: 'PLAY_ACTION',
      card: trafficPrioritization,
      targetTrafficCardId: normalCards[2]!.id,
    });

    const snap = actor.getSnapshot();

    // No overload slots remain.
    expect(snap.context.slotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
    // Morning still has 4 normal slots (0-3).
    const morningSlots = snap.context.slotLayout.filter((s) => s.period === Period.Morning);
    expect(morningSlots).toHaveLength(4);
    expect(morningSlots.every((s) => s.slotType === SlotType.Normal)).toBe(true);

    const filled = getFilledTimeSlots(snap.context).filter((s) => s.period === Period.Morning);
    // Slot 2 removed; formerly slot-3 card now at 2; former overload card now at 3.
    expect(filled.find((s) => s.index === 2)?.card?.id).toBe(normalCards[3]!.id);
    expect(filled.find((s) => s.index === 3)?.card?.id).toBe(overloadCard.id);
    // Check the overload card's actor slotType is now Normal.
    const olActor = snap.context.trafficCardActors[overloadCard.id];
    expect(olActor?.getSnapshot().context.slotType).toBe(SlotType.Normal);
  });
});

describe('integration: two overload slots — only one disappears per removal', () => {
  it('both overload cards shift by one; one overload slot pruned, one remains', () => {
    // Morning 0-3 Normal, 4 Overloaded(E), 5 Overloaded(F)
    // Remove slot 1: cards at 2,3,4,5 shift down.
    // E: slot 4(Overloaded) → slot 3(Normal). F: slot 5(Overloaded) → slot 4(Overloaded).
    // Slot 5 is now vacant (Overloaded) → removed; slot 4 stays (still occupied by F).
    const normalCards = [
      freshTrafficCard('traffic-iot-burst', 'two-ol-0'),
      freshTrafficCard('traffic-iot-burst', 'two-ol-1'), // will be removed
      freshTrafficCard('traffic-iot-burst', 'two-ol-2'),
      freshTrafficCard('traffic-iot-burst', 'two-ol-3'),
    ];
    const E = freshTrafficCard('traffic-cloud-backup', 'two-ol-e');
    const F = freshTrafficCard('traffic-cloud-backup', 'two-ol-f');

    let ctx = safeContext('two-ol-test', { activePhase: PhaseId.Scheduling });
    for (let i = 0; i < 4; i++) {
      ctx = ctxWithCardOnSlot(normalCards[i]!, Period.Morning, i, ctx, SlotType.Normal);
    }
    ctx = ctxWithCardOnSlot(E, Period.Morning, 4, ctx, SlotType.Overloaded);
    ctx = ctxWithCardOnSlot(F, Period.Morning, 5, ctx, SlotType.Overloaded);
    ctx = ctxWithHandCardsFixedIds([trafficPrioritization], ctx);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({
      type: 'PLAY_ACTION',
      card: trafficPrioritization,
      targetTrafficCardId: normalCards[1]!.id,
    });

    const snap = actor.getSnapshot();
    const morningSlots = snap.context.slotLayout.filter((s) => s.period === Period.Morning);

    // Was 6 slots (4 normal + 2 overload); after shift → 5 slots (4 normal + 1 overload).
    expect(morningSlots).toHaveLength(5);
    expect(morningSlots.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(1);

    const filled = getFilledTimeSlots(snap.context).filter((s) => s.period === Period.Morning);
    // E promoted to slot 3 (Normal); F remains at slot 4 (Overloaded).
    expect(filled.find((s) => s.index === 3)?.card?.id).toBe(E.id);
    expect(filled.find((s) => s.index === 4)?.card?.id).toBe(F.id);

    const eActor = snap.context.trafficCardActors[E.id];
    const fActor = snap.context.trafficCardActors[F.id];
    expect(eActor?.getSnapshot().context.slotType).toBe(SlotType.Normal);
    expect(fActor?.getSnapshot().context.slotType).toBe(SlotType.Overloaded);
  });
});

describe('integration: Stream Compression shifts remaining cards after each removal', () => {
  it('removes 3 duplicates across shifted positions; OL card promoted then removed', () => {
    // Morning: 0(4K-a), 1(IoT-a), 2(IoT-b), 3(4K-b), 4 OL(IoT-c)
    // IoT count=3, 4K count=2 → SC removes up to 3 IoT cards.
    // Removal 1: IoT-a at slot 1. Shift: IoT-b 2→1, 4K-b 3→2, IoT-c 4(OL)→3(Normal); slot 4 pruned.
    // Removal 2: IoT-b (now at slot 1). Shift: 4K-b 2→1, IoT-c 3→2; no OL to prune.
    // Removal 3: IoT-c (now at slot 2). Shift: nothing; no OL to prune.
    // Result: 4K-a@0, 4K-b@1; all IoT in discard; zero OL slots.
    const fourKa = freshTrafficCard('traffic-4k-stream', 'sc-shift-4ka');
    const iotA = freshTrafficCard('traffic-iot-burst', 'sc-shift-iota');
    const iotB = freshTrafficCard('traffic-iot-burst', 'sc-shift-iotb');
    const fourKb = freshTrafficCard('traffic-4k-stream', 'sc-shift-4kb');
    const iotOL = freshTrafficCard('traffic-iot-burst', 'sc-shift-iotol');

    let ctx = safeContext('sc-shift-test', { activePhase: PhaseId.Scheduling });
    ctx = ctxWithCardOnSlot(fourKa, Period.Morning, 0, ctx, SlotType.Normal);
    ctx = ctxWithCardOnSlot(iotA, Period.Morning, 1, ctx, SlotType.Normal);
    ctx = ctxWithCardOnSlot(iotB, Period.Morning, 2, ctx, SlotType.Normal);
    ctx = ctxWithCardOnSlot(fourKb, Period.Morning, 3, ctx, SlotType.Normal);
    ctx = ctxWithCardOnSlot(iotOL, Period.Morning, 4, ctx, SlotType.Overloaded);
    ctx = ctxWithHandCardsFixedIds([streamCompression], ctx);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'PLAY_ACTION', card: streamCompression, targetPeriod: Period.Morning });

    const snap = actor.getSnapshot();

    // All 3 IoT cards removed to discard.
    expect(snap.context.trafficDiscardOrder).toContain(iotA.id);
    expect(snap.context.trafficDiscardOrder).toContain(iotB.id);
    expect(snap.context.trafficDiscardOrder).toContain(iotOL.id);

    // Overload slot freed by the first shift.
    expect(snap.context.slotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);

    // 4K cards remain; Morning is fully packed at slots 0 and 1.
    const filled = getFilledTimeSlots(snap.context).filter((s) => s.period === Period.Morning);
    const remaining = filled.flatMap((s) => (s.card ? [s.card] : []));
    expect(remaining).toHaveLength(2);
    expect(remaining.map((c) => c.id)).toEqual(
      expect.arrayContaining([fourKa.id, fourKb.id]),
    );
  });
});
