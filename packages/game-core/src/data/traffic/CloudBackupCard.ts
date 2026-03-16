import { Period, TrafficCard } from '../../types.js';

export class CloudBackupCard extends TrafficCard {
  readonly templateId = 'traffic-cloud-backup';
  readonly name = 'Cloud Backup';
  readonly revenue = 7_000;
  readonly description = 'Scheduled data transfers to cloud storage.';
  readonly flavorText = "The cloud doesn't back itself up. That's your problem now.";
  // Runs every night; Saturday job starts unusually at morning.
  override readonly weekTable = [
    Period.Overnight, // Mon
    Period.Overnight, // Tue
    Period.Overnight, // Wed
    Period.Overnight, // Thu
    Period.Overnight, // Fri
    Period.Morning,   // Sat — weekly full-backup window
    Period.Overnight, // Sun
  ] as const;

  constructor(public readonly id: string = 'traffic-cloud-backup') {
    super();
  }
}
