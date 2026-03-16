import { ActionCard, Period, SlotType, type GameContext } from '../../types.js';
import { getCardIdAtSlot } from '../../cardPositionViews.js';

export class BandwidthUpgradeCard extends ActionCard {
  readonly templateId = 'action-bandwidth-upgrade';
  readonly name = 'Bandwidth Upgrade';
  readonly cost = 20_000;
  readonly description = 'Add 1 permanent bonus slot to a Period.';
  override readonly flavorText =
    'The first upgrade lasts six months. The second, three. The third, you order before the second lands.';
  readonly allowedOnWeekend = false;
  readonly validDropZones = ['period'] as const;
  override readonly invalidZoneFeedback = 'Drop on a period column to boost its capacity.';
  override readonly periodZoneVariant = 'add' as const;

  constructor(public readonly id: string = 'action-bandwidth-upgrade') {
    super();
  }

  apply(
    _ctx: GameContext,
    commit: () => GameContext,
    _targetEventId?: string,
    _targetTrafficCardId?: string,
    targetPeriod?: Period,
  ): GameContext {
    const context = commit();
    const resolvedPeriod = targetPeriod ?? Period.Afternoon;

    // Find up to 1 overloaded slot in the period to convert first.
    const overloadedInPeriod = context.slotLayout.filter(
      (s) => s.period === resolvedPeriod && s.slotType === SlotType.Overloaded,
    );
    const slotsToConvert = Math.min(overloadedInPeriod.length, 1);
    const slotsToAdd = 1 - slotsToConvert;

    let updatedSlotLayout = context.slotLayout;
    let updatedTrafficSlotPositions = context.trafficSlotPositions;
    let converted = 0;
    updatedSlotLayout = updatedSlotLayout.map((s) => {
      if (
        s.period === resolvedPeriod &&
        s.slotType === SlotType.Overloaded &&
        converted < slotsToConvert
      ) {
        converted++;
        // Also update the occupying card's slot type in the position map.
        const occupantId = getCardIdAtSlot(context, s.period, s.index);
        if (occupantId !== undefined) {
          updatedTrafficSlotPositions = {
            ...updatedTrafficSlotPositions,
            [occupantId]: { ...updatedTrafficSlotPositions[occupantId]!, slotType: SlotType.Normal },
          };
        }
        return { ...s, slotType: SlotType.Normal };
      }
      return s;
    });

    // Append new empty permanent slots if needed.
    const newSlotBase = updatedSlotLayout.filter((s) => s.period === resolvedPeriod).length;
    for (let i = 0; i < slotsToAdd; i++) {
      updatedSlotLayout = [
        ...updatedSlotLayout,
        { period: resolvedPeriod, index: newSlotBase + i, slotType: SlotType.Normal },
      ];
    }

    return { ...context, slotLayout: updatedSlotLayout, trafficSlotPositions: updatedTrafficSlotPositions };
  }
}
