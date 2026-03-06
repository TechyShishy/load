import { TrafficCard } from '../../types.js';

export class FourKStreamCard extends TrafficCard {
  readonly templateId = 'traffic-4k-stream';
  readonly name = '4K Video Streams';
  readonly hoursRequired = 2;
  readonly revenue = 5_000;
  readonly description = 'High-bandwidth traffic from streaming services.';

  constructor(public readonly id: string = 'traffic-4k-stream') {
    super();
  }
}
