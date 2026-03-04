import { CardType, type TrafficCard } from '../types.js';

export const TRAFFIC_CARDS: TrafficCard[] = [
  {
    id: 'traffic-4k-stream',
    type: CardType.Traffic,
    name: '4K Video Streams',
    hoursRequired: 2,
    revenue: 5_000,
    description: 'High-bandwidth traffic from streaming services.',
  },
  {
    id: 'traffic-iot-burst',
    type: CardType.Traffic,
    name: 'IoT Data Burst',
    hoursRequired: 1,
    revenue: 3_000,
    description: 'Sudden data surges from connected devices.',
  },
  {
    id: 'traffic-cloud-backup',
    type: CardType.Traffic,
    name: 'Cloud Backup',
    hoursRequired: 3,
    revenue: 7_000,
    description: 'Scheduled data transfers to cloud storage.',
  },
];
