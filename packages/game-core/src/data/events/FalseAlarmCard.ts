import { EventCard, type GameContext } from '../../types.js';

export class FalseAlarmCard extends EventCard {
  readonly templateId = 'event-false-alarm';
  readonly name = 'False Alarm';
  readonly label = 'ALL CLEAR';
  readonly description =
    'A monitoring alert fires, but all systems check out. No action required.';
  readonly flavorText = 'All systems nominal. You may now unclench.';

  constructor(public readonly id: string = 'event-false-alarm') {
    super();
  }

  onCrisis(ctx: GameContext, _mitigated: boolean): GameContext {
    return ctx;
  }
}
