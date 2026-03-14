import { makeNoiseBuffer } from './utils.js';

/**
 * Victory fanfare: 6-note C-major stinger (C5–E5–G5–C6–G5–C6) with a
 * non-uniform rhythm (short-short-held·short-short-LONG). Three layers:
 * triangle melody, octave-down sine harmony, and high-pass noise (attack
 * burst + final shimmer). Total duration ≈ 2.4 s.
 */
export function playWin(ctx: AudioContext, master: GainNode): void {
  const now = ctx.currentTime;

  // [melody Hz, onset s, note dur s]
  const notes: Array<[number, number, number]> = [
    [523.25,  0.00, 0.20],  // C5  — short
    [659.25,  0.18, 0.20],  // E5  — short
    [783.99,  0.36, 0.32],  // G5  — held
    [1046.50, 0.64, 0.20],  // C6  — short
    [783.99,  0.82, 0.20],  // G5  — short
    [1046.50, 1.00, 1.40],  // C6  — LONG ring-out
  ];

  notes.forEach(([freq, onset, dur]) => {
    const t = now + onset;

    // Melody: triangle — warm, clear lead
    const melOsc = ctx.createOscillator();
    const melGain = ctx.createGain();
    melOsc.type = 'triangle';
    melOsc.frequency.setValueAtTime(freq, t);
    melGain.gain.setValueAtTime(0, t);
    melGain.gain.linearRampToValueAtTime(0.35, t + 0.010);
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

  // Short bright noise burst on the opening attack — punchy "ta-da!" hit
  const attackDur = 0.10;
  const atkBuf = makeNoiseBuffer(ctx, attackDur + 0.02);
  const atkNoise = ctx.createBufferSource();
  atkNoise.buffer = atkBuf;
  const atkHp = ctx.createBiquadFilter();
  atkHp.type = 'highpass';
  atkHp.frequency.value = 3500;
  const atkGain = ctx.createGain();
  atkGain.gain.setValueAtTime(0, now);
  atkGain.gain.linearRampToValueAtTime(0.14, now + 0.005);
  atkGain.gain.exponentialRampToValueAtTime(0.001, now + attackDur);
  atkNoise.connect(atkHp);
  atkHp.connect(atkGain);
  atkGain.connect(master);
  atkNoise.start(now);
  atkNoise.stop(now + attackDur + 0.02);

  // Sparkle shimmer on the final note — high-pass noise that fades out with it
  const shimStart = now + 1.00;
  const shimDur = 1.35;
  const shimBuf = makeNoiseBuffer(ctx, shimDur + 0.05);
  const shimNoise = ctx.createBufferSource();
  shimNoise.buffer = shimBuf;
  const shimHp = ctx.createBiquadFilter();
  shimHp.type = 'highpass';
  shimHp.frequency.value = 5000;
  const shimGain = ctx.createGain();
  shimGain.gain.setValueAtTime(0, shimStart);
  shimGain.gain.linearRampToValueAtTime(0.10, shimStart + 0.04);
  shimGain.gain.exponentialRampToValueAtTime(0.001, shimStart + shimDur);
  shimNoise.connect(shimHp);
  shimHp.connect(shimGain);
  shimGain.connect(master);
  shimNoise.start(shimStart);
  shimNoise.stop(shimStart + shimDur + 0.05);
}
