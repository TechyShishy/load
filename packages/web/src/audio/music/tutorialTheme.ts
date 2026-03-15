import { noteFreq } from './utils.js';
import { makeNoiseBuffer } from '../sounds/utils.js';

const LOOK_AHEAD = 0.15; // seconds: schedule notes this far ahead
const TICK_MS = 75; // ms: how often the scheduler runs

// ── Track parameters ────────────────────────────────────────────────────────
// Name:    First Packet
// Key:     G Dorian  (G  A  Bb  C  D  E  F)
// Mood:    Warm, inviting, with a subtle groove — "settle in, this is fun"
// BPM:     110 — upbeat and encouraging, keeps the tutorial moving
// Layers:  bass (sawtooth), pad (detuned sawtooth), lead melody (triangle + vibrato),
//          kick (beats 1 & 3), hi-hat (every 8th note)
// Pattern: 64 beats (16 bars × 4 beats) ≈ 35 seconds per loop
//
// Chord progression (16 beats = 4 bars each):
//   Sec A (steps  0–15): Gm   — G2  bass, chord G3 Bb3 D4
//   Sec B (steps 16–31): Cmaj — C3  bass, chord C3 E4  G4
//   Sec C (steps 32–47): Dm   — D3  bass, chord D3 F4  A4
//   Sec D (steps 48–63): Fmaj → Gm cadence: F2 bass for 8 beats, G2 for 8 beats

const BPM = 110;
const BEAT = 60 / BPM; // 0.625 s per beat
const STEPS = 64;
const HAT_DENSITY = 1 as const; // fire a hat on every step — accent logic in scheduleHat differentiates beats 1&3 from 2&4

export const LOOP_BEATS = STEPS;
export const BEAT_DURATION_SEC = BEAT;

// ── Patterns (64 entries; null = rest) ──────────────────────────────────────
//
// Index formula: (bar - 1) * 4 + (beat - 1)   [bar 1–16, beat 1–4]
//
// Bass MIDI: G2=43, Bb2=46, C3=48, D3=50, F2=41
//
// Syncopated figure: root on beat 1, rest on beat 2, 5th on beat 3, rest on beat 4.
// Slight variation in section D to propel back to the Gm resolution.

const BASS_PATTERN: (number | null)[] = [
  //       Beat:  1     2     3     4
  /* Bar  1 */  43, null,   50, null,  // Gm:  G2, D3
  /* Bar  2 */  43, null, null,   50,  // syncopation on beat 4
  /* Bar  3 */  43, null,   50, null,
  /* Bar  4 */  46, null,   43, null,  // Bb2 passing, back to G2

  /* Bar  5 */  48, null,   55, null,  // Cmaj: C3, G3
  /* Bar  6 */  48, null, null,   55,
  /* Bar  7 */  48, null,   55, null,
  /* Bar  8 */  48, null,   52, null,  // E3(52) — chromatic passing tone leading into Dm root

  /* Bar  9 */  50, null,   57, null,  // Dm:  D3, A3
  /* Bar 10 */  50, null, null,   57,
  /* Bar 11 */  50, null,   57, null,
  /* Bar 12 */  50, null,   53, null,  // F3 passing tone

  /* Bar 13 */  41, null,   48, null,  // Fmaj: F2, C3
  /* Bar 14 */  41, null, null,   48,
  /* Bar 15 */  43, null,   50, null,  // back to G2 — cadence begins
  /* Bar 16 */  43, null,   46, null,  // Bb2 — final push back to loop top
];

// Melody MIDI numbers (G Dorian scale, upper register for presence):
//   G4=67, A4=69, Bb4=70, C5=72, D5=74, E5=76, F5=77
//
// Structure:
//   Sec A (bars 1–4):   Rising question phrase — ends on D5, leaves anticipation.
//   Sec B (bars 5–8):   Answer phrase — descends from C5 to G4, exhales.
//   Sec C (bars 9–12):  Contrast — higher register, more active, rises to E5.
//   Sec D (bars 13–16): Resolution — peak at E5 then steps home: D5→C5→Bb4→A4→G4.

const MELODY_PATTERN: (number | null)[] = [
  //       Beat:  1     2     3     4
  /* Bar  1 */null, null,   67, null,  // G4 — first note, gentle start
  /* Bar  2 */  69, null, null,   70,  // A4 … Bb4
  /* Bar  3 */null,   72, null, null,  // C5 — rising
  /* Bar  4 */  74, null, null, null,  // D5 — question hangs

  /* Bar  5 */null, null,   72, null,  // C5 — answer opens
  /* Bar  6 */  70, null, null,   69,  // Bb4 … A4 — stepwise descent
  /* Bar  7 */null,   67, null, null,  // G4 — arrives home
  /* Bar  8 */null, null,   69, null,  // A4 — breath before section C

  /* Bar  9 */  72, null, null,   74,  // C5 ... D5 — lift
  /* Bar 10 */  74, null,   76, null,  // D5, E5 — peak arriving
  /* Bar 11 */  76, null, null,   74,  // E5 ... D5 — peak held, slight pull back
  /* Bar 12 */  72, null,   70, null,  // C5, Bb4 — descent begins

  /* Bar 13 */  74, null, null,   72,  // D5 ... C5 — resolving
  /* Bar 14 */  70, null,   69, null,  // Bb4, A4 — stepwise
  /* Bar 15 */  67, null, null,   70,  // G4 home, Bb4 push
  /* Bar 16 */  69, null, null, null,  // A4 — single note, clean before loop
];

// Pad chord notes (MIDI) keyed by step index — fires once at each section boundary.
// Chord sustains for 16 beats (one full section).
//
//   Gm   = G3(55), Bb3(58), D4(62)
//   Cmaj = C3(48), E4(64),  G4(67)
//   Dm   = D3(50), F4(65),  A4(69)
//   Fmaj = F3(53), A4(69),  C5(72)
const PAD_CHORDS: Partial<Record<number, number[]>> = {
   0: [55, 58, 62],       // Gm
  16: [48, 64, 67],       // Cmaj
  32: [50, 65, 69],       // Dm
  48: [53, 69, 72],       // Fmaj
};
const PAD_OVERLAP = 0.4;  // s: slow-release tail bleeds across section boundary

// Kick: beats 1 and 3 in every bar.
// (step % 4 === 0 || step % 4 === 2) encodes this; explicit array for clarity.
const KICK_PATTERN = (() => {
  const arr: boolean[] = [];
  for (let i = 0; i < STEPS; i++) {
    arr.push(i % 4 === 0 || i % 4 === 2);
  }
  return arr;
})();

// ── Instrument functions ─────────────────────────────────────────────────────

function scheduleBass(
  ctx: BaseAudioContext,
  music: GainNode,
  midi: number,
  t: number,
): void {
  const dur = BEAT * 1.6; // slightly longer than a beat — blurs into next note warmly
  const osc = ctx.createOscillator();
  const filt = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(noteFreq(midi), t);

  filt.type = 'lowpass';
  filt.frequency.value = 220;
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

function scheduleMelody(
  ctx: BaseAudioContext,
  music: GainNode,
  midi: number,
  t: number,
): void {
  // Sustained notes: each melody note lasts almost a full beat so lines flow
  // naturally across the bar without sounding staccato.
  const dur = BEAT * 0.88;
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(noteFreq(midi), t);

  // Vibrato: 5.5 Hz at ±4 Hz — adds warmth without sounding wobbly
  lfo.type = 'sine';
  lfo.frequency.value = 5.5;
  lfoGain.gain.value = 4;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.26, t + 0.02);
  gain.gain.setValueAtTime(0.26, t + dur - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain);
  gain.connect(music);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + dur + 0.02);
  lfo.stop(t + dur + 0.02);
}

// Pad: 3 detuned sawtooth oscillators per chord tone, slow swell to fill the space.
// Called once per section boundary; dur = 16 beats + PAD_OVERLAP.
function schedulePad(
  ctx: BaseAudioContext,
  music: GainNode,
  notes: number[],
  t: number,
  dur: number,
): void {
  const detunes = [-8, 0, 8];
  // Gain per oscillator: 9–12 incoherent OSCs stay manageable at 0.05
  const vol = 0.05;

  for (const midi of notes) {
    for (const detune of detunes) {
      const osc = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = noteFreq(midi);
      osc.detune.value = detune;

      filt.type = 'lowpass';
      filt.frequency.value = 800;
      filt.Q.value = 0.8;

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.3);  // slow attack — pad swells in
      gain.gain.setValueAtTime(vol, t + dur - 0.4);
      gain.gain.linearRampToValueAtTime(0, t + dur);    // slow release at tail

      osc.connect(filt);
      filt.connect(gain);
      gain.connect(music);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }
}

function scheduleKick(ctx: BaseAudioContext, music: GainNode, t: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 0.06);

  gain.gain.setValueAtTime(0.38, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

  osc.connect(gain);
  gain.connect(music);
  osc.start(t);
  osc.stop(t + 0.1);
}

function scheduleHat(
  ctx: BaseAudioContext,
  music: GainNode,
  t: number,
  step: number,
): void {
  const buf = makeNoiseBuffer(ctx, 0.04);

  const noise = ctx.createBufferSource();
  noise.buffer = buf;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;

  const gain = ctx.createGain();
  // Slight accent on beats 1 and 3 (step % 4 === 0 or 2) for a natural "1 and 3" feel
  const isDownbeat = step % 4 === 0 || step % 4 === 2;
  gain.gain.setValueAtTime(isDownbeat ? 0.17 : 0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

  noise.connect(hp);
  hp.connect(gain);
  gain.connect(music);
  noise.start(t);
  noise.stop(t + 0.04);
}

// ── Scheduler ────────────────────────────────────────────────────────────────

// loopEnd caps pad duration so the last section fades to silence at the loop
// boundary. Pass Infinity for the live scheduler (no capping needed).
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
  const melodyMidi = MELODY_PATTERN[step];
  if (melodyMidi !== null && melodyMidi !== undefined) {
    scheduleMelody(ctx, music, melodyMidi, t);
  }

  // ── Kick ──────────────────────────────────────────────────────────────
  if (KICK_PATTERN[step] === true) {
    scheduleKick(ctx, music, t);
  }

  // ── Hi-hat (every 8th note — every other step) ────────────────────────
  if (step % HAT_DENSITY === 0) {
    scheduleHat(ctx, music, t, step);
  }

  // ── Pad (fires once per section boundary) ─────────────────────────────
  if (step % 16 === 0) {
    const chord = PAD_CHORDS[step];
    if (chord !== undefined) {
      const padDur = Math.min(16 * BEAT + PAD_OVERLAP, loopEnd - t);
      schedulePad(ctx, music, chord, t, padDur);
    }
  }
}

/**
 * Synchronously schedules one full loop cycle on a BaseAudioContext.
 * Intended for use with OfflineAudioContext during pre-rendering.
 */
export function scheduleFullLoop(ctx: BaseAudioContext, music: GainNode): void {
  const loopEnd = STEPS * BEAT;
  for (let step = 0; step < STEPS; step++) {
    scheduleStep(ctx, music, step, step * BEAT, loopEnd);
  }
}

/**
 * Starts the "First Packet" tutorial theme. Returns a stop function.
 * @param ctx   AudioContext — provided by SynthAudioManager
 * @param music Dedicated music GainNode routed to ctx.destination
 */
export function startTutorialTheme(ctx: AudioContext, music: GainNode): () => void {
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
