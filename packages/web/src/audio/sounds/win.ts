/** Ascending C-major arpeggio: C4 E4 G4 C5, 4×sine at 110ms intervals. */
export function playWin(ctx: AudioContext, master: GainNode): void {
  // C4=261.63 E4=329.63 G4=392.00 C5=523.25
  const freqs = [261.63, 329.63, 392.0, 523.25];
  const noteDur = 0.12;
  const interval = 0.11;

  freqs.forEach((freq, i) => {
    const t = ctx.currentTime + i * interval;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.0, t);
    gain.gain.linearRampToValueAtTime(0.45, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + noteDur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + noteDur + 0.01);
  });
}
