import { TrafficCard } from '../../types.js';

export class IoTBurstCard extends TrafficCard {
  readonly templateId = 'traffic-iot-burst';
  readonly name = 'IoT Data Burst';
  readonly revenue = 3_000;
  readonly description = 'Sudden data surges from connected devices.';

  constructor(public readonly id: string = 'traffic-iot-burst') {
    super();
  }
}
