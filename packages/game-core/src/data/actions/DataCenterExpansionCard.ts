import { ActionCard, Period, SLOT_BASE_CAPACITY, type GameContext, type TimeSlot } from '../../types.js';

export class DataCenterExpansionCard extends ActionCard {
  readonly templateId = 'action-datacenter-expansion';
  readonly name = 'Data Center Expansion';
  readonly cost = 30_000;
  readonly description = 'Add 2 bonus slots to any period this round.';
  readonly allowedOnWeekend = false;

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
    let context = commit();
    const resolvedPeriod = targetPeriod ?? Period.Overnight;
    const existingCount = context.timeSlots.filter((s) => s.period === resolvedPeriod).length;
    const newSlots: TimeSlot[] = Array.from({ length: 2 }, (_, i) => ({
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
