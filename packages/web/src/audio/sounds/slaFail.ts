/** Triple alarm chirp: 3× descending square-wave notes (660/550/440 Hz). */
export function playSLAFail(ctx: AudioContext, master: GainNode): void {
  const freqs = [660, 550, 440];
  const noteDur = 0.12;
  const gap = 0.06;

  freqs.forEach((freq, i) => {
    const t = ctx.currentTime + i * (noteDur + gap);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + noteDur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + noteDur + 0.01);
  });
}
