---
name: new-music
description: 'Add a new looping background music track to the Load game using only Web Audio API primitives. Target aesthetic: as realistic as possible — push every instrument toward the acoustic or electric original using envelope shaping, harmonic richness, timing humanization, and spatial simulation. No audio files; everything is synthesised. Use when the user asks to add background music for a game phase, screen, or mood.'
argument-hint: "Track name and game context, e.g. 'schedulingTheme – calm focus music for the scheduling phase' or 'crisisBed – tense ambient loop for the crisis phase'"
---

# New Music Track

Produces a looping background music track: a `music/<trackName>.ts` module using a look-ahead scheduler, registered on `IAudioManager` and `SynthAudioManager` via `startMusic` / `stopMusic`.

**Target aesthetic: as realistic as possible.** The constraint is no audio files — everything is synthesised from Web Audio API primitives. Within that constraint, push every instrument toward acoustic or electric realism: rich harmonics, natural-sounding envelopes, subtle timing and velocity variation, and spatial depth via delay and chorus. Music should sound composed and performed, not sequenced. Prior acceptable-limitations language is retired — thin timbre, mechanical timing, and flat dynamics are failures to fix, not acceptable tradeoffs.

## When to Use

- Adding a looping background track for a game phase (`scheduling`, `crisis`, title screen, win/lose screen)
- The game currently has no music for a context that needs one
- Extending an existing theme with a variation

## Not in Scope

- One-shot sound effects triggered by player actions → use the `new-sound` skill
- Reworking an existing track → use the `rework-music` skill

## Prerequisites

Read these files before starting:

- `packages/web/src/audio/AudioManager.ts` — `IAudioManager` interface
- `packages/web/src/audio/SynthAudioManager.ts` — active implementation
- `packages/web/src/audio/sounds/utils.ts` — `makeNoiseBuffer` helper
- Any existing file in `packages/web/src/audio/music/` (if the folder exists — scan first: `ls packages/web/src/audio/music/`)

The `new-sound` skill is the reference for all envelope, filter, LFO, and layer patterns used here. The key difference is that music uses a **look-ahead scheduler** to sequence timed notes across an infinite loop, rather than a single fire-and-forget function.

---

## Step 1 — Design the Track

Before writing any code, complete the brief:

| Field              | Description                                                                             |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Track ID**       | `camelCase` string key used in `startMusic(trackId)` — e.g. `schedulingTheme`           |
| **File name**      | `packages/web/src/audio/music/<trackId>.ts`                                             |
| **Context**        | Which game phase or screen plays this track?                                            |
| **Mood / intent**  | One sentence. What should the player feel?                                              |
| **Key**            | e.g. A minor, D Dorian, C major — pick something that fits the mood                     |
| **Tempo (BPM)**    | 60–140. Slower for ambient/tense, faster for action. 80–100 is a reliable middle ground |
| **Time signature** | 4/4 for almost everything; 3/4 or 6/8 if a waltz feel is intentional                    |
| **Pattern length** | Number of beats before the loop repeats. **32–64 beats is the recommended minimum** — enough to feel like a composed piece rather than a looping motif. 64 beats at 90 BPM ≈ 43 seconds. Use multiples of 16 for clean phrase structure (16 = phrase, 32 = section, 64 = two full sections). |
| **Layers**         | List each instrument layer with its role (see instrument catalogue below)               |

### Mood → aesthetic guide

| Phase / mood            | BPM range | Key character            | Recommended layers                                 |
| ----------------------- | --------- | ------------------------ | -------------------------------------------------- |
| Scheduling (calm focus) | 70–90     | Minor pentatonic, Dorian | Pad + bass + sparse melody                         |
| Crisis (tension)        | 100–120   | Minor, Phrygian          | Stab chords + bass + tight hi-hat + alarm-ish lead |
| Win (resolution)        | 90–110    | Major                    | Pad + bass + bright lead arpeggio                  |
| Lose (bleak)            | 50–70     | Minor, descending        | Slow pad only, no melody                           |
| Title / menu            | 80–100    | Dorian or natural minor  | Full 4-layer arrangement                           |

### Instrument layer catalogue

| Layer           | Sound source                                                                               | Character                     | Complexity               |
| --------------- | ------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------ |
| **Synth bass**      | Sawtooth → lowpass (fc ≈ 200 Hz, Q ≈ 2) → short ADSR                                                              | Warm, foundational                | Required for most tracks         |
| **Pad**             | 3–4 detuned triangle/sawtooth OSCs → lowpass (fc ≈ 800 Hz) → slow attack (0.2–0.4 s)                              | Lush, atmospheric                 | Harmonic bed (use sparingly — pervasive)     |
| **FM Rhodes**       | Sine carrier + sine modulator at 2× freq → decaying modulation depth → amplitude ADSR                              | Bell attack fading to warm tine   | Struck chords / harmonic events  |
| **Additive Organ**  | 4 sine partials at 1×/2×/3×/4× with drawbar weights → tremolo LFO (6.5 Hz, ±10%)                                  | Transparent, present              | Harmonic bed, no blur or swell   |
| **Lead melody**     | Triangle or sawtooth → subtle LFO vibrato (5–6 Hz, ±10 cents) → no filter or mild highpass                        | Clear, singable                   | One note at a time               |
| **Chord stab**      | 3-note chord, sawtooth, short decay (0.1–0.3 s)                                                                    | Rhythmic harmonic punctuation     | Optional                         |
| **Kick**            | Sine 80 Hz → exp pitch-drop to 30 Hz over 60 ms, gain decay over 80 ms                                             | Punchy low transient              | Optional                         |
| **Snare / rim**     | Short noise burst → bandpass (fc ≈ 800 Hz, Q ≈ 4) + quiet pitched component                                       | Crisp mid hit                     | Optional                         |
| **Hi-hat**          | Very short noise burst → highpass (fc ≈ 6 kHz) → 20–40 ms gain decay                                              | Air and rhythm                    | Optional                         |

**Maximum recommended layers:** 4–5. Every layer added beyond that requires careful gain management and likely blurs the mix.

---

## Step 2 — Music Theory Utilities

Create or extend `packages/web/src/audio/music/utils.ts` with helpers shared across tracks.

### Note → frequency

```ts
/** Returns the frequency in Hz for a MIDI-style note number (69 = A4 = 440 Hz). */
export function noteFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
```

MIDI note numbers for common octaves (C3=48, C4=60, C5=72):

| Note   | MIDI# | Hz (approx) |
| ------ | ----- | ----------- |
| C3     | 48    | 130.8       |
| D3     | 50    | 146.8       |
| E3     | 52    | 164.8       |
| F3     | 53    | 174.6       |
| G3     | 55    | 196.0       |
| A3     | 57    | 220.0       |
| **A4** | 69    | 440.0       |
| C4     | 60    | 261.6       |
| D4     | 62    | 293.7       |
| E4     | 64    | 329.6       |
| G4     | 67    | 392.0       |
| A4     | 69    | 440.0       |
| C5     | 72    | 523.3       |

### Scale helpers

```ts
/** Returns MIDI numbers for a scale starting at rootMidi. */
export function scale(rootMidi: number, intervals: number[]): number[] {
  return intervals.map((i) => rootMidi + i);
}

// Common interval sets
export const MINOR_PENTATONIC = [0, 3, 5, 7, 10];
export const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
export const DORIAN = [0, 2, 3, 5, 7, 9, 10];
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];

// Example: A minor pentatonic starting at A3 (MIDI 57)
// const aMiPent = scale(57, MINOR_PENTATONIC); → [57,60,62,64,67]
```

### Chord voicing helper

```ts
/**
 * Returns an array of MIDI numbers for a chord built from root + intervals.
 * Common voicings: minor=[0,3,7], major=[0,4,7], sus4=[0,5,7]
 */
export function chord(rootMidi: number, intervals: number[]): number[] {
  return intervals.map((i) => rootMidi + i);
}
```

---

## Step 3 — The Look-Ahead Scheduler

This is the engine every music track reuses. It runs on a `setInterval` timer and schedules Web Audio events just far enough ahead to cover the next scheduler tick, avoiding gaps without building up excessive future events.

```ts
const LOOK_AHEAD_SEC = 0.15; // schedule notes this far ahead of current time
const TICK_INTERVAL_MS = 75; // how often to run the scheduler (ms)
```

### How it works

1. Track a `nextNoteTime` (AudioContext time of the next note to schedule) and `currentStep` (index into the pattern).
2. Every tick: while `nextNoteTime < ctx.currentTime + LOOK_AHEAD_SEC`, call `scheduleStep(currentStep, nextNoteTime)` and advance.
3. `scheduleStep` fires all instrument note-scheduling functions for that step — they use the passed `time` as their anchor (`setValueAtTime(..., time)`, `osc.start(time)`, etc.) rather than `ctx.currentTime`.
4. When `stopMusic()` is called, clear the interval and allow already-scheduled events to play out naturally.

### Track file template

```ts
import { noteFreq } from './utils.js';

const LOOK_AHEAD = 0.15;
const TICK_MS    = 75;

/**
 * Starts the <TrackId> track. Returns a stop function.
 * @param ctx   AudioContext — provided by SynthAudioManager
 * @param music Dedicated music GainNode — separate from SFX master
 */
export function start<TrackId>(
  ctx: AudioContext,
  music: GainNode,
): () => void {
  const BPM = <N>;
  const BEAT = 60 / BPM;           // seconds per beat
  const STEPS = <N>;               // total beats before pattern repeats

  let currentStep = 0;
  let nextNoteTime = ctx.currentTime + 0.05;  // small startup offset

  // ── Define the patterns ──────────────────────────────────────────────────
  // Each pattern is an array of STEPS entries.
  // null = rest (no note played on this step).
  // 'SILENCE' sentinel = full-ensemble rest — used sparingly for emphasis (see composition notes).
  //
  // Example: 32-step bass pattern at A minor pentatonic root.
  // Formatted as four 8-beat phrases for readability.
  const BASS_PATTERN: (number | null)[] = [
    // Phrase A (bars 1–2)
    57, null, null, 57,   57, null, 60, null,
    // Phrase B (bars 3–4)
    57, null, null, 57,   null, 57, null, null,
    // Phrase C (bars 5–6) — harmonic shift, bass moves to iv
    53, null, null, 53,   55, null, 53, null,
    // Phrase D (bars 7–8) — return, builds back to root
    57, null, 60, null,   57, null, null, null,
  ];

  const MELODY_PATTERN: (number | null)[] = [
    // Phrase A
    null, null, 64, null,   null, 62, null, 60,
    // Phrase B — question phrase
    null, null, 62, null,   64, null, null, 67,
    // Phrase C — answer phrase, follows iv chord
    null, 65, null, 64,     null, 62, null, null,
    // Phrase D — climax and resolution
    67, null, 64, null,     62, null, 60, null,
  ];

  // ── Instrument scheduling functions ──────────────────────────────────────
  function scheduleBass(midi: number, t: number): void {
    const osc = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(noteFreq(midi - 12), t);  // one octave down from melody

    filt.type = 'lowpass';
    filt.frequency.value = 220;
    filt.Q.value = 2;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 0.8);

    osc.connect(filt); filt.connect(gain); gain.connect(music);
    osc.start(t);
    osc.stop(t + BEAT + 0.02);
  }

  function scheduleMelody(midi: number, t: number): void {
    const osc  = ctx.createOscillator();
    const lfo  = ctx.createOscillator();
    const lfoG = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(noteFreq(midi), t);

    lfo.type = 'sine';
    lfo.frequency.value = 5.5;
    lfoG.gain.value = 4;             // ±4 Hz vibrato
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 0.9);

    osc.connect(gain); gain.connect(music);
    osc.start(t); lfo.start(t);
    osc.stop(t + BEAT + 0.02);
    lfo.stop(t + BEAT + 0.02);
  }

  // ── Scheduler tick ────────────────────────────────────────────────────────
  function scheduleStep(step: number, t: number): void {
    const bassMidi = BASS_PATTERN[step];
    if (bassMidi !== null && bassMidi !== undefined) scheduleBass(bassMidi, t);

    const melodyMidi = MELODY_PATTERN[step];
    if (melodyMidi !== null && melodyMidi !== undefined) scheduleMelody(melodyMidi, t);

    // … call additional instrument functions here
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
    // Scheduled notes in the audio graph play to completion naturally.
    // Nothing extra needed — the GainNodes and OscillatorNodes are self-stopping.
  };
}
```

### Scheduler timing parameters

| Parameter    | Recommended value | Effect of changing                                                     |
| ------------ | ----------------- | ---------------------------------------------------------------------- |
| `LOOK_AHEAD` | 0.10–0.20 s       | Lower = tighter but risks gaps; higher = more delay before music stops |
| `TICK_MS`    | 50–100 ms         | Must satisfy `TICK_MS / 1000 < LOOK_AHEAD` to guarantee coverage       |
| Beat advance | `BEAT = 60 / BPM` | Total step duration; subdivide for 8th notes (`BEAT / 2`) etc.         |

For **8th-note resolution** (two steps per beat), keep `STEPS` count in step units but set the advance per step to `BEAT / 2`. Adjust pattern arrays accordingly.

---

## Step 4 — Instrument Design Templates

Each instrument is documented in its own reference file in `.github/skills/new-music/instruments/`. Read the file for every instrument you plan to use before implementing it in a track.

| Instrument | File | Role | Performance tier |
| ---------- | ---- | ---- | ---------------- |
| Synth bass | [instruments/synth-bass.md](instruments/synth-bass.md) | Low foundation | ✅ Cheap |
| Pad | [instruments/pad.md](instruments/pad.md) | Harmonic bed (atmospheric swell) | ⚠️ Moderate |
| FM Rhodes | [instruments/fm-rhodes.md](instruments/fm-rhodes.md) | Struck chords / harmonic events | ⚠️ Moderate (pre-render for full tracks) |
| Additive organ | [instruments/additive-organ.md](instruments/additive-organ.md) | Harmonic bed (transparent, no blur) | 🔴 Pre-render |
| Lead melody | [instruments/lead-melody.md](instruments/lead-melody.md) | Melodic line, one note at a time | ✅ Cheap |
| Chord stab | [instruments/chord-stab.md](instruments/chord-stab.md) | Rhythmic harmonic punctuation | ✅ Cheap |
| Kick | [instruments/kick.md](instruments/kick.md) | Low transient / downbeat anchor | ✅ Cheap |
| Snare | [instruments/snare.md](instruments/snare.md) | Mid transient / backbeat | ✅ Cheap |
| Hi-hat | [instruments/hi-hat.md](instruments/hi-hat.md) | High frequency / rhythm subdivisions | ✅ Cheap |

The performance tiers are defined in the **Performance budget** section of Step 5.

---

## Step 5 — Composition Guidelines

### Pattern writing

- Write melody that moves stepwise (adjacent scale notes) most of the time; leaps add drama but should resolve.
- Melody and bass should not occupy the same octave — bass sits one or two octaves below melody.
- Leave rests (`null` entries). A pattern with a note on every step sounds mechanical; 40–60% note density is a reasonable starting point.
- **Full ensemble silence is a valid compositional note.** One or two beats where every instrument goes silent — no bass, no melody, no percussion — creates emphasis, lets the previous phrase land, and makes the re-entry hit harder. Use it very sparingly (once or twice across a 64-beat pattern), always at a phrase boundary, and never for more than one beat unless you are deliberately building tension. A well-placed beat of silence is more effective than any amount of layering.
- Chord changes every 2 or 4 beats feel natural. Use `null` in chord-based layers on non-change beats.

### Realism techniques

The goal is to sound performed, not sequenced. Apply these everywhere.

**Timing humanization.** Real musicians play slightly ahead of or behind the beat. Add a small deterministic jitter to the scheduled time of each note — use `step` as a seed so the pattern is reproducible, not random on every loop:

```ts
// Deterministic micro-timing: ±8 ms based on step position.
// Uses a simple LCG-style hash so the same step always gets the same offset.
function humanTime(t: number, step: number): number {
  const hash = ((step * 1664525 + 1013904223) & 0xffffffff) / 0xffffffff;
  return t + (hash - 0.5) * 0.016; // ±8 ms
}
// Usage: scheduleBass(midi, humanTime(t, step));
```

Apply to melody and bass. Do not apply to kick / snare downbeats — those anchor the tempo.

**Velocity variation.** Real instruments vary loudness note-to-note. Scale `vol` per note using the same deterministic technique:

```ts
function humanVol(base: number, step: number): number {
  const hash = ((step * 22695477 + 1) & 0xffffffff) / 0xffffffff;
  return base * (0.82 + hash * 0.36); // ±18% variation
}
```

**Envelope realism per instrument class:**

| Instrument       | Attack                     | Sustain                              | Release                          |
| ---------------- | -------------------------- | ------------------------------------ | -------------------------------- |
| Acoustic bass    | 1–3 ms linear              | Exponential sag (-3 dB over 300 ms)  | 60–80 ms exponential             |
| Electric piano   | 3–8 ms linear              | Shoulder then long exp decay         | 20–40 ms (sustain pedal = longer)|
| Organ            | 5 ms linear (key-click)    | Flat                                 | 5 ms linear                      |
| Plucked string   | Instantaneous (< 1 ms)     | Natural loop decay                   | Decays to silence naturally      |
| Melody (lead)    | 10–20 ms linear            | Gentle sag                           | 30–50 ms                         |

Never use a symmetric ADSR. Real instruments have asymmetric envelopes — attack is always shorter than release, and sustain always sags slightly rather than holding flat.

**Timbral richness.** Thin tone is a synthesis failure, not an aesthetic.

- **Unison detune + chorus:** For any sustained single-note layer, create 2–3 oscillators detuned ±5–12 cents and slowly sweep one with a 0.3–0.8 Hz LFO on `detune`. This creates natural ensemble spread.
- **Spectral weight:** Add a single sub-oscillator (one octave below, sine wave, gain ≈ 0.15) to bass and chord instruments to fill the low end.
- **Filter movement:** A slow (0.1–0.3 Hz) LFO on a lowpass filter's `frequency` parameter (+/- 120 Hz) animates sustained notes so they breathe rather than freeze.

**Spatial depth.** Use a short stereo-like delay to place instruments in a simulated room:

```ts
// Lightweight reverb tail: two comb delays + one allpass.
// Insert between instrument gain and music GainNode.
function addRoomTail(
  ctx: AudioContext,
  source: AudioNode,
  dest: AudioNode,
  roomMs = 28,
  decayGain = 0.22,
): void {
  const wet = ctx.createGain();
  wet.gain.value = decayGain;

  const d1 = ctx.createDelay(0.5);
  const d2 = ctx.createDelay(0.5);
  d1.delayTime.value = roomMs / 1000;
  d2.delayTime.value = (roomMs * 1.37) / 1000; // prime ratio avoids comb-filter cancellation

  source.connect(d1); d1.connect(wet);
  source.connect(d2); d2.connect(wet);
  wet.connect(dest);
  source.connect(dest); // dry path
}
```

Use short `roomMs` (18–35 ms) for intimate instruments (FM Rhodes, organ). Use longer (40–60 ms) for ambient layers (pad). Never add room tail to kick or bass — it muddies the low end.

**Percussion realism:** Instrument-specific realism techniques (sub body on kick, dual noise bands on snare, two-source sheen on hi-hat) are documented in each instrument's reference file: [instruments/kick.md](instruments/kick.md), [instruments/snare.md](instruments/snare.md), [instruments/hi-hat.md](instruments/hi-hat.md).

### Performance budget — quality vs timing tradeoffs

**Why this matters.** The scheduler tick runs on the main thread inside `setInterval`. Every call to `ctx.createOscillator()`, `ctx.createBiquadFilter()`, etc. inside `scheduleStep()` costs main-thread time. If a single tick creates too many nodes, it stalls the JavaScript event loop long enough that the *next* tick fires late, causing the scheduled note times to drift relative to `ctx.currentTime`. The audio hardware still plays previously-scheduled notes on time — but new notes get pushed back. The result is audible timing slop that sounds worse than reduced timbral richness.

**Rule:** prefer cheaper playback over expensive generation in the hot `scheduleStep()` path.

#### Complexity tier table — what to keep and what to drop

| Tier | Technique | Cost per note | Keep by default? |
| ---- | --------- | ------------- | ---------------- |
| ✅ Free | Parameter automation (`setValueAtTime`, `linearRampToValueAtTime`, `exponentialRampToValueAtTime`) | Negligible | Always |
| ✅ Free | Playback of a pre-rendered `AudioBuffer` via `AudioBufferSourceNode` | Negligible | Always |
| ✅ Cheap | 1–2 oscillators + 1 filter + 1 gain per note | Low | Yes |
| ⚠️ Moderate | 3–4 oscillators per note (unison detune), simple LFO | Medium | Yes, up to 2 simultaneous notes |
| ⚠️ Moderate | `addRoomTail()` (2 delay nodes) | Medium | Yes, but only on melody/chords — not percussion |
| 🔴 Expensive | 6+ oscillators per note (additive organ, rich unison) | High | Pre-render instead (see below) |
| 🔴 Expensive | Feedback delay loop (Karplus-Strong) | High | Pre-render instead |
| 🔴 Never in hot path | `OfflineAudioContext` render | Blocking (async) | Startup only |

#### Pre-rendering expensive sounds with OfflineAudioContext

For any instrument whose `scheduleXxx` function creates 5+ nodes, render each distinct pitch at startup into an `AudioBuffer` and store it in a `Map<number, AudioBuffer>`. The scheduler then fires a single `AudioBufferSourceNode` per note — one node, no filter, no oscillator chain.

```ts
/**
 * Pre-renders a single pitch of a note shape into a buffer.
 * Called once per pitch at track startup, before the scheduler interval starts.
 *
 * @param ctx       The live AudioContext — used only to discover sampleRate.
 * @param renderFn  A function that builds the synthesis graph in an OfflineAudioContext
 *                  and returns the destination GainNode.
 * @param durationS Buffer length in seconds (use the longest note duration for this layer).
 */
async function prerenderNote(
  ctx: AudioContext,
  renderFn: (offCtx: OfflineAudioContext) => void,
  durationS: number,
): Promise<AudioBuffer> {
  const offCtx = new OfflineAudioContext(1, Math.ceil(ctx.sampleRate * durationS), ctx.sampleRate);
  renderFn(offCtx);
  return offCtx.startRendering();
}

// ── Usage pattern ─────────────────────────────────────────────────────────
// At track startup (before setInterval), build the buffer cache:

const noteBuffers = new Map<number, AudioBuffer>();

const MIDI_NOTES = [48, 50, 52, 53, 55, 57, 58, 60, 62, 63, 64, 65, 67, 69, 70, 72, 74];

await Promise.all(
  MIDI_NOTES.map(async (midi) => {
    const buf = await prerenderNote(
      ctx,
      (offCtx) => {
        // Build the exact same synthesis graph here as in the live scheduleXxx function,
        // but use offCtx instead of ctx. Connect final gain to offCtx.destination.
        const freq = noteFreq(midi);
        // example: FM Rhodes graph
        const mod = offCtx.createOscillator();
        // … full graph …
        gain.connect(offCtx.destination);
        mod.start(0); mod.stop(noteDur + 0.05);
        carrier.start(0); carrier.stop(noteDur + 0.05);
      },
      noteDur + 0.1,
    );
    noteBuffers.set(midi, buf);
  }),
);

// In the scheduler hot path:
function scheduleNote(midi: number, t: number): void {
  const buf = noteBuffers.get(midi);
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = humanVol(0.22, currentStep); // velocity variation still applies
  src.connect(gain);
  gain.connect(music);
  src.start(t);
  // No src.stop() needed — buffer plays to end and disconnects automatically.
}
```

**Caveat:** `prerenderNote` is async and uses actual wall-clock time to render (fast — typically < 50 ms per note at 44.1 kHz). Call all renders in parallel with `Promise.all` before starting `setInterval`. Make the exported `startXxx` function `async` and `await` the renders before arming the scheduler.

**What pre-rendering cannot replicate:** parameter automation that references `ctx.currentTime` at playback time (e.g. the human-timing jitter). Apply timing jitter by adjusting the `src.start(t)` argument as normal — that still works on a buffer source.

#### Node count budget

Every `scheduleStep()` call should create **≤ 8 Web Audio nodes in total** across all instruments firing on that step. Count oscillators, filters, gains, delay nodes, and buffer sources — each is one node.

If a step fires bass + melody + percussion simultaneously and the honest count exceeds 12 nodes, pre-render the most expensive of those three layers.

#### startMusic must be async when pre-rendering

```ts
// SynthAudioManager.ts — when the track uses pre-rendering:
startMusic(trackId: string): void {
  this.stopCurrentTrack?.();
  const { ctx, music } = this.getMusicGain();
  switch (trackId) {
    case 'myTrack':
      // Fire-and-forget the async start; stopCurrentTrack is set
      // once rendering completes. Music is silent for ~50–100 ms.
      startMyTrack(ctx, music).then((stop) => {
        this.stopCurrentTrack = stop;
      });
      break;
  }
}
```

The 50–100 ms silence while buffers render is inaudible on a phase transition.

---

### Structure: intro → loop

For a seamless looping track, avoid structural variation (no intro/bridge/outro in the pattern itself). Instead, design a pattern that loops gracefully: the last beat should lead naturally back to the first beat harmonically and rhythmically.

If an intro is needed, detect `currentStep === 0` on the first pass and schedule a simplified version (pad only, no drums). This requires a `firstLoop` flag in the closure.

---

## Step 6 — Extend IAudioManager

Music needs lifecycle methods that sound effects don't. Add these to the interface in `packages/web/src/audio/AudioManager.ts`:

```ts
export interface IAudioManager {
  // … existing sound methods …
  startMusic(trackId: string): void;
  stopMusic(): void;
}
```

Add no-op stubs to `AudioManager` (Howler-backed — music files not yet supported):

```ts
startMusic(_trackId: string): void { /* TODO-XXXX: implement when audio files are added */ }
stopMusic(): void { /* no-op */ }
```

Check existing `TODO-` numbers before assigning a new one.

---

## Step 7 — Wire into SynthAudioManager

**File:** `packages/web/src/audio/SynthAudioManager.ts`

```ts
import { start<TrackId> } from './music/<trackId>.js';
```

Extend the class:

```ts
private musicGain: GainNode | null = null;
private stopCurrentTrack: (() => void) | null = null;

private getMusicGain(): { ctx: AudioContext; music: GainNode } {
  const { ctx } = this.getCtx();       // reuse existing lazy init
  if (!this.musicGain) {
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.6;   // default music volume (relative to SFX master)
    this.musicGain.connect(this.ctx!.destination);
  }
  return { ctx, music: this.musicGain };
}

startMusic(trackId: string): void {
  this.stopCurrentTrack?.();           // stop any currently playing track
  const { ctx, music } = this.getMusicGain();
  switch (trackId) {
    case '<trackId>': this.stopCurrentTrack = start<TrackId>(ctx, music); break;
    default: console.warn(`Unknown music track: ${trackId}`); break;
  }
}

stopMusic(): void {
  this.stopCurrentTrack?.();
  this.stopCurrentTrack = null;
}
```

**Note:** `musicGain` routes directly to `ctx.destination`, **not** through `masterGain`. This keeps music volume independent of the SFX master so the two can be mixed separately.

---

## Step 8 — Call from the UI

Find the React hook or component that manages phase transitions (`useGame.ts` is the primary location) and add:

```ts
const audio = useAudio();

// When phase becomes 'scheduling':
audio.startMusic('schedulingTheme');

// When phase becomes 'crisis':
audio.startMusic('crisisBed');

// When game ends (win or lose):
audio.stopMusic();
```

Use the existing XState selector pattern already in `useGame.ts` — do not add a second subscription.

---

## Step 9 — Validate

```sh
yarn workspace @load/web test          # unit tests
yarn workspace @load/web dev           # open app, let the music play through at least one loop
```

Checklist:

- [ ] Music loops without an audible gap or click at the seam
- [ ] Music stops immediately (within one `LOOK_AHEAD` window) when the phase ends
- [ ] Calling `startMusic()` twice in quick succession doesn't layer two simultaneous tracks
- [ ] `stopMusic()` on a track that was never started does not throw
- [ ] No single layer gain exceeds 0.4; total perceived level is comfortable alongside SFX
- [ ] All imports use `.js` extensions (native ESM)
- [ ] All `osc.start()` / `noise.start()` calls have matching `osc.stop()` / `noise.stop()` calls scheduled
- [ ] **Timing drift check:** open browser DevTools Performance tab, record 10 seconds of music, verify no `setInterval` callback takes > 8 ms. If any tick exceeds that, identify which `scheduleStep()` call is creating the most nodes and pre-render it.

### Gain budget for music

Music layers compete with SFX. Keep the `musicGain` master node at 0.5–0.7 and per-layer gains low:

| Layer count | Max gain per layer |
| ----------- | ------------------ |
| 2           | 0.35               |
| 3           | 0.28               |
| 4–5         | 0.20               |
