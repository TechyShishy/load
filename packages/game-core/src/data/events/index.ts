import { type EventCard } from '../../types.js';
import { DDoSAttackCard } from './DDoSAttackCard.js';
import { AWSOutageCard } from './AWSOutageCard.js';
import { FiveGActivationCard } from './FiveGActivationCard.js';

export { DDoSAttackCard } from './DDoSAttackCard.js';
export { AWSOutageCard } from './AWSOutageCard.js';
export { FiveGActivationCard } from './FiveGActivationCard.js';

/** Registry mapping templateId → constructor for deserialization. */
export const EVENT_CARD_REGISTRY = new Map<string, new (instanceId: string) => EventCard>([
  ['event-ddos-attack', DDoSAttackCard],
  ['event-aws-outage', AWSOutageCard],
  ['event-5g-activation', FiveGActivationCard],
]);

/** Singleton template instances (id === templateId). Used by deck builder. */
export const EVENT_CARDS: EventCard[] = [
  new DDoSAttackCard(),
  new AWSOutageCard(),
  new FiveGActivationCard(),
];
