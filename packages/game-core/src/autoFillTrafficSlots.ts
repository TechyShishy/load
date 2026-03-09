import { Period, SlotType, type TimeSlotLayout } from './types.js';

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
 * Pure function: computes where each traffic card should be placed, using the same
 * round-robin period assignment as the original autoFillTrafficSlots.
 *
 * Does NOT mutate any actor state — the caller is responsible for sending PLACE
 * events to the actors listed in the returned placements.
 *
 * @param slotLayout Current board slot layout.
 * @param occupiedSlots Set of already-occupied slot keys ('period:index').
 * @param cardIds Instance IDs of traffic cards to place, in draw order.
 */
export function computeTrafficPlacements(
  slotLayout: TimeSlotLayout[],
  occupiedSlots: Set<string>,
  cardIds: string[],
): PlacementsResult {
  const periodOrder = [Period.Morning, Period.Afternoon, Period.Evening, Period.Overnight];
  const placements: SlotPlacement[] = [];
  let layout = slotLayout;
  const taken = new Set(occupiedSlots);

  for (let i = 0; i < cardIds.length; i++) {
    const cardId = cardIds[i]!;
    const targetPeriod = periodOrder[i % periodOrder.length]!;

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
        cardId,
        period: availableSlot.period,
        slotIndex: availableSlot.index,
        slotType: availableSlot.slotType,
      });
    } else {
      // Target period is full — create an overload slot.
      const overloadIndex = layout.filter((s) => s.period === targetPeriod).length;
      const overloadSlot: TimeSlotLayout = {
        period: targetPeriod,
        index: overloadIndex,
        slotType: SlotType.Overloaded,
      };
      layout = [...layout, overloadSlot];
      taken.add(`${targetPeriod}:${overloadIndex}`);
      placements.push({
        cardId,
        period: targetPeriod,
        slotIndex: overloadIndex,
        slotType: SlotType.Overloaded,
      });
    }
  }

  return { placements, newSlotLayout: layout };
}

