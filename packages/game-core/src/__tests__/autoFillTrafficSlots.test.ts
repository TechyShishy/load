import { describe, expect, it } from 'vitest';
import { computeTrafficPlacements } from '../autoFillTrafficSlots.js';
import { createInitialSlotLayout } from '../boardState.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import { Period, SlotType, type TrafficCard } from '../types.js';

const iotCard: TrafficCard = TRAFFIC_CARDS.find((c) => c.templateId === 'traffic-iot-burst')!;

/** Returns a Set of slot keys representing all 4 Morning slots as already occupied. */
function makeMorningOccupied(): Set<string> {
  const initial = createInitialSlotLayout();
  return new Set(
    initial.filter((s) => s.period === Period.Morning).map((s) => `${s.period}:${s.index}`),
  );
}

describe('computeTrafficPlacements', () => {
  it('places first card in Morning (round-robin index 0)', () => {
    const { placements, newSlotLayout } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(), [iotCard.id],
    );
    expect(placements).toHaveLength(1);
    expect(placements[0]!.period).toBe(Period.Morning);
    // No overload slots added
    expect(newSlotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
  });

  it('cycles Morning → Afternoon → Evening → Overnight → Morning (round-robin)', () => {
    const { placements } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(),
      ['id-0', 'id-1', 'id-2', 'id-3', 'id-4'],
    );
    expect(placements.filter((p) => p.period === Period.Morning)).toHaveLength(2);
    expect(placements.filter((p) => p.period === Period.Afternoon)).toHaveLength(1);
    expect(placements.filter((p) => p.period === Period.Evening)).toHaveLength(1);
    expect(placements.filter((p) => p.period === Period.Overnight)).toHaveLength(1);
  });

  it('fills all 16 slots to capacity without overload', () => {
    // 4 periods × 4 slots each = 16 total capacity; round-robin fills one per period per cycle
    const { placements, newSlotLayout } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(),
      Array.from({ length: 16 }, (_, i) => `card-${i}`),
    );
    expect(placements).toHaveLength(16);
    expect(newSlotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
  });

  it('creates an overload slot when target period is full', () => {
    // All 4 Morning slots occupied; next card round-robins to Morning → full → overload
    const layout = createInitialSlotLayout();
    const occupied = makeMorningOccupied();
    const { placements, newSlotLayout } = computeTrafficPlacements(layout, occupied, ['card-new']);
    const overloadSlots = newSlotLayout.filter((s) => s.slotType === SlotType.Overloaded);
    expect(overloadSlots).toHaveLength(1);
    expect(overloadSlots[0]!.period).toBe(Period.Morning);
    expect(placements[0]!.slotType).toBe(SlotType.Overloaded);
  });

  it('overload slot holds the card — does not drop it', () => {
    // Pre-fill Morning (4 slots), place 1 more → overload slot is created and placement recorded
    const layout = createInitialSlotLayout();
    const occupied = makeMorningOccupied();
    const { placements, newSlotLayout } = computeTrafficPlacements(layout, occupied, ['card-new']);
    expect(placements).toHaveLength(1);
    expect(placements[0]!.period).toBe(Period.Morning);
    expect(placements[0]!.slotType).toBe(SlotType.Overloaded);
    // Normal Morning slots preserved in layout
    const morningNormalSlots = newSlotLayout.filter(
      (s) => s.period === Period.Morning && s.slotType !== SlotType.Overloaded,
    );
    expect(morningNormalSlots).toHaveLength(4);
    // No placement in other periods
    expect(placements.filter((p) => p.period !== Period.Morning)).toHaveLength(0);
  });

  it('returns empty placements without changes when given no cards', () => {
    const { placements, newSlotLayout } = computeTrafficPlacements(
      createInitialSlotLayout(), new Set(), [],
    );
    expect(placements).toHaveLength(0);
    expect(newSlotLayout.filter((s) => s.slotType === SlotType.Overloaded)).toHaveLength(0);
    expect(newSlotLayout).toHaveLength(createInitialSlotLayout().length);
  });
});
