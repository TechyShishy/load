/** Returns the frequency in Hz for a MIDI note number (69 = A4 = 440 Hz). */
export function noteFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
