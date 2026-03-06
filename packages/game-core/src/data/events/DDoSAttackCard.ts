import { EventCard, Track, type GameContext } from '../../types.js';
import { applyDowntime, issueTicket } from './helpers.js';

export class DDoSAttackCard extends EventCard {
  readonly templateId = 'event-ddos-attack';
  readonly name = 'DDoS Attack';
  readonly label = 'ISSUE TICKET';
  readonly description =
    'A volumetric attack overwhelms your edge nodes. File a Break/Fix ticket immediately.';

  constructor(public readonly id: string = 'event-ddos-attack') {
    super();
  }

  onCrisis(ctx: GameContext, mitigated: boolean): GameContext {
    if (mitigated) return ctx;
    let context = issueTicket(ctx, Track.BreakFix, this);
    context = { ...context, budget: context.budget - 50_000 };
    context = applyDowntime(context, 1);
    return context;
  }
}
