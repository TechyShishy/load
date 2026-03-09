import { ActionCard, Period, SlotType, type GameContext } from '../../types.js';
import { getActorAtSlot } from '../../cardPositionViews.js';

export class BandwidthUpgradeCard extends ActionCard {
  readonly templateId = 'action-bandwidth-upgrade';
  readonly name = 'Bandwidth Upgrade';
  readonly cost = 20_000;
  readonly description = 'Add 1 bonus slot to a Period until Monday.';
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
    let converted = 0;
    updatedSlotLayout = updatedSlotLayout.map((s) => {
      if (
        s.period === resolvedPeriod &&
        s.slotType === SlotType.Overloaded &&
        converted < slotsToConvert
      ) {
        converted++;
        // Also update the traffic card actor occupying this slot.
        const occupant = getActorAtSlot(context, s.period, s.index);
        occupant?.actor.send({ type: 'UPDATE_SLOT_TYPE', slotType: SlotType.WeeklyTemporary });
        return { ...s, slotType: SlotType.WeeklyTemporary };
      }
      return s;
    });

    // Append new empty weekly-temporary slots if needed.
    const newSlotBase = updatedSlotLayout.filter((s) => s.period === resolvedPeriod).length;
    for (let i = 0; i < slotsToAdd; i++) {
      updatedSlotLayout = [
        ...updatedSlotLayout,
        { period: resolvedPeriod, index: newSlotBase + i, slotType: SlotType.WeeklyTemporary },
      ];
    }

    return { ...context, slotLayout: updatedSlotLayout };
  }
}
