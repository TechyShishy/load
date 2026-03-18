import { type VendorCard } from '../../types.js';
import { ManagedServicesAgreementCard } from './ManagedServicesAgreementCard.js';

export { ManagedServicesAgreementCard } from './ManagedServicesAgreementCard.js';

/**
 * Registry mapping templateId → constructor for deserialization.
 * To add a card: import its class above, add it to both structures below.
 */
export const VENDOR_CARD_REGISTRY = new Map<string, new (instanceId: string) => VendorCard>([
  ['vendor-managed-services-agreement', ManagedServicesAgreementCard],
]);

/** Singleton template instances (id === templateId). Used by deck builder. */
export const VENDOR_CARDS: VendorCard[] = [
  new ManagedServicesAgreementCard(),
];
