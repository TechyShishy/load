import { ActionCard, Period, type GameContext, type TimeSlot } from '../../types.js';

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

    // Convert overload slots in the target period first (up to 1),
    // then add any remaining new empty weekly-temporary slots.
    const overloadSlotsInPeriod = context.timeSlots.filter(
      (s) => s.period === resolvedPeriod && s.overloaded === true,
    );
    const slotsToConvert = Math.min(overloadSlotsInPeriod.length, 1);
    const slotsToAdd = 1 - slotsToConvert;

    let convertedCount = 0;
    const updatedTimeSlots = context.timeSlots.map((s): TimeSlot => {
      if (s.period === resolvedPeriod && s.overloaded === true && convertedCount < slotsToConvert) {
        convertedCount++;
        return {
          period: s.period,
          index: s.index,
          card: s.card,
          weeklyTemporary: true,
        };
      }
      return s;
    });

    const newSlotBase = updatedTimeSlots.filter((s) => s.period === resolvedPeriod).length;
    const newSlots: TimeSlot[] = Array.from({ length: slotsToAdd }, (_, i) => ({
      period: resolvedPeriod,
      index: newSlotBase + i,
      card: null,
      weeklyTemporary: true as const,
    }));

    return { ...context, timeSlots: [...updatedTimeSlots, ...newSlots] };
  }
}
