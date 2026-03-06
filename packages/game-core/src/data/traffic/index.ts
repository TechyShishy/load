import { type TrafficCard } from '../../types.js';
import { FourKStreamCard } from './FourKStreamCard.js';
import { IoTBurstCard } from './IoTBurstCard.js';
import { CloudBackupCard } from './CloudBackupCard.js';

export { FourKStreamCard } from './FourKStreamCard.js';
export { IoTBurstCard } from './IoTBurstCard.js';
export { CloudBackupCard } from './CloudBackupCard.js';

/** Registry mapping templateId → constructor for deserialization. */
export const TRAFFIC_CARD_REGISTRY = new Map<string, new (instanceId: string) => TrafficCard>([
  ['traffic-4k-stream', FourKStreamCard],
  ['traffic-iot-burst', IoTBurstCard],
  ['traffic-cloud-backup', CloudBackupCard],
]);

/** Singleton template instances (id === templateId). Used by deck builder. */
export const TRAFFIC_CARDS: TrafficCard[] = [
  new FourKStreamCard(),
  new IoTBurstCard(),
  new CloudBackupCard(),
];
