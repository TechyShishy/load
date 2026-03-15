import { noteFreq } from './utils.js';

const LOOK_AHEAD = 0.15; // seconds: schedule notes this far ahead
const TICK_MS = 75; // ms: how often the scheduler runs

// ── Track parameters ────────────────────────────────────────────────────────
// Key: A Natural Minor (A B C D E F G)
// Mood: Still, contemplative — city lights from a quiet office late at night.
// 64 beats = 16 bars × 4 beats ≈ 53 seconds per loop

const BPM = 72;
const BEAT = 60 / BPM; // 0.8333 s
const STEPS = 64;
const PAD_OVERLAP = 0.5; // s: each chord bleeds past its section boundary into the next attack

export const LOOP_BEATS = STEPS;
export const BEAT_DURATION_SEC = BEAT;

// ── Patterns (64 entries each; null = rest) ──────────────────────────────────
//
// Index formula: (bar - 1) * 4 + (beat - 1)   [bar 1-16, beat 1-4]
//
// Bass MIDI numbers: A2=45, E2=40, F2=41, C3=48, G2=43, D3=50
// Melody MIDI numbers: D4=62, E4=64, F4=65, G4=67, A4=69, B4=71, C5=72, D5=74
//
// Sections (16 beats each):
//   A (bars  1–4):  Am  chord — A3, C4, E4
//   B (bars  5–8):  Fmaj7   — F3, A3, C4, E4
//   C (bars  9–12): G       — G3, B3, D4
//   D (bars 13–16): Am  chord — A3, C4, E4

const BASS_PATTERN: (number | null)[] = [
  //        Beat:  1     2     3     4
  /* Bar  1 */  45, null, null, null,
  /* Bar  2 */null, null,   45, null,
  /* Bar  3 */  45, null, null, null,
  /* Bar  4 */null, null,   40, null,
  /* Bar  5 */  41, null, null, null,
  /* Bar  6 */null, null,   41, null,
  /* Bar  7 */  41, null, null, null,
  /* Bar  8 */null,   48, null, null,
  /* Bar  9 */  43, null, null, null,
  /* Bar 10 */null, null,   43, null,
  /* Bar 11 */  43, null, null, null,
  /* Bar 12 */null,   50, null, null,
  /* Bar 13 */  45, null, null, null,
  /* Bar 14 */null, null,   45, null,
  /* Bar 15 */  45, null,   40, null,
  /* Bar 16 */  45, null, null, null,
];

const MELODY_PATTERN: (number | null)[] = [
  //        Beat:  1     2     3     4
  /* Bar  1 */null, null, null, null,
  /* Bar  2 */  72, null, null, null, // C5 — motif begins
  /* Bar  3 */null,   69, null, null, // A4 — motif answers
  /* Bar  4 */null, null, null, null,
  /* Bar  5 */null, null, null, null,
  /* Bar  6 */  72, null, null, null, // C5 — motif echoed over Fmaj7
  /* Bar  7 */null,   69, null, null, // A4 — answered same way
  /* Bar  8 */  65, null, null, null, // F4 — F answers over F chord
  // ── Dense section: note roughly every beat ─────────────────────────────────
  /* Bar  9 */  67, null,   74, null, // G4, D5 — announces the shift (sparse → active)
  /* Bar 10 */  74, null,   71, null, // D5, B4 — descending, every 2 beats
  /* Bar 11 */  67, null,   72, null, // G4, C5 — ascending, every 2 beats
  /* Bar 12 */  74, null,   71, null, // D5, B4 — peak, every 2 beats
  /* Bar 13 */  69, null,   64, null, // A4, E4 — descending, every 2 beats
  /* Bar 14 */  64, null,   67, null, // E4, G4 — ascending, every 2 beats
  /* Bar 15 */  72, null,   69, null, // C5, A4 — descent from peak, every 2 beats
  /* Bar 16 */  64, null, null,   69, // E4, A4 — sparse landing before loop
];

// Kick pattern: true = fire a soft kick on that step.
// Only active during the dense section (bars 9–16 = steps 32–63).
// Beats 1 and 3 of each bar; stays out of the quiet opening 8 bars.
const KICK_PATTERN: boolean[] = [
  // Bars 1–8 (steps 0–31): silent
  false, false, false, false, // Bar 1
  false, false, false, false, // Bar 2
  false, false, false, false, // Bar 3
  false, false, false, false, // Bar 4
  false, false, false, false, // Bar 5
  false, false, false, false, // Bar 6
  false, false, false, false, // Bar 7
  false, false, false, false, // Bar 8
  // Bars 9–16 (steps 32–63): kick on beats 1 and 3
   true, false,  true, false, // Bar 9
   true, false,  true, false, // Bar 10
   true, false,  true, false, // Bar 11
   true, false,  true, false, // Bar 12
   true, false,  true, false, // Bar 13
   true, false,  true, false, // Bar 14
   true, false,  true, false, // Bar 15
   true, false,  true, false, // Bar 16
];

// Pad chord notes (MIDI) keyed by the step index where the section starts.
// Each chord sustains for 16 beats (one full section).
//
//   Am   = A3(57), C4(60), E4(64)
//   Fmaj7= F3(53), A3(57), C4(60), E4(64)  — major 7th adds airy shimmer
//   G    = G3(55), B3(59), D4(62)
const PAD_CHORDS: Partial<Record<number, number[]>> = {
  0:  [57, 60, 64],
  16: [53, 57, 60, 64],
  32: [55, 59, 62],
  48: [57, 60, 64],
};

// ── Instrument functions ─────────────────────────────────────────────────────

function scheduleBass(ctx: BaseAudioContext, music: GainNode, midi: number, t: number): void {
  const dur = BEAT * 1.5;
  const osc = ctx.createOscillator();
  const filt = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(noteFreq(midi), t);

  filt.type = 'lowpass';
  filt.frequency.value = 200;
  filt.Q.value = 2;

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.30, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(filt);
  filt.connect(gain);
  gain.connect(music);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// dur is caller-supplied: sparse steps use BEAT * 1.8 for the long sustain;
// dense steps use BEAT * 0.75 so each note articulates cleanly at 72 BPM.
function scheduleMelody(ctx: BaseAudioContext, music: GainNode, midi: number, t: number, dur: number): void {
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(noteFreq(midi), t);

  // Gentle vibrato: 5 Hz, ±2.5 Hz deviation (≈±10 cents at concert pitch)
  lfo.type = 'sine';
  lfo.frequency.value = 5;
  lfoGain.gain.value = 2.5;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.22, t + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain);
  gain.connect(music);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + dur + 0.02);
  lfo.stop(t + dur + 0.02);
}

// Soft kick drum: sine frequency-drop transient. Gentle enough not to
// overpower the mood — just enough to lock the pulse during the dense section.
function scheduleKick(ctx: BaseAudioContext, music: GainNode, t: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(70, t);
  osc.frequency.exponentialRampToValueAtTime(28, t + 0.07);

  gain.gain.setValueAtTime(0.35, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

  osc.connect(gain);
  gain.connect(music);
  osc.start(t);
  osc.stop(t + 0.1);
}

// Pads: schedule each chord tone with 3 detuned oscillators for warmth.
// Called once per section boundary; dur = 16 beats.
function schedulePad(ctx: BaseAudioContext, music: GainNode, notes: number[], t: number, dur: number): void {
  const detunes = [-8, 0, 8]; // ±8 cent spread
  const vol = 0.055; // per-oscillator; incoherent sum of 9-12 OSCs stays reasonable

  for (const midi of notes) {
    for (const detune of detunes) {
      const osc = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = noteFreq(midi);
      osc.detune.value = detune;

      filt.type = 'lowpass';
      filt.frequency.value = 900;
      filt.Q.value = 0.7;

      // Slow attack (0.4 s) and release (0.5 s) — audible swell at each chord change
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.4);
      gain.gain.setValueAtTime(vol, t + dur - 0.5);
      gain.gain.linearRampToValueAtTime(0, t + dur);

      osc.connect(filt);
      filt.connect(gain);
      gain.connect(music);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }
}

// ── Scheduler ────────────────────────────────────────────────────────────────

// loopEnd is used to cap pad duration so the last section fades to silence
// at exactly the buffer boundary (clean loop point for pre-rendered playback).
// Pass Infinity for the live scheduler (no capping needed).
function scheduleStep(
  ctx: BaseAudioContext,
  music: GainNode,
  step: number,
  t: number,
  loopEnd: number,
): void {
  // ── Bass ──────────────────────────────────────────────────────────────
  const bassMidi = BASS_PATTERN[step];
  if (bassMidi !== null && bassMidi !== undefined) {
    scheduleBass(ctx, music, bassMidi, t);
  }

  // ── Melody ────────────────────────────────────────────────────────────
  // Active section (bars 9–16 = steps 32–63): notes every 2 beats, sustain fills ~1.5 beats;
  // sparse opening: long sustain so notes bloom and linger.
  // Cap by loopEnd - t so the last melody note doesn't extend past the buffer
  // boundary (which would cause a waveform discontinuity at the loop point).
  const melodyDur = Math.min(step >= 32 ? BEAT * 1.5 : BEAT * 1.8, loopEnd - t);
  const melodyMidi = MELODY_PATTERN[step];
  if (melodyMidi !== null && melodyMidi !== undefined) {
    scheduleMelody(ctx, music, melodyMidi, t, melodyDur);
  }

  // ── Kick ──────────────────────────────────────────────────────────────
  if (KICK_PATTERN[step] === true) {
    scheduleKick(ctx, music, t);
  }

  // ── Pad (fires once per section, at the boundary step) ────────────────
  if (step % 16 === 0) {
    const chord = PAD_CHORDS[step];
    if (chord !== undefined) {
      // Cap pad duration so it doesn't extend past the loop boundary.
      const padDur = Math.min(16 * BEAT + PAD_OVERLAP, loopEnd - t);
      schedulePad(ctx, music, chord, t, padDur);
    }
  }
}

/**
 * Synchronously schedules one full loop cycle on a BaseAudioContext.
 * Intended for use with OfflineAudioContext during pre-rendering.
 * All STEPS beats are scheduled at t=0, t=BEAT, t=2*BEAT, …
 */
export function scheduleFullLoop(ctx: BaseAudioContext, music: GainNode): void {
  const loopEnd = STEPS * BEAT;
  for (let step = 0; step < STEPS; step++) {
    scheduleStep(ctx, music, step, step * BEAT, loopEnd);
  }
}

/**
 * Starts the Nocturne title-screen track. Returns a stop function.
 * @param ctx   AudioContext — provided by SynthAudioManager
 * @param music Dedicated music GainNode routed to ctx.destination
 */
export function startTitleTheme(ctx: AudioContext, music: GainNode): () => void {
  let currentStep = 0;
  let nextNoteTime = ctx.currentTime + 0.05;

  const timerId = setInterval(() => {
    while (nextNoteTime < ctx.currentTime + LOOK_AHEAD) {
      scheduleStep(ctx, music, currentStep % STEPS, nextNoteTime, Infinity);
      nextNoteTime += BEAT;
      currentStep++;
    }
  }, TICK_MS);

  return (): void => {
    clearInterval(timerId);
    // Already-scheduled notes play to natural completion.
    // The GainNodes and OscillatorNodes are self-stopping via osc.stop().
  };
}
