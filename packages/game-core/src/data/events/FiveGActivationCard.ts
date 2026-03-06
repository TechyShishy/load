import { EventCard, Track, type GameContext } from '../../types.js';
import { issueTicket } from './helpers.js';

export class FiveGActivationCard extends EventCard {
  readonly templateId = 'event-5g-activation';
  readonly name = '5G Tower Activation';
  readonly label = 'ISSUE TICKET';
  readonly description =
    'New 5G towers come online; integration project ticket must be handled to capture revenue.';

  constructor(public readonly id: string = 'event-5g-activation') {
    super();
  }

  onCrisis(ctx: GameContext, mitigated: boolean): GameContext {
    if (mitigated) return ctx;
    let context = issueTicket(ctx, Track.Projects, this);
    context = { ...context, budget: context.budget - 25_000 };
    return context;
  }
}
