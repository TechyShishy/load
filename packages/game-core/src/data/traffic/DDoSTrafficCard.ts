import { TrafficCard } from '../../types.js';

export class DDoSTrafficCard extends TrafficCard {
  readonly templateId = 'traffic-ddos';
  readonly name = 'DDoS Traffic';
  readonly revenue = 1_500;
  readonly description = 'Malicious traffic flooding edge nodes from a DDoS attack. Low-value — clear it quickly to free up capacity.';

  constructor(public readonly id: string = 'traffic-ddos') {
    super();
  }
}
