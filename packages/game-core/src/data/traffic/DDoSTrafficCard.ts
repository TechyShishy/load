import { TrafficCard } from '../../types.js';

export class DDoSTrafficCard extends TrafficCard {
  readonly templateId = 'traffic-ddos';
  readonly name = 'DDoS Traffic';
  readonly revenue = 1_500;
  readonly description = 'Malicious traffic flooding edge nodes from a DDoS attack. Low-value — clear it quickly to free up capacity.';
  override readonly flavorText = 'Nobody knows who sent it. The logs agree on nothing.';
  // Alt flavor: "Technically, it's just a lot of people saying hello at once."
  // Spawned-only: no weekTable. The DDoSAttackCard places one copy in each period directly.

  constructor(public readonly id: string = 'traffic-ddos') {
    super();
  }
}
