import { makeNoiseBuffer } from './utils.js';

/**
 * Three descending square-wave alarm notes (440 → 330 → 220 Hz), each with a
 * 6 Hz gain tremolo (±0.06 depth) that produces a warbling alert character.
 * A bandpass noise burst (~600 Hz, Q 4) fires at the attack of every note
 * and decays before the next note arrives.
 * Total duration: ~490 ms.
 */
export function playSLAFail(ctx: AudioContext, master: GainNode): void {
  const freqs = [440, 330, 220];
  const noteDur = 0.13;
  const gap = 0.05;
  const now = ctx.currentTime;

  freqs.forEach((freq, i) => {
    const t = now + i * (noteDur + gap);

    // --- Square oscillator with gain envelope + tremolo ---
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);

    const envGain = ctx.createGain();
    envGain.gain.setValueAtTime(0, t);
    envGain.gain.linearRampToValueAtTime(0.25, t + 0.006);
    envGain.gain.exponentialRampToValueAtTime(0.001, t + noteDur);

    // 6 Hz tremolo: ~0.78 cycles per note — audible warble without smearing.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(6, t);
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.06;
    lfo.connect(lfoDepth);
    lfoDepth.connect(envGain.gain);

    osc.connect(envGain);
    envGain.connect(master);
    osc.start(t);
    osc.stop(t + noteDur + 0.01);
    lfo.start(t);
    lfo.stop(t + noteDur + 0.01);

    // --- Bandpass noise burst at attack ---
    const noiseBuf = makeNoiseBuffer(ctx, 0.09);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 4;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.15, t + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(t);
    noise.stop(t + 0.09);
  });
}
