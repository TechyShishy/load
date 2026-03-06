import { ActionCard, Period, SLOT_BASE_CAPACITY, type GameContext, type TimeSlot } from '../../types.js';

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
    let context = commit();
    const resolvedPeriod = targetPeriod ?? Period.Afternoon;
    const existingCount = context.timeSlots.filter((s) => s.period === resolvedPeriod).length;
    const newSlots: TimeSlot[] = Array.from({ length: 1 }, (_, i) => ({
      period: resolvedPeriod,
      index: existingCount + i,
      baseCapacity: SLOT_BASE_CAPACITY,
      cards: [],
      unavailable: false,
      weeklyTemporary: true,
    }));
    return { ...context, timeSlots: [...context.timeSlots, ...newSlots] };
  }
}
