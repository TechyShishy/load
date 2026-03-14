/** Soft electronic blip: sine 880 → 440 Hz exponential sweep, 100ms. */
export function playCardDrop(ctx: AudioContext, master: GainNode): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);

  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 0.11);
}
