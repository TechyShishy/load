import { ActionCard, Period, SlotType, type GameContext } from '../../types.js';
import { getActorAtSlot } from '../../cardPositionViews.js';

export class DataCenterExpansionCard extends ActionCard {
  readonly templateId = 'action-datacenter-expansion';
  readonly name = 'Data Center Expansion';
  readonly cost = 30_000;
  readonly description = 'Add 2 permanent bonus slots to a Period.';
  readonly allowedOnWeekend = false;
  readonly validDropZones = ['period'] as const;
  override readonly invalidZoneFeedback = 'Drop on a period column to add slots.';
  override readonly periodZoneVariant = 'add' as const;

  constructor(public readonly id: string = 'action-datacenter-expansion') {
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
    const resolvedPeriod = targetPeriod ?? Period.Overnight;

    const overloadedInPeriod = context.slotLayout.filter(
      (s) => s.period === resolvedPeriod && s.slotType === SlotType.Overloaded,
    );
    const slotsToConvert = Math.min(overloadedInPeriod.length, 2);
    const slotsToAdd = 2 - slotsToConvert;

    let updatedSlotLayout = context.slotLayout;
    let converted = 0;
    updatedSlotLayout = updatedSlotLayout.map((s) => {
      if (
        s.period === resolvedPeriod &&
        s.slotType === SlotType.Overloaded &&
        converted < slotsToConvert
      ) {
        converted++;
        const occupant = getActorAtSlot(context, s.period, s.index);
        occupant?.actor.send({ type: 'UPDATE_SLOT_TYPE', slotType: SlotType.Normal });
        return { ...s, slotType: SlotType.Normal };
      }
      return s;
    });

    const newSlotBase = updatedSlotLayout.filter((s) => s.period === resolvedPeriod).length;
    for (let i = 0; i < slotsToAdd; i++) {
      updatedSlotLayout = [
        ...updatedSlotLayout,
        { period: resolvedPeriod, index: newSlotBase + i, slotType: SlotType.Normal },
      ];
    }

    return { ...context, slotLayout: updatedSlotLayout };
  }
}
