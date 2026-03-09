import { EventCard, Track, type GameContext } from '../../types.js';
import { issueTicket } from './helpers.js';

export class FiveGActivationCard extends EventCard {
  readonly templateId = 'event-5g-activation';
  readonly name = '5G Tower Activation';
  readonly label = 'CONTRACT FEE';
  readonly description =
    'New 5G towers demand a costly integration contract. Without mitigation, pay $15,000 and receive a Projects ticket. ' +
    'Requires 3 work cycles (Emergency Maintenance plays) to close — finish in the same round it arrives to earn back $60,000.';

  /** 3 Emergency Maintenance plays to fully close this ticket. */
  override readonly requiredClears = 3;
  /** Maximum payout when closed in the round it was issued. */
  override readonly clearRevenue = 60_000;
  /** Revenue drops by $3,000 for every round the ticket ages. */
  override readonly revenueDecayPerRound = 3_000;

  constructor(public readonly id: string = 'event-5g-activation') {
    super();
  }

  // TODO-0011: add a Negotiate Contract action card (MitigateEvent subtype targeting event-5g-activation)
  // that lets the player waive the $15,000 fee and project ticket by playing it during crisis phase.
  onCrisis(ctx: GameContext, mitigated: boolean): GameContext {
    if (mitigated) return ctx;
    const afterBudget = { ...ctx, budget: ctx.budget - 15_000 };
    return issueTicket(afterBudget, Track.Projects, this);
  }
}
