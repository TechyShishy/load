import { ActionCard, type GameContext } from '../../types.js';

export class RedundantLinkCard extends ActionCard {
  readonly templateId = 'action-redundant-link';
  readonly name = 'Redundant Link';
  readonly cost = 45_000;
  readonly description =
    'Emergency failover: forgive up to 2 SLA failures this resolution phase. Cannot reduce SLA failures already tallied.';
  readonly allowedOnWeekend = true;
  readonly validDropZones = ['board'] as const;
  override readonly invalidZoneFeedback = 'Drop on the board to activate failover.';

  constructor(public readonly id: string = 'action-redundant-link') {
    super();
  }

  apply(
    _ctx: GameContext,
    commit: () => GameContext,
  ): GameContext {
    const context = commit();
    // Additive: two copies played in the same round stack to forgive up to 4 failures
    // (capped at actual failures by Math.min in resolveRound).
    return { ...context, slaForgivenessThisRound: context.slaForgivenessThisRound + 2 };
  }
}
