import { type TrafficCard } from '../../types.js';
import { FourKStreamCard } from './FourKStreamCard.js';
import { IoTBurstCard } from './IoTBurstCard.js';
import { CloudBackupCard } from './CloudBackupCard.js';
import { DDoSTrafficCard } from './DDoSTrafficCard.js';

export { FourKStreamCard } from './FourKStreamCard.js';
export { IoTBurstCard } from './IoTBurstCard.js';
export { CloudBackupCard } from './CloudBackupCard.js';
export { DDoSTrafficCard } from './DDoSTrafficCard.js';

/** Registry mapping templateId → constructor for deserialization. */
export const TRAFFIC_CARD_REGISTRY = new Map<string, new (instanceId: string) => TrafficCard>([
  ['traffic-4k-stream', FourKStreamCard],
  ['traffic-iot-burst', IoTBurstCard],
  ['traffic-cloud-backup', CloudBackupCard],
  // Spawned-only card: registered for save/load but intentionally excluded from the deck
  ['traffic-ddos', DDoSTrafficCard],
]);

/** Singleton template instances (id === templateId). Used by deck builder. */
export const TRAFFIC_CARDS: TrafficCard[] = [
  new FourKStreamCard(),
  new IoTBurstCard(),
  new CloudBackupCard(),
];
