import { makeNoiseBuffer } from './utils.js';

/**
 * Defeat stinger: 6-note descending C-major arpeggio (C5→G4→E4→C4→G3→C3)
 * mirroring the win fanfare's rhythm (short-short-held·short-short-LONG).
 * Two layers per note: sine melody + octave-down sine harmony.
 * Final note anchored with a low-pass noise decay — heavy, settling feel.
 * Total duration ≈ 2.4 s.
 */
export function playLose(ctx: AudioContext, master: GainNode): void {
  const now = ctx.currentTime;

  // [melody Hz, onset s, note dur s]
  const notes: Array<[number, number, number]> = [
    [523.25,  0.00, 0.20],  // C5 — short
    [392.00,  0.18, 0.20],  // G4 — short
    [329.63,  0.36, 0.32],  // E4 — held
    [261.63,  0.64, 0.20],  // C4 — short
    [196.00,  0.82, 0.20],  // G3 — short
    [130.81,  1.00, 1.40],  // C3 — LONG ring-out
  ];

  notes.forEach(([freq, onset, dur]) => {
    const t = now + onset;

    // Melody: sine — pure, mournful, no harmonic brightness
    const melOsc = ctx.createOscillator();
    const melGain = ctx.createGain();
    melOsc.type = 'sine';
    melOsc.frequency.setValueAtTime(freq, t);
    melGain.gain.setValueAtTime(0, t);
    melGain.gain.linearRampToValueAtTime(0.45, t + 0.010);
    melGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    melOsc.connect(melGain);
    melGain.connect(master);
    melOsc.start(t);
    melOsc.stop(t + dur + 0.01);

    // Harmony: sine one octave down — adds body without muddiness
    const harmOsc = ctx.createOscillator();
    const harmGain = ctx.createGain();
    harmOsc.type = 'sine';
    harmOsc.frequency.setValueAtTime(freq * 0.5, t);
    harmGain.gain.setValueAtTime(0, t);
    harmGain.gain.linearRampToValueAtTime(0.20, t + 0.015);
    harmGain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.85);
    harmOsc.connect(harmGain);
    harmGain.connect(master);
    harmOsc.start(t);
    harmOsc.stop(t + dur + 0.01);
  });

  // Low-pass noise settling on the final note — warm, heavy "thud" fade-out
  const thumStart = now + 1.00;
  const thumDur = 1.35;
  const thumBuf = makeNoiseBuffer(ctx, thumDur + 0.05);
  const thumNoise = ctx.createBufferSource();
  thumNoise.buffer = thumBuf;
  const thumLp = ctx.createBiquadFilter();
  thumLp.type = 'lowpass';
  thumLp.frequency.value = 400;
  const thumGain = ctx.createGain();
  thumGain.gain.setValueAtTime(0, thumStart);
  thumGain.gain.linearRampToValueAtTime(0.12, thumStart + 0.04);
  thumGain.gain.exponentialRampToValueAtTime(0.001, thumStart + thumDur);
  thumNoise.connect(thumLp);
  thumLp.connect(thumGain);
  thumGain.connect(master);
  thumNoise.start(thumStart);
  thumNoise.stop(thumStart + thumDur + 0.05);
}
