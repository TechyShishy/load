import { Period, TrafficCard } from '../../types.js';

export class FourKStreamCard extends TrafficCard {
  readonly templateId = 'traffic-4k-stream';
  readonly name = '4K Video Streams';
  readonly revenue = 5_000;
  readonly description = 'High-bandwidth traffic from streaming services.';
  readonly flavorText = 'Six megabits per second, times everyone on the block, times the new season just dropped.';
  // Weeknight prime-time; weekend viewing starts earlier.
  override readonly weekTable = [
    Period.Evening,   // Mon
    Period.Evening,   // Tue
    Period.Evening,   // Wed
    Period.Evening,   // Thu
    Period.Evening,   // Fri
    Period.Afternoon, // Sat
    Period.Afternoon, // Sun
  ] as const;

  constructor(public readonly id: string = 'traffic-4k-stream') {
    super();
  }
}
