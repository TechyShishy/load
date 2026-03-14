import { makeNoiseBuffer } from './utils.js';

/** Power-down sweep: sine 220 → 30 Hz exp over 900ms + fading high-pass noise. */
export function playLose(ctx: AudioContext, master: GainNode): void {
  const now = ctx.currentTime;
  const dur = 0.9;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + dur);

  gain.gain.setValueAtTime(0.6, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.01);

  // Fading high-pass noise layer
  const noiseBuf = makeNoiseBuffer(ctx, dur + 0.05);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2000;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.25, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.6);

  noise.connect(hp);
  hp.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);
  noise.stop(now + dur + 0.05);
}
