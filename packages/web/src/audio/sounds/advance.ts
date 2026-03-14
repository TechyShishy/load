/** Subtle sine tink: sine at 880 Hz, 2ms attack, 50ms decay. */
export function playAdvance(ctx: AudioContext, master: GainNode): void {
  const now = ctx.currentTime;
  const attack = 0.002;
  const dur = 0.05;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);

  gain.gain.setValueAtTime(0.0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.005);
}
