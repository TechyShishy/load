/**
 * Regression test for the bug where traffic cards in overload slots did not
 * appear on the board until Bandwidth Upgrade or Data Center Expansion was
 * played.
 *
 * Root cause: the canvas `[context]` effect compared total `slotLayout.length`
 * to decide between a full scene rebuild and `patchBoard`. When one period lost
 * an overload (via `resolveRound`) and a *different* period gained one (via
 * `performDraw`) in the same React-batched render, the total stayed the same
 * while individual period ref-maps became stale — so the new overload slot had
 * no PixiJS ref and its card was never rendered.
 *
 * Fix: the canvas now compares per-period slot counts (not total length).
 * These tests document the game-core invariant that makes the fix necessary:
 * it IS possible for one period's overload to be stripped and a different
 * period's overload to be created within a single round-advance, leaving
 * `slotLayout.length` unchanged while per-period distributions change.
 */

import { describe, expect, it } from 'vitest';
import { resolveRound } from '../resolveRound.js';
import { computeTrafficPlacements } from '../autoFillTrafficSlots.js';
import { TRAFFIC_CARD_REGISTRY } from '../data/traffic/index.js';
import { Period, SlotType, type TrafficCard } from '../types.js';
import { safeContext, ctxWithCardOnSlot } from './testHelpers.js';

function freshTrafficCard(templateId: string, instanceId: string): TrafficCard {
  const Ctor = TRAFFIC_CARD_REGISTRY.get(templateId);
  if (!Ctor) throw new Error(`Unknown traffic templateId: ${templateId}`);
  return new Ctor(instanceId) as TrafficCard;
}

describe('integration: cross-period overload swap preserves total length', () => {
  it('resolveRound strips a Morning overload while performDraw creates an Afternoon overload — total slotLayout.length unchanged, per-period counts differ', () => {
    // Build a context where:
    //   Morning  = 3 Normal (occupied) + 1 Normal (empty) + 1 Overloaded  → 5 Morning slots
    //   Afternoon = 4 Normal (all occupied)
    //   Evening  = 4 Normal (unoccupied)
    //   Overnight = 4 Normal (unoccupied)
    //   Total slotLayout.length = 17
    //
    // After resolveRound: Morning overload stripped → 16 total slots, Morning=4
    // After computeTrafficPlacements with 2 cards (round-robin M, A):
    //   Card 1 → Morning: Morning slot 3 is free → placed normally. No new Morning overload.
    //   Card 2 → Afternoon: Afternoon is full → new Afternoon overload at index 4.
    //   New total = 17, Morning=4, Afternoon=5.
    //
    // This is the invariant the canvas fix relies on: total length stayed equal
    // (17 → 16 via resolveRound, then +1 → 17 via performDraw) but per-period
    // distributions changed (Morning: 5→4, Afternoon: 4→5). A comparison of
    // total length alone would wrongly skip a full rebuild; per-period comparison
    // correctly triggers one.
    const morningOverloadCard = freshTrafficCard('traffic-iot-burst', 'iot-m-overload');
    const morningNormal = [
      freshTrafficCard('traffic-iot-burst', 'iot-m-0'),
      freshTrafficCard('traffic-iot-burst', 'iot-m-1'),
      freshTrafficCard('traffic-iot-burst', 'iot-m-2'),
      // slot 3 intentionally left empty so the next round's Morning card fits
    ];
    const afternoonNormal = [
      freshTrafficCard('traffic-iot-burst', 'iot-a-0'),
      freshTrafficCard('traffic-iot-burst', 'iot-a-1'),
      freshTrafficCard('traffic-iot-burst', 'iot-a-2'),
      freshTrafficCard('traffic-iot-burst', 'iot-a-3'),
    ];

    let ctx = safeContext('cross-period-test');
    // Place 3 occupied Normal Morning slots (0-2); slot 3 stays empty.
    for (let i = 0; i < 3; i++) {
      ctx = ctxWithCardOnSlot(morningNormal[i]!, Period.Morning, i, ctx, SlotType.Normal);
    }
    // Place 1 Overloaded Morning slot (index 4).
    ctx = ctxWithCardOnSlot(morningOverloadCard, Period.Morning, 4, ctx, SlotType.Overloaded);
    // Place 4 occupied Normal Afternoon slots (0-3).
    for (let i = 0; i < 4; i++) {
      ctx = ctxWithCardOnSlot(afternoonNormal[i]!, Period.Afternoon, i, ctx, SlotType.Normal);
    }

    const preTotalLength = ctx.slotLayout.length;
    expect(preTotalLength).toBe(17);
    expect(ctx.slotLayout.filter((s) => s.period === Period.Morning)).toHaveLength(5);
    expect(ctx.slotLayout.filter((s) => s.period === Period.Afternoon)).toHaveLength(4);

    // Step 1: resolveRound strips the Morning overload slot.
    const { context: afterResolve } = resolveRound(ctx);
    expect(afterResolve.slotLayout).toHaveLength(16);
    expect(afterResolve.slotLayout.filter((s) => s.period === Period.Morning)).toHaveLength(4);

    // Step 2: Simulate performDraw — compute placements for two new cards.
    // Build occupiedSlots from actors still in onSlot after resolveRound.
    const occupiedSlots = new Set<string>();
    for (const [, actor] of Object.entries(afterResolve.trafficCardActors)) {
      if (!actor) continue;
      const snap = actor.getSnapshot();
      if (snap.value === 'onSlot') {
        const c = snap.context;
        if (c.period !== undefined && c.slotIndex !== undefined) {
          occupiedSlots.add(`${c.period}:${c.slotIndex}`);
        }
      }
    }

    // Week-table (round 1 = Monday): IoT Burst → Morning (slot 3 free → placed normally)
    //                                 Viral Spike → Afternoon (all 4 occupied → overload at index 4)
    const newMorningCard = freshTrafficCard('traffic-iot-burst', 'iot-m-new');
    const newAfternoonCard = freshTrafficCard('traffic-viral-spike', 'viral-a-new');
    const { newSlotLayout } = computeTrafficPlacements(
      afterResolve.slotLayout,
      occupiedSlots,
      [newMorningCard, newAfternoonCard],
      1, // round 1 = Monday
    );

    const postTotalLength = newSlotLayout.length;
    const postMorningLength = newSlotLayout.filter((s) => s.period === Period.Morning).length;
    const postAfternoonLength = newSlotLayout.filter((s) => s.period === Period.Afternoon).length;

    // Total is the same as before (17), but per-period distribution has changed.
    expect(postTotalLength).toBe(preTotalLength); // both 17

    // Morning lost its overload (5→4); Afternoon gained one (4→5).
    expect(postMorningLength).toBe(4);
    expect(postAfternoonLength).toBe(5);

    // No Morning overload in the new layout.
    expect(
      newSlotLayout.filter((s) => s.period === Period.Morning && s.slotType === SlotType.Overloaded),
    ).toHaveLength(0);
    // One Afternoon overload at index 4.
    expect(
      newSlotLayout.filter((s) => s.period === Period.Afternoon && s.slotType === SlotType.Overloaded),
    ).toHaveLength(1);
  });

  it('slotLayoutChanged is false (patchBoard) when same period gains and loses an overload — existing refs are valid', () => {
    // If the SAME period had an old overload stripped and a new overload added
    // (same total, same per-period count), patchBoard is correctly used because
    // the ref at "Morning-4" already exists from the previous full rebuild.
    const oldCard = freshTrafficCard('traffic-iot-burst', 'iot-old-overload');
    const normalCards: TrafficCard[] = Array.from({ length: 4 }, (_, i) =>
      freshTrafficCard('traffic-iot-burst', `iot-m-norm-${i}`),
    );

    let ctx = safeContext('same-period-overload-test');
    for (let i = 0; i < 4; i++) {
      ctx = ctxWithCardOnSlot(normalCards[i]!, Period.Morning, i, ctx, SlotType.Normal);
    }
    ctx = ctxWithCardOnSlot(oldCard, Period.Morning, 4, ctx, SlotType.Overloaded);

    const { context: afterResolve } = resolveRound(ctx);
    expect(afterResolve.slotLayout).toHaveLength(16);

    // All Morning normal slots are occupied; new Morning card creates overload.
    const occupiedSlots = new Set<string>(
      Array.from({ length: 4 }, (_, i) => `${Period.Morning}:${i}`),
    );
    const newCard = freshTrafficCard('traffic-iot-burst', 'iot-new-overload');
    const { newSlotLayout } = computeTrafficPlacements(
      afterResolve.slotLayout,
      occupiedSlots,
      [newCard],
      1, // round 1 = Monday; IoT Burst → Morning
    );

    // Same total (17) AND same per-period Morning count (5) — patchBoard path is correct here.
    expect(newSlotLayout).toHaveLength(17);
    expect(newSlotLayout.filter((s) => s.period === Period.Morning)).toHaveLength(5);

    // The new overload is at the same index (4), so the old "Morning-4" ref in
    // the canvas is still valid — patchSlot sees cardsChanged=true and repaints.
    const overload = newSlotLayout.find(
      (s) => s.period === Period.Morning && s.slotType === SlotType.Overloaded,
    );
    expect(overload?.index).toBe(4);
  });
});
