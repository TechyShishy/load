import { noteFreq } from './utils.js';
import { makeNoiseBuffer } from '../sounds/utils.js';

const LOOK_AHEAD = 0.15; // seconds: schedule notes this far ahead
const TICK_MS = 75; // ms: how often the scheduler runs

// ── Track parameters ────────────────────────────────────────────────────────
// Name:    Noir Circuit
// Key:     A Natural Minor  (A  B  C  D  E  F  G)
// Mood:    Dark, tense, deliberate — "you agreed to this; now deliver"
// BPM:     96 — urgent but controlled
// Layers:  walking bass (sawtooth), angular lead (triangle), pad (detuned sawtooth),
//          kick (beat 1 only), hi-hat (every beat)
// Pattern: 64 beats (16 bars × 4 beats) ≈ 43 seconds per loop
//
// Chord progression (16 beats = 4 bars each):
//   Sec A (steps  0–15): Am   — A2 bass, chord A3 C4 E4
//   Sec B (steps 16–31): Dm   — D3 bass, chord D3 F4 A4
//   Sec C (steps 32–47): Em   — E3 bass, chord E3 G4 B4
//   Sec D (steps 48–63): Am   — A2 bass, returns to root

const BPM = 96;
const BEAT = 60 / BPM; // 0.625 s per beat
const STEPS = 64;

// ── Patterns (64 entries; null = rest) ──────────────────────────────────────
//
// Index formula: (bar - 1) * 4 + (beat - 1)   [bar 1–16, beat 1–4]
//
// Bass MIDI: A1=33, G1=31, E2=40, G2=43, D2=38, A2=45, F2=41, B2=47
//
// Walking figure: root on beat 1, rest on beat 2, 5th or colour note on beat 3,
// syncopated passing tone on beat 4 in alternate bars to propel the line forward.

const BASS_PATTERN: (number | null)[] = [
  //        Beat:  1     2     3     4
  /* Bar  1 */  33, null,   40, null,  // Am:  A1, E2
  /* Bar  2 */  33, null, null,   43,  //      A1, G2 on beat 4 — syncopation
  /* Bar  3 */  33, null,   40, null,
  /* Bar  4 */  31, null,   33, null,  //      G1 → A1 — cadential push back to root

  /* Bar  5 */  38, null,   45, null,  // Dm:  D2, A2
  /* Bar  6 */  38, null, null,   45,  //      D2, A2 syncopated
  /* Bar  7 */  38, null,   41, null,  //      D2, F2 — colour tone
  /* Bar  8 */  40, null,   38, null,  //      E2 (V passing) → D2 turnaround

  /* Bar  9 */  40, null,   47, null,  // Em:  E2, B2
  /* Bar 10 */  40, null, null,   47,  //      E2, B2 syncopated
  /* Bar 11 */  40, null,   43, null,  //      E2, G2
  /* Bar 12 */  41, null,   40, null,  //      F2 (chromatic) → E2 — tension before D

  /* Bar 13 */  33, null,   40, null,  // Am:  return A1, E2
  /* Bar 14 */  33, null, null,   43,  //      A1, G2 syncopated
  /* Bar 15 */  31, null,   33, null,  //      G1 → A1 leading
  /* Bar 16 */  33, null, null, null,  //      A1 landing — clean close before loop
];

// Melody MIDI (A Natural Minor, mid register):
//   E3=52, F3=53, G3=55, A3=57, B3=59, C4=60
//
// Approach: sparse (~20% density), wide leaps, syncopated entries, lots of silence.
// Each note is a statement. Absence of melody lets the bass dominate.
//
//   Sec A (bars 1–4):   Absent entirely — bass establishes the darkness.
//                       A3 enters on beat 2 of bar 2, a lone figure.
//   Sec B (bars 5–8):   G3 and F3 drift over Dm; E3 arrives late on beat 4.
//   Sec C (bars 9–12):  B3 peak (Em leading tone), stepwise descent F3→E3.
//   Sec D (bars 13–16): Climactic C4 then A3→G3 descent, silence before loop.

const MELODY_PATTERN: (number | null)[] = [
  //        Beat:  1     2     3     4
  /* Bar  1 */null, null, null, null,  // silence
  /* Bar  2 */null,   57, null, null,  // A3 — off the beat, lone arrival
  /* Bar  3 */null, null,   52, null,  // E3 — wide descending leap (m6 down)
  /* Bar  4 */null, null, null, null,  // rest — noir breath

  /* Bar  5 */null, null,   55, null,  // G3 — over Dm, colour note
  /* Bar  6 */null,   53, null, null,  // F3 — stepwise down
  /* Bar  7 */null, null, null,   52,  // E3 — syncopated beat 4
  /* Bar  8 */null, null, null, null,  // rest

  /* Bar  9 */null, null,   59, null,  // B3 — Em leading tone, peak
  /* Bar 10 */null,   57, null, null,  // A3 — step down
  /* Bar 11 */null, null,   53, null,  // F3 — skip down, darker colour
  /* Bar 12 */  52, null, null, null,  // E3 — root of Em chord

  /* Bar 13 */null, null, null, null,  // breathe
  /* Bar 14 */null,   60, null, null,  // C4 — climactic leap up
  /* Bar 15 */null, null,   57, null,  // A3 — step down
  /* Bar 16 */  55, null, null, null,  // G3 — m7, leaves tension before loop
];

// Pad chord notes (MIDI) keyed by step index — fires once per section boundary.
// Chord sustains for 16 beats (one full section).
//
//   Am   = A3(57), C4(60), E4(64)
//   Dm   = D3(50), F4(65), A4(69)
//   Em   = E3(52), G4(67), B4(71)
//   Am   = A3(57), C4(60), E4(64)
const PAD_CHORDS: Partial<Record<number, number[]>> = {
   0: [57, 60, 64],  // Am
  16: [50, 65, 69],  // Dm
  32: [52, 67, 71],  // Em
  48: [57, 60, 64],  // Am
};
const PAD_OVERLAP = 0.4; // s: slow-release tail bleeds across section boundary

// Kick: beat 1 only (step % 4 === 0). One hit per bar — asymmetric, deliberate.
// Staying off beats 2–4 keeps the low end from competing with the walking bass.
const KICK_PATTERN = (() => {
  const arr: boolean[] = [];
  for (let i = 0; i < STEPS; i++) {
    arr.push(i % 4 === 0);
  }
  return arr;
})();

// ── Instrument functions ─────────────────────────────────────────────────────

function scheduleBass(
  ctx: AudioContext,
  music: GainNode,
  midi: number,
  t: number,
): void {
  const dur = BEAT * 1.7; // slightly longer than a beat — notes bleed for warmth
  const osc = ctx.createOscillator();
  const filt = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(noteFreq(midi), t);

  // Lower cutoff and higher Q than tutorialTheme — growlier, heavier
  filt.type = 'lowpass';
  filt.frequency.value = 180;
  filt.Q.value = 3;

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.32, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(filt);
  filt.connect(gain);
  gain.connect(music);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function scheduleMelody(
  ctx: AudioContext,
  music: GainNode,
  midi: number,
  t: number,
): void {
  // Staccato relative to tutorialTheme (0.65 vs 0.88) — each note is a statement.
  const dur = BEAT * 0.65;
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(noteFreq(midi), t);

  // Restrained vibrato — ±3 Hz, subdued compared to tutorialTheme
  lfo.type = 'sine';
  lfo.frequency.value = 5;
  lfoGain.gain.value = 3;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.30, t + 0.02);
  gain.gain.setValueAtTime(0.30, t + dur - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain);
  gain.connect(music);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + dur + 0.02);
  lfo.stop(t + dur + 0.02);
}

function schedulePad(
  ctx: AudioContext,
  music: GainNode,
  notes: number[],
  t: number,
  dur: number,
): void {
  const detunes = [-8, 0, 8];
  const vol = 0.05;

  for (const midi of notes) {
    for (const detune of detunes) {
      const osc = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = noteFreq(midi);
      osc.detune.value = detune;

      // Slightly darker than tutorialTheme (700 vs 800) to keep it below the melody
      filt.type = 'lowpass';
      filt.frequency.value = 700;
      filt.Q.value = 0.9;

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.4);   // slow swell
      gain.gain.setValueAtTime(vol, t + dur - 0.5);
      gain.gain.linearRampToValueAtTime(0, t + dur);     // slow fade

      osc.connect(filt);
      filt.connect(gain);
      gain.connect(music);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }
}

function scheduleKick(ctx: AudioContext, music: GainNode, t: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 0.06);

  gain.gain.setValueAtTime(0.40, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

  osc.connect(gain);
  gain.connect(music);
  osc.start(t);
  osc.stop(t + 0.1);
}

function scheduleHat(
  ctx: AudioContext,
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
  // Slight accent on off-beats (even steps 2 & 4) for a subtle pushing pulse.
  // Inverted from tutorialTheme — supports the asymmetric kick-on-1 signature.
  const isOffbeat = step % 2 === 1;
  gain.gain.setValueAtTime(isOffbeat ? 0.15 : 0.10, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

  noise.connect(hp);
  hp.connect(gain);
  gain.connect(music);
  noise.start(t);
  noise.stop(t + 0.04);
}

// ── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Starts the "Noir Circuit" standard-contract theme. Returns a stop function.
 * @param ctx   AudioContext — provided by SynthAudioManager
 * @param music Dedicated music GainNode routed to ctx.destination
 */
export function startContractTheme(ctx: AudioContext, music: GainNode): () => void {
  let currentStep = 0;
  let nextNoteTime = ctx.currentTime + 0.05;

  function scheduleStep(step: number, t: number): void {
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

    // ── Hi-hat (every beat) ───────────────────────────────────────────────
    scheduleHat(ctx, music, t, step);

    // ── Pad (fires once per section boundary) ─────────────────────────────
    if (step % 16 === 0) {
      const chord = PAD_CHORDS[step];
      if (chord !== undefined) {
        schedulePad(ctx, music, chord, t, 16 * BEAT + PAD_OVERLAP);
      }
    }
  }

  const timerId = setInterval(() => {
    while (nextNoteTime < ctx.currentTime + LOOK_AHEAD) {
      scheduleStep(currentStep % STEPS, nextNoteTime);
      nextNoteTime += BEAT;
      currentStep++;
    }
  }, TICK_MS);

  return (): void => {
    clearInterval(timerId);
    // Scheduled oscillators are self-stopping via their osc.stop() calls.
  };
}
