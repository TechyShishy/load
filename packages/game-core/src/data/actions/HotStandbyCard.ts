import { ActionCard, type GameContext } from '../../types.js';
import { getPendingEvents } from '../../cardPositionViews.js';

export class HotStandbyCard extends ActionCard {
  readonly templateId = 'action-hot-standby';
  readonly name = 'Hot Standby';
  readonly cost = 15_000;
  readonly description =
    'Mitigate 1 AWS Outage event, waiving the $25,000 recovery cost and preventing the skipped traffic draw.';
  readonly flavorText = 'It was ready the whole time. Probably.';
  readonly allowedOnWeekend = true;
  override readonly crisisOnly = true as const;
  override readonly validForEventTemplateIds = ['event-aws-outage'] as const;
  readonly validDropZones = [] as const;
  override readonly invalidZoneFeedback = 'Hot Standby can only be activated during a crisis.';

  constructor(public readonly id: string = 'action-hot-standby') {
    super();
  }

  apply(
    ctx: GameContext,
    commit: () => GameContext,
    targetEventId?: string,
  ): GameContext {
    let context = commit();
    const resolvedTarget =
      targetEventId ??
      getPendingEvents(context).find(
        (e) => !context.mitigatedEventIds.includes(e.id) && e.templateId === 'event-aws-outage',
      )?.id;
    if (resolvedTarget) {
      context = {
        ...context,
        mitigatedEventIds: [...context.mitigatedEventIds, resolvedTarget],
      };
    }
    return context;
  }
}
