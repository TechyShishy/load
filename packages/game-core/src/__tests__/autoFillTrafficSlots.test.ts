import { describe, expect, it } from 'vitest';
import { computeTrafficPlacements } from '../autoFillTrafficSlots.js';
import { createInitialSlotLayout } from '../boardState.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import { Period, SlotType, getDayOfWeek, type TrafficCard } from '../types.js';

const iotCard = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-iot-burst')!;
// Cloud Backup: Overnight every day except Sat (Morning).
const cloudCard = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-cloud-backup')!;

// Round 1 = Monday (getDayOfWeek(1) === 1).
const MONDAY_ROUND = 1;
// Round 6 = Saturday (getDayOfWeek(6) === 6).
const SATURDAY_ROUND = 6;

/** Returns a Set marking all 4 Morning slots as occupied. */
function makeMorningOccupied(): Set<string> {
  const initial = createInitialSlotLayout();
  return new Set(
    initial.filter((s) => s.period === Period.Morning).map((s) => `${s.period}:${s.index}`),
  );
}

// ─── Week-table routing ───────────────────────────────────────────────────────

describe('computeTrafficPlacements — week-table routing', () => {
  it('IoT Burst on Monday (round 1) targets Morning', () => {
    expect(getDayOfWeek(MONDAY_ROUND)).toBe(1);
    const { placements } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(), [iotCard], MONDAY_ROUND,
    );
    expect(placements[0]!.period).toBe(Period.Morning);
  });

  it('IoT Burst on Saturday (round 6) targets Overnight', () => {
    expect(getDayOfWeek(SATURDAY_ROUND)).toBe(6);
    const { placements } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(), [iotCard], SATURDAY_ROUND,
    );
    expect(placements[0]!.period).toBe(Period.Overnight);
  });

  it('Cloud Backup on Saturday (round 6) targets Morning (weekly full-backup window)', () => {
    const { placements } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(), [cloudCard], SATURDAY_ROUND,
    );
    expect(placements[0]!.period).toBe(Period.Morning);
  });

  it('Cloud Backup on Monday (round 1) targets Overnight', () => {
    const { placements } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(), [cloudCard], MONDAY_ROUND,
    );
    expect(placements[0]!.period).toBe(Period.Overnight);
  });

  it('card without weekTable falls back to Morning', () => {
    const noTable = { id: 'stub-no-table' } as const;
    const { placements } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(), [noTable], MONDAY_ROUND,
    );
    expect(placements[0]!.period).toBe(Period.Morning);
  });

  it('multiple cards on the same day all route to the same target period', () => {
    // All IoT Burst cards on a weekday go to Morning.
    const cards = [iotCard, iotCard, iotCard];
    const { placements } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(), cards, MONDAY_ROUND,
    );
    for (const p of placements) {
      expect(p.period).toBe(Period.Morning);
    }
  });

  it('target period wraps correctly across a 7-day cycle (round 8 = day 1 = Monday)', () => {
    const round8 = 8; // ((8-1) % 7) + 1 = 1 = Monday
    expect(getDayOfWeek(round8)).toBe(1);
    const { placements } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(), [iotCard], round8,
    );
    expect(placements[0]!.period).toBe(Period.Morning);
  });
});

// ─── Overload behaviour ───────────────────────────────────────────────────────

describe('computeTrafficPlacements — overload handling', () => {
  it('creates an overload slot in the target period when all normal slots are full', () => {
    // IoT Burst targets Morning on Monday; pre-fill all 4 Morning slots.
    const { placements, newSlotLayout } = computeTrafficPlacements(
      createInitialSlotLayout(), makeMorningOccupied(), [iotCard], MONDAY_ROUND,
    );
    expect(placements[0]!.period).toBe(Period.Morning);
    expect(placements[0]!.slotType).toBe(SlotType.Overloaded);
    expect(newSlotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(1);
    expect(newSlotLayout.filter((s) => s.slotType === SlotType.Overloaded)[0]!.period).toBe(Period.Morning);
  });

  it('overload does NOT spill to another period', () => {
    // Full Morning → overload in Morning, not in Afternoon/Evening/Overnight.
    const { placements } = computeTrafficPlacements(
      createInitialSlotLayout(), makeMorningOccupied(), [iotCard], MONDAY_ROUND,
    );
    expect(placements.every((p) => p.period === Period.Morning)).toBe(true);
  });

  it('normal Morning slots are still present after an overload is created', () => {
    const { newSlotLayout } = computeTrafficPlacements(
      createInitialSlotLayout(), makeMorningOccupied(), [iotCard], MONDAY_ROUND,
    );
    const morningNormal = newSlotLayout.filter(
      (s) => s.period === Period.Morning && s.slotType !== SlotType.Overloaded,
    );
    expect(morningNormal).toHaveLength(4);
  });

  it('fills all 16 normal slots without overload when cards span four periods', () => {
    // AI Inference: Monday → Morning
    // Cloud Backup: Monday → Overnight
    // 4K Stream:   Monday → Evening
    // Viral Spike: Monday → Afternoon
    const ai    = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-ai-inference')!;
    const cloud = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-cloud-backup')!;
    const stream = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-4k-stream')!;
    const viral = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-viral-spike')!;
    const cards = [
      ...Array<TrafficCard>(4).fill(ai),
      ...Array<TrafficCard>(4).fill(cloud),
      ...Array<TrafficCard>(4).fill(stream),
      ...Array<TrafficCard>(4).fill(viral),
    ];
    const { placements, newSlotLayout } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(), cards, MONDAY_ROUND,
    );
    expect(placements).toHaveLength(16);
    expect(newSlotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('computeTrafficPlacements — edge cases', () => {
  it('returns empty placements and an unchanged layout when given no cards', () => {
    const initial = createInitialSlotLayout();
    const { placements, newSlotLayout } = computeTrafficPlacements(
      initial, new Set(), [], MONDAY_ROUND,
    );
    expect(placements).toHaveLength(0);
    expect(newSlotLayout).toHaveLength(initial.length);
    expect(newSlotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
  });
});

// ─── weekTable invariant ──────────────────────────────────────────────────────

describe('weekTable invariant', () => {
  it('every deck traffic card defines a weekTable with exactly 7 entries', () => {
    for (const card of TRAFFIC_CARDS) {
      expect(card.weekTable, `${card.templateId} must have a weekTable`).toBeDefined();
      expect(card.weekTable!).toHaveLength(7);
    }
  });
});
