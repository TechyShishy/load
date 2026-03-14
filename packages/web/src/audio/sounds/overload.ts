import { makeNoiseBuffer } from './utils.js';

// tanh(x * 6) * 0.9 — smooth heavy saturation, output bounded to [-0.9, 0.9].
// Built once at module load; reused by every playOverload() call.
const CURVE_SIZE = 512;
const OVERLOAD_CURVE = new Float32Array(CURVE_SIZE);
for (let i = 0; i < CURVE_SIZE; i++) {
  const x = (i * 2) / (CURVE_SIZE - 1) - 1;
  OVERLOAD_CURVE[i] = Math.tanh(x * 6) * 0.9;
}

/**
 * Two hard-saturated sines (220 Hz + 330 Hz) through a shared tanh WaveShaperNode,
 * each sweeping one octave down over 600 ms. The second sine enters 15 ms late so
 * intermodulation products shift as it fades in, producing a crunchy dissonant smear.
 * A low-gain bandpass noise bed (200 Hz) fills out the midrange texture.
 */
export function playOverload(ctx: AudioContext, master: GainNode): void {
  const now = ctx.currentTime;
  const dur = 0.6;

  // oversample='4x' suppresses aliasing from the nonlinear curve.
  const shaper = ctx.createWaveShaper();
  shaper.curve = OVERLOAD_CURVE;
  shaper.oversample = '4x';

  // Post-shaper gain envelope — single envelope controls the whole distortion burst.
  const shaperGain = ctx.createGain();
  shaperGain.gain.setValueAtTime(0, now);
  shaperGain.gain.linearRampToValueAtTime(0.4, now + 0.002);
  shaperGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  shaper.connect(shaperGain);
  shaperGain.connect(master);

  // Layer 1: 220 Hz sine sweeping to 110 Hz (one octave down).
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(220, now);
  osc1.frequency.exponentialRampToValueAtTime(110, now + dur);
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0.6, now);
  osc1.connect(gain1);
  gain1.connect(shaper);
  osc1.start(now);
  osc1.stop(now + dur + 0.02);

  // Layer 2: 330 Hz sine (perfect fifth above), enters 15 ms later to shift the
  // intermodulation products as it appears. Sweeps to 165 Hz over the full duration.
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(330, now);
  osc2.frequency.exponentialRampToValueAtTime(165, now + dur);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0, now);
  gain2.gain.setValueAtTime(0, now + 0.015); // ramp anchor — pins linearRamp start point
  gain2.gain.linearRampToValueAtTime(0.4, now + 0.017); // 2 ms ramp avoids entry click
  osc2.connect(gain2);
  gain2.connect(shaper);
  osc2.start(now);
  osc2.stop(now + dur + 0.02);

  // Noise bed — bandpass at 200 Hz fills midrange texture under the distorted sines.
  const noiseBuf = makeNoiseBuffer(ctx, dur + 0.05);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 200;
  bp.Q.value = 2;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(0.2, now + 0.003);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);
  noise.stop(now + dur + 0.05);
}
