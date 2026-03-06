import { type ActionCard } from '../../types.js';
import { EmergencyMaintenanceCard } from './EmergencyMaintenanceCard.js';
import { TrafficPrioritizationCard } from './TrafficPrioritizationCard.js';
import { BandwidthUpgradeCard } from './BandwidthUpgradeCard.js';
import { SecurityPatchCard } from './SecurityPatchCard.js';
import { DataCenterExpansionCard } from './DataCenterExpansionCard.js';
import { StreamCompressionCard } from './StreamCompressionCard.js';

export { EmergencyMaintenanceCard } from './EmergencyMaintenanceCard.js';
export { TrafficPrioritizationCard } from './TrafficPrioritizationCard.js';
export { BandwidthUpgradeCard } from './BandwidthUpgradeCard.js';
export { SecurityPatchCard } from './SecurityPatchCard.js';
export { DataCenterExpansionCard } from './DataCenterExpansionCard.js';
export { StreamCompressionCard } from './StreamCompressionCard.js';

/** Registry mapping templateId → constructor for deserialization. */
export const ACTION_CARD_REGISTRY = new Map<string, new (instanceId: string) => ActionCard>([
  ['action-emergency-maintenance', EmergencyMaintenanceCard],
  ['action-traffic-prioritization', TrafficPrioritizationCard],
  ['action-bandwidth-upgrade', BandwidthUpgradeCard],
  ['action-security-patch', SecurityPatchCard],
  ['action-datacenter-expansion', DataCenterExpansionCard],
  ['action-stream-compression', StreamCompressionCard],
]);

/** Singleton template instances (id === templateId). Used by deck builder. */
export const ACTION_CARDS: ActionCard[] = [
  new EmergencyMaintenanceCard(),
  new TrafficPrioritizationCard(),
  new BandwidthUpgradeCard(),
  new SecurityPatchCard(),
  new DataCenterExpansionCard(),
  new StreamCompressionCard(),
];
