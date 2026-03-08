import { ActionCard, Period, type GameContext, type TimeSlot } from '../../types.js';

export class DataCenterExpansionCard extends ActionCard {
  readonly templateId = 'action-datacenter-expansion';
  readonly name = 'Data Center Expansion';
  readonly cost = 30_000;
  readonly description = 'Add 2 bonus slots to any period this round.';
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

    // Convert overload slots in the target period first (up to 2),
    // then add any remaining new empty weekly-temporary slots.
    const overloadSlotsInPeriod = context.timeSlots.filter(
      (s) => s.period === resolvedPeriod && s.overloaded === true,
    );
    const slotsToConvert = Math.min(overloadSlotsInPeriod.length, 2);
    const slotsToAdd = 2 - slotsToConvert;

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
