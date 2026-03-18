import { VendorCard, type GameContext, type LedgerEntry } from '../../types.js';

export class ManagedServicesAgreementCard extends VendorCard {
  readonly templateId = 'vendor-managed-services-agreement';
  readonly id: string;
  readonly name = 'Managed Services Agreement';
  readonly cost = 30_000;
  readonly description =
    'Each round, receive 25% of your total action-card spend back as an MSA operational credit.';
  override readonly flavorText =
    "Section 4.2 grants a 25% credit on qualifying operational expenditures. Section 4.3 defines 'qualifying.' Section 4.3 is 47 pages long.";

  constructor(instanceId = 'vendor-managed-services-agreement') {
    super();
    this.id = instanceId;
  }

  onResolve(ctx: GameContext): GameContext {
    const totalActionSpend = ctx.pendingLedger
      .filter((e) => e.kind === 'action-spend')
      .reduce((sum, e) => sum + e.amount, 0);

    if (totalActionSpend === 0) return ctx;

    // Multiple MSA instances stack additively: each independently applies 25%
    // to the same set of action-spend entries, so two instances yield 50%.
    const credit = Math.floor(totalActionSpend * 0.25);
    return {
      ...ctx,
      budget: ctx.budget + credit,
      pendingLedger: [
        ...ctx.pendingLedger,
        { kind: 'vendor-revenue', amount: credit, label: this.name } satisfies LedgerEntry,
      ],
    };
  }
}
