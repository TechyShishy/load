import { Period, TrafficCard } from '../../types.js';

export class IoTBurstCard extends TrafficCard {
  readonly templateId = 'traffic-iot-burst';
  readonly name = 'IoT Data Burst';
  readonly revenue = 3_000;
  readonly description = 'Sudden data surges from connected devices.';
  override readonly flavorText = 'Every smart device on the street published an MQTT packet to us at 7 AM. All of them. At once.';
  // Weekday morning sync; weekend devices run overnight (no commute).
  override readonly weekTable = [
    Period.Morning,   // Mon
    Period.Morning,   // Tue
    Period.Morning,   // Wed
    Period.Morning,   // Thu
    Period.Morning,   // Fri
    Period.Overnight, // Sat
    Period.Overnight, // Sun
  ] as const;

  constructor(public readonly id: string = 'traffic-iot-burst') {
    super();
  }
}
