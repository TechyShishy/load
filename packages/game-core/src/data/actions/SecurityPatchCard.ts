import { ActionCard, type GameContext } from '../../types.js';

export class SecurityPatchCard extends ActionCard {
  readonly templateId = 'action-security-patch';
  readonly name = 'Security Patch';
  readonly cost = 25_000;
  readonly description =
    'Mitigate 1 DDoS-type Event, cancelling its financial penalty and preventing the incident ticket from being filed.';
  readonly allowedOnWeekend = true;
  override readonly crisisOnly = true as const;
  override readonly validForEventTemplateIds = ['event-ddos-attack'] as const;

  constructor(public readonly id: string = 'action-security-patch') {
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
      ctx.pendingEvents.find(
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
