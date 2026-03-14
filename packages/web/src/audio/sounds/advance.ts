/** Soft mechanical tick: square at 1200 Hz, 30ms. */
export function playAdvance(ctx: AudioContext, master: GainNode): void {
  const now = ctx.currentTime;
  const dur = 0.03;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(1200, now);

  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.005);
}
