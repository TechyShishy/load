import { Period, SlotType, getDayOfWeek, type TimeSlotLayout } from './types.js';

export interface SlotPlacement {
  cardId: string;
  period: Period;
  slotIndex: number;
  slotType: SlotType;
}

export interface PlacementsResult {
  placements: SlotPlacement[];
  /** Updated slot layout — may contain new overload slots appended during this call. */
  newSlotLayout: TimeSlotLayout[];
}

/**
 * Pure function: computes where each traffic card should be placed using
 * each card's week table and the current round number.
 *
 * Each card's target period is `card.weekTable[getDayOfWeek(round) - 1]`.
 * Cards without a weekTable fall back to Morning.
 *
 * When the target period is full, an overload slot is created there — no
 * silent redirect to another period. The pressure stays where it belongs.
 *
 * Does NOT mutate any actor state — the caller sends PLACE events.
 *
 * @param slotLayout  Current board slot layout.
 * @param occupiedSlots  Set of already-occupied slot keys ('period:index').
 * @param cards  Traffic cards to place, in draw order.
 * @param round  Current round number (used to derive day-of-week).
 */
export function computeTrafficPlacements(
  slotLayout: TimeSlotLayout[],
  occupiedSlots: Set<string>,
  cards: ReadonlyArray<{
    readonly id: string;
    readonly weekTable?: readonly [Period, Period, Period, Period, Period, Period, Period];
  }>,
  round: number,
): PlacementsResult {
  const dayIndex = getDayOfWeek(round) - 1; // 0 = Mon … 6 = Sun
  const placements: SlotPlacement[] = [];
  let layout = slotLayout;
  const taken = new Set(occupiedSlots);

  for (const card of cards) {
    const targetPeriod = card.weekTable?.[dayIndex] ?? Period.Morning;

    // Find the first non-overloaded, unoccupied slot in the target period.
    const availableSlot = layout.find(
      (s) =>
        s.period === targetPeriod &&
        s.slotType !== SlotType.Overloaded &&
        !taken.has(`${s.period}:${s.index}`),
    );

    if (availableSlot) {
      taken.add(`${availableSlot.period}:${availableSlot.index}`);
      placements.push({
        cardId: card.id,
        period: availableSlot.period,
        slotIndex: availableSlot.index,
        slotType: availableSlot.slotType,
      });
    } else {
      // Target period is full — create an overload slot there.
      const overloadIndex = layout.filter((s) => s.period === targetPeriod).length;
      const overloadSlot: TimeSlotLayout = {
        period: targetPeriod,
        index: overloadIndex,
        slotType: SlotType.Overloaded,
      };
      layout = [...layout, overloadSlot];
      taken.add(`${targetPeriod}:${overloadIndex}`);
      placements.push({
        cardId: card.id,
        period: targetPeriod,
        slotIndex: overloadIndex,
        slotType: SlotType.Overloaded,
      });
    }
  }

  return { placements, newSlotLayout: layout };
}


