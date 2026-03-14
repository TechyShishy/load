import { makeNoiseBuffer } from './utils.js';

/** Bandpass-filtered white noise burst (fc=200 Hz, Q=2) + sawtooth thump at 55 Hz, 400ms. */
export function playOverload(ctx: AudioContext, master: GainNode): void {
  const now = ctx.currentTime;
  const dur = 0.4;

  // White noise through bandpass
  const noiseBuf = makeNoiseBuffer(ctx, dur + 0.05);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 200;
  bp.Q.value = 2;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.6, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  noise.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);
  noise.stop(now + dur + 0.05);

  // Sawtooth bass thump
  const saw = ctx.createOscillator();
  const sawGain = ctx.createGain();
  saw.type = 'sawtooth';
  saw.frequency.setValueAtTime(55, now);
  saw.frequency.exponentialRampToValueAtTime(30, now + dur);

  sawGain.gain.setValueAtTime(0.5, now);
  sawGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  saw.connect(sawGain);
  sawGain.connect(master);
  saw.start(now);
  saw.stop(now + dur + 0.01);
}
