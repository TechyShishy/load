import { CardType, EventSubtype, Track, type EventCard } from '../types.js';

export const EVENT_CARDS: EventCard[] = [
  {
    id: 'event-ddos-attack',
    type: CardType.Event,
    name: 'DDoS Attack',
    subtype: EventSubtype.IssueTicket,
    targetTrack: Track.BreakFix,
    unmitigatedPenalty: 50_000,
    downtimePenaltyHours: 1,
    description:
      'A volumetric attack overwhelms your edge nodes. File a Break/Fix ticket immediately.',
  },
  {
    id: 'event-aws-outage',
    type: CardType.Event,
    name: 'AWS Outage',
    subtype: EventSubtype.SpawnTraffic,
    spawnCount: 2,
    spawnTrafficId: 'traffic-cloud-backup',
    unmitigatedPenalty: 75_000,
    downtimePenaltyHours: 2,
    description:
      'Cloud provider outage forces backup traffic onto your on-prem infrastructure.',
  },
  {
    id: 'event-5g-activation',
    type: CardType.Event,
    name: '5G Tower Activation',
    subtype: EventSubtype.IssueTicket,
    targetTrack: Track.Projects,
    unmitigatedPenalty: 25_000,
    downtimePenaltyHours: 1,
    description:
      'New 5G towers come online; integration project ticket must be handled to capture revenue.',
  },
];
