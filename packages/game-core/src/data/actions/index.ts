import { type ActionCard } from '../../types.js';
import { WorkOrderCard } from './WorkOrderCard.js';
import { TrafficPrioritizationCard } from './TrafficPrioritizationCard.js';
import { BandwidthUpgradeCard } from './BandwidthUpgradeCard.js';
import { NullRouteCard } from './NullRouteCard.js';
import { DataCenterExpansionCard } from './DataCenterExpansionCard.js';
import { StreamCompressionCard } from './StreamCompressionCard.js';
import { RedundantLinkCard } from './RedundantLinkCard.js';

export { WorkOrderCard } from './WorkOrderCard.js';
export { TrafficPrioritizationCard } from './TrafficPrioritizationCard.js';
export { BandwidthUpgradeCard } from './BandwidthUpgradeCard.js';
export { NullRouteCard } from './NullRouteCard.js';
export { DataCenterExpansionCard } from './DataCenterExpansionCard.js';
export { StreamCompressionCard } from './StreamCompressionCard.js';
export { RedundantLinkCard } from './RedundantLinkCard.js';

/** Registry mapping templateId → constructor for deserialization. */
export const ACTION_CARD_REGISTRY = new Map<string, new (instanceId: string) => ActionCard>([
  ['action-work-order', WorkOrderCard],
  ['action-traffic-prioritization', TrafficPrioritizationCard],
  ['action-bandwidth-upgrade', BandwidthUpgradeCard],
  ['action-null-route', NullRouteCard],
  // TODO-0019: explicit test of the save-migration shim system — action-security-patch renamed to action-null-route.
  // Remove once save compatibility with pre-rename saves is no longer required.
  ['action-security-patch', NullRouteCard],
  ['action-datacenter-expansion', DataCenterExpansionCard],
  ['action-stream-compression', StreamCompressionCard],
  ['action-redundant-link', RedundantLinkCard],
]);

/** Singleton template instances (id === templateId). Used by deck builder. */
export const ACTION_CARDS: ActionCard[] = [
  new WorkOrderCard(),
  new TrafficPrioritizationCard(),
  new BandwidthUpgradeCard(),
  new NullRouteCard(),
  new DataCenterExpansionCard(),
  new StreamCompressionCard(),
  new RedundantLinkCard(),
];
