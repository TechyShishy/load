---
name: new-sound
description: 'Add a new procedural sound effect to the Load game using only Web Audio API primitives. Produces complex, layered sounds — multiple oscillators, noise, filters, LFOs, and envelope curves — with no audio files. Use when the user asks for a new game sound, e.g. "add a sound for deploying a contract" or "add a tense alarm sound for the crisis phase".'
argument-hint: "Sound name and trigger context, e.g. 'contractSign – played when a contract is committed' or 'crisisAlarm – sustained alarm during crisis phase'"
---

# New Sound Creation

Produces a fully wired, multi-layer procedural sound: a `sounds/<name>.ts` module with a layered `play*()` function, registered on `IAudioManager` and `SynthAudioManager`.

## When to Use

- Adding a new audio event to the game (new UI interaction, new game phase, new feedback moment)
- The sound needs to express complex emotion or mechanics (tension, resolution, warning, reward)
- The user wants layered texture, not just a single beep

## Prerequisites

Read these files before starting:

- `packages/web/src/audio/AudioManager.ts` — `IAudioManager` interface
- `packages/web/src/audio/SynthAudioManager.ts` — active implementation
- `packages/web/src/audio/sounds/utils.ts` — shared helpers (`makeNoiseBuffer`)
- One or two existing sound files from `packages/web/src/audio/sounds/` for reference

---

## Step 1 — Design the Sound

Before writing any code, define a sound brief:

| Field              | Description                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **`functionName`** | `play<PascalName>` — e.g. `playContractSign`                                              |
| **`fileName`**     | `packages/web/src/audio/sounds/<camelName>.ts`                                            |
| **`methodName`**   | `play<PascalName>()` — added to `IAudioManager`                                           |
| **Duration**       | Total wall-clock duration in milliseconds; keep ≤ 2000 ms for UI feedback                 |
| **Mood/intent**    | One sentence: what emotion or mechanic does this sound express?                           |
| **Layers**         | List each layer with its role (e.g. "low thud for weight", "high shimmer for resolution") |

### Layer catalogue

Use any combination of these primitive layer types:

| Layer type               | When to use                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| **Pitched oscillator**   | Tonality, notes, arpeggios, sweeps                                    |
| **White noise**          | Texture, attack transient, hiss, rumble                               |
| **LFO on frequency**     | Wobble, vibrato, siren effect                                         |
| **LFO on gain**          | Tremolo, pulsing, rhythmic texture                                    |
| **BiquadFilter**         | Shape the spectrum (lowpass warmth, highpass air, bandpass mid focus) |
| **WaveShaper**           | Distortion, crunch, saturation                                        |
| **Multiple oscillators** | Chord / unison spread / harmonic richness                             |
| **Delay node**           | Echo, ping-pong sustain                                               |
| **Convolver**            | Reverb (use an impulse-response buffer built from noise)              |

---

## Step 2 — Implement the Sound File

**File:** `packages/web/src/audio/sounds/<camelName>.ts`

### Signature contract (never change this)

```ts
export function play<PascalName>(ctx: AudioContext, master: GainNode): void;
```

Both parameters are always injected by `SynthAudioManager` — never call `new AudioContext()` inside a sound file.

### Opening comment

Start with a JSDoc comment that describes the sound in ≤ 80 chars, listing the main layers and duration:

```ts
/** <Short description>: <layer 1>, <layer 2> … Total: <N>ms. */
```

### Timing anchor

Always grab `const now = ctx.currentTime;` at the top and offset every scheduled value from it.

### Envelope primitives

| Curve                                                    | Use for                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `gain.gain.setValueAtTime(0, t)`                         | Hard start (prevents clicks if the default value bleeds)    |
| `gain.gain.linearRampToValueAtTime(v, t + attack)`       | Smooth attack (< 0.02 s avoids clicks)                      |
| `gain.gain.exponentialRampToValueAtTime(0.001, t + dur)` | Natural decay/release (never ramp to exactly 0 — use 0.001) |
| `gain.gain.setTargetAtTime(0, t, tau)`                   | Slow RC-style fade-out (good for reverb tails)              |

### Multi-layer template

The canonical wiring pattern — repeat for each layer:

```ts
// ── Layer: <role> ──────────────────────────────────────────
const osc = ctx.createOscillator(); // or createBufferSource for noise
const filt = ctx.createBiquadFilter();
const gain = ctx.createGain();

osc.type = 'sine'; // sine | square | sawtooth | triangle
osc.frequency.setValueAtTime(440, now);
osc.frequency.exponentialRampToValueAtTime(220, now + dur);

filt.type = 'lowpass';
filt.frequency.value = 1200;
filt.Q.value = 1;

gain.gain.setValueAtTime(0, now);
gain.gain.linearRampToValueAtTime(0.4, now + 0.01);
gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

osc.connect(filt);
filt.connect(gain);
gain.connect(master); // always terminate at master
osc.start(now);
osc.stop(now + dur + 0.02); // +0.02 s safety margin after envelope ends
```

### LFO pattern

```ts
// LFO → target AudioParam
const lfo = ctx.createOscillator();
const lfoGain = ctx.createGain();

lfo.type = 'sine';
lfo.frequency.value = 6; // Hz — e.g. 6 Hz vibrato
lfoGain.gain.value = 20; // modulation depth in target param units

lfo.connect(lfoGain);
lfoGain.connect(osc.frequency); // modulate the main osc's frequency
lfo.start(now);
lfo.stop(now + dur + 0.02);
```

### Noise layer pattern

```ts
import { makeNoiseBuffer } from './utils.js'; // always .js extension

const noiseBuf = makeNoiseBuffer(ctx, dur + 0.05);
const noise = ctx.createBufferSource();
noise.buffer = noiseBuf;
// … connect through filter → gain → master, start/stop as normal
```

### Chord / unison spread

```ts
const DETUNE_CENTS = [-8, 0, 8];
DETUNE_CENTS.forEach((detune) => {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 220;
  osc.detune.value = detune; // AudioParam: cents offset
  // … envelope, connect, start/stop
});
```

### Timed sequence (arpeggio / rhythm)

```ts
const STEPS = [
  { freq: 261.63, t: 0.0 },
  { freq: 329.63, t: 0.11 },
  { freq: 392.0, t: 0.22 },
];
STEPS.forEach(({ freq, t: offset }) => {
  const t = now + offset;
  // … create osc, schedule envelope starting at t
});
```

### Reverb via noise impulse

For a short reverb tail without an audio file:

```ts
function makeImpulse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buf;
}

const conv = ctx.createConvolver();
conv.buffer = makeImpulse(ctx, 0.5, 3);
// route a gain output into conv → a wet gain → master
```

---

## Step 3 — Register on IAudioManager

**File:** `packages/web/src/audio/AudioManager.ts`

Add the method signature to the `IAudioManager` interface:

```ts
export interface IAudioManager {
  // … existing methods …
  play<PascalName>(): void;
}
```

Also add a no-op stub to the `AudioManager` (Howler-backed) class:

```ts
play<PascalName>(): void {
  // TODO-XXXX: wire to a real audio file when public/audio/ assets exist
}
```

Check existing `TODO-` numbers in `AudioManager.ts` before numbering a new one.

---

## Step 4 — Wire into SynthAudioManager

**File:** `packages/web/src/audio/SynthAudioManager.ts`

1. Import the new function:
   ```ts
   import { play<PascalName> } from './sounds/<camelName>.js';
   ```
2. Add the method to the class body (keep the one-liner style):
   ```ts
   play<PascalName>(): void { const { ctx, master } = this.getCtx(); play<PascalName>(ctx, master); }
   ```

---

## Step 5 — Call the Sound from the UI

Find the React component or hook that handles the relevant UI event and call:

```ts
const audio = useAudio();
audio.play<PascalName>();
```

Common trigger locations:

| Trigger          | File                                                         |
| ---------------- | ------------------------------------------------------------ |
| Card dropped     | `packages/web/src/hooks/useGame.ts` or drag-drop handler     |
| Phase transition | `packages/web/src/hooks/useGame.ts` — state machine selector |
| Button click     | The specific component (e.g. `AdvanceButton.tsx`)            |

---

## Step 6 — Validate

Run the test suite and dev server to verify nothing is broken:

```sh
yarn workspace @load/web test:watch    # unit tests
yarn workspace @load/web dev           # open the app and trigger the sound
```

Layer correctness checklist:

- [ ] Every `osc.start()` has a matching `osc.stop()` scheduled after the envelope ends
- [ ] No gain envelope ramps to exactly `0` — use `0.001` to avoid log(0) errors
- [ ] The total audible duration doesn't exceed the designed length
- [ ] LFO oscillators are also stopped at the right time
- [ ] The function signature matches `(ctx: AudioContext, master: GainNode): void` exactly
- [ ] All imports use `.js` extensions (project uses native ESM)

---

## Complexity Reference

### Richness progression

| Tier     | Pattern                              | Example sounds                           |
| -------- | ------------------------------------ | ---------------------------------------- |
| Simple   | 1 oscillator + envelope              | `advance` (30 ms square)                 |
| Moderate | 1–2 oscillators + filter             | `cardDrop` (sin sweep), `win` (arpeggio) |
| Complex  | 3+ layers (osc + noise + filter)     | `overload`, `lose`                       |
| Rich     | 4+ layers with LFO / detune / reverb | Crisis alarm, victory fanfare            |

### Frequency and timbre guide

| Feeling             | Frequency range                 | Waveform                       |
| ------------------- | ------------------------------- | ------------------------------ |
| Warm / low thud     | 30–80 Hz                        | Sine or sawtooth decaying down |
| Mid presence        | 200–800 Hz                      | Square, bandpass noise         |
| High clarity        | 1 kHz–4 kHz                     | Sine, triangle                 |
| Air / shimmer       | 4 kHz+                          | Highpass noise, triangle       |
| Tension / alarm     | 2–3 notes stepped or LFO wobble | Square                         |
| Resolution / reward | Rising arpeggio or chord        | Sine                           |

### Master gain budget

Each layer should peak well below 1.0. Typical budgets by layer count:

| Layers | Max gain per layer |
| ------ | ------------------ |
| 1      | 0.6                |
| 2      | 0.45               |
| 3–4    | 0.35               |
| 5+     | 0.25               |

Total perceived level is governed by `SynthAudioManager`'s `masterGain` — individual layer gains just set mix balance.
