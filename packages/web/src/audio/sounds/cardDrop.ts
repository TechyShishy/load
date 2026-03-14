import { makeNoiseBuffer } from './utils.js';

/**
 * Card-on-table thud: sine body (200 → 50 Hz pitch drop, 150 ms) for the
 * low-frequency thump, plus a short lowpass noise burst (900 Hz, 50 ms)
 * for the cardboard impact texture. Body starts at 200 Hz so it is audible
 * on laptop speakers; the exponential pitch drop produces the characteristic
 * falling-thud shape.
 */
export function playCardDrop(ctx: AudioContext, master: GainNode): void {
  const now = ctx.currentTime;
  const dur = 0.15;

  // Low-frequency body — pitch drops from 200 Hz to 50 Hz for the thud shape.
  const body = ctx.createOscillator();
  const bodyGain = ctx.createGain();

  body.type = 'sine';
  body.frequency.setValueAtTime(200, now);
  body.frequency.exponentialRampToValueAtTime(50, now + dur);

  bodyGain.gain.setValueAtTime(0.001, now);
  bodyGain.gain.linearRampToValueAtTime(0.55, now + 0.003);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  body.connect(bodyGain);
  bodyGain.connect(master);
  body.start(now);
  body.stop(now + dur + 0.005);

  // Noise burst — cardboard/paper texture on the initial impact.
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, 0.05);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(900, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.001, now);
  noiseGain.gain.linearRampToValueAtTime(0.3, now + 0.002);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);
  noise.stop(now + 0.055);
}
