import { ActionCard, type GameContext } from '../../types.js';
import { getPendingEvents } from '../../cardPositionViews.js';

export class NullRouteCard extends ActionCard {
  readonly templateId = 'action-null-route';
  readonly name = 'Null Route';
  readonly cost = 25_000;
  readonly description =
    'Mitigate 1 DDoS-type Event, cancelling its financial penalty and preventing the incident ticket from being filed.';
  override readonly flavorText = '/dev/tcp > /dev/null';
  readonly allowedOnWeekend = true;
  override readonly crisisOnly = true as const;
  override readonly validForEventTemplateIds = ['event-ddos-attack'] as const;
  readonly validDropZones = [] as const;
  override readonly invalidZoneFeedback = 'Null Route can only be deployed during a crisis.';

  constructor(public readonly id: string = 'action-null-route') {
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
      getPendingEvents(ctx).find(
        (e) => !ctx.mitigatedEventIds.includes(e.id) && e.templateId === 'event-ddos-attack',
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
