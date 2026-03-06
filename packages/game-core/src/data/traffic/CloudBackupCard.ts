import { TrafficCard } from '../../types.js';

export class CloudBackupCard extends TrafficCard {
  readonly templateId = 'traffic-cloud-backup';
  readonly name = 'Cloud Backup';
  readonly hoursRequired = 3;
  readonly revenue = 7_000;
  readonly description = 'Scheduled data transfers to cloud storage.';

  constructor(public readonly id: string = 'traffic-cloud-backup') {
    super();
  }
}
