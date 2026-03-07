import { TrafficCard } from '../../types.js';

export class DDoSTrafficCard extends TrafficCard {
  readonly templateId = 'traffic-ddos';
  readonly name = 'DDoS Traffic';
  readonly revenue = 0;
  readonly description = 'Malicious traffic flooding edge nodes from a DDoS attack.';

  constructor(public readonly id: string = 'traffic-ddos') {
    super();
  }
}
