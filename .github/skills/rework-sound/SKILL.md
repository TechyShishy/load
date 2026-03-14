---
name: rework-sound
description: 'Rework an existing sound effect in the Load game. Covers reading the current implementation, diagnosing what to change, editing the sound function, adding or removing layers, updating the IAudioManager interface when the method is renamed, and revalidating. Use when the user asks to change, rebalance, extend, or rename an existing game sound.'
argument-hint: "Function name or trigger context plus the desired change, e.g. 'make playOverload feel heavier' or 'add a shimmer tail to playWin' or 'rename playSLAFail to playTicketIssued'"
---

# Rework Existing Sound

Produces an updated procedural sound function: revised layers, envelopes, or timing in the existing `sounds/<name>.ts` file, with any needed interface and manager updates. Delegates new-layer patterns to the `new-sound` skill.

## When to Use

- Making an existing sound feel more impactful, tense, or satisfying
- Adding, removing, or replacing a layer in an existing sound
- Retuning frequency ranges, durations, or gain levels
- Renaming a sound method (the `play*()` function and `IAudioManager` entry)
- Fixing a clicking, clipping, or silence bug in a sound

## Not in Scope

- Wiring a brand-new sound to a game event that currently has no audio → use the `new-sound` skill instead
- Changing which game event triggers a sound — that belongs in the component or hook, not the sound file

## Prerequisites

Before touching any code, read the following:

1. The target sound file — full contents: `packages/web/src/audio/sounds/<name>.ts`
2. `packages/web/src/audio/AudioManager.ts` — the `IAudioManager` interface
3. `packages/web/src/audio/SynthAudioManager.ts` — the active implementation
4. `packages/web/src/audio/sounds/utils.ts` — available shared helpers
5. One neighbouring sound file for comparison (pick the most similar one to the target)

For layer patterns and envelope templates, refer to the `new-sound` skill.

---

## Step 0 — Audit the Current Sound

Answer these questions before writing any code:

**Is the function name (`play*`) changing?**

| Change              | Impact                                                                | Action                       |
| ------------------- | --------------------------------------------------------------------- | ---------------------------- |
| Name stays the same | Transparent — only the sound file changes                             | Proceed to Step 1            |
| Name changes        | Must update `IAudioManager`, `SynthAudioManager`, and every call site | See Rename section in Step 2 |

**What is wrong or insufficient with the current sound?**

Document the diagnosis before editing. Common categories:

| Symptom                    | Likely cause                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Sounds thin or weak        | Too few layers; gain too low; missing low-frequency content                               |
| Sounds harsh or clipping   | Gain budget exceeded; multiple layers all peaking above 0.4; missing lowpass filter       |
| Clicks at start/end        | Envelope goes to 0 instead of 0.001; missing `setValueAtTime(0, t)` at start              |
| Too short / truncated      | `osc.stop()` scheduled before envelope fully decays                                       |
| LFO causes zipper noise    | LFO depth too high; no smoothing on gain LFO                                              |
| Feels generic / wrong mood | Wrong waveform, wrong frequency range — consult the frequency/timbre guide in `new-sound` |
| Silent (no sound)          | `osc.stop()` called before `osc.start()`; oscillator not connected to `master`            |

---

## Step 1 — Design the Changes

Capture the full change set before editing. Use this table:

| Aspect                | Current state   | New state | Notes                                                 |
| --------------------- | --------------- | --------- | ----------------------------------------------------- |
| Function name         | `play<X>`       |           | Only change if renaming                               |
| File name             | `sounds/<x>.ts` |           | Rename file if function renamed                       |
| Duration (ms)         |                 |           | If changing                                           |
| Layers                | List each       | List each | Mark added ➕ / removed ➖ / changed ✏️               |
| Gains (per layer)     |                 |           | Adjust if adding/removing layers to keep mix balanced |
| Frequency targets     |                 |           | If retuning                                           |
| Waveform types        |                 |           | If changing character                                 |
| Filters               |                 |           | If adding/removing/retuning                           |
| LFOs                  |                 |           | If adding/removing modulation                         |
| Opening JSDoc comment |                 |           | Always update to reflect the new design               |

For a **rebalance-only** change (numbers only, same layer structure): only Step 1 and Step 2 are needed.
For an **additive or structural change** (new layers, new filters, new LFOs): follow all steps.

---

## Step 2 — Edit the Sound File

Open `packages/web/src/audio/sounds/<name>.ts` and apply only the changes identified in Step 1. Do not restructure code that is not changing.

### Renaming the function

If the function name changes:

1. Rename the function in the source file.
2. Rename the file to match (e.g. `slaFail.ts` → `ticketIssued.ts`).
3. Update the import in `SynthAudioManager.ts`.
4. Update the method name and interface entry in both `AudioManager.ts` and `SynthAudioManager.ts`.
5. Search for all call sites: `grep -r 'play<OldName>' packages/web/src/`
6. Update each call site.

### Adding a layer

Follow the multi-layer template from the `new-sound` skill. Key rules:

- Every new oscillator or buffer source needs `start()` and `stop()` scheduled.
- Reduce existing layer gains proportionally to stay within the gain budget (see table below).
- Add the new layer's role to the opening JSDoc comment.

### Removing a layer

Delete the entire block for that layer (oscillator/source, filter, gain, connect, start, stop calls). Increase remaining layer gains proportionally to restore volume.

### Retuning frequency or gain

Edit the `setValueAtTime` / `exponentialRampToValueAtTime` / `linearRampToValueAtTime` call values directly. Never ramp to exactly `0` — use `0.001`.

### Changing waveform character

Assign `osc.type` a new value: `'sine' | 'square' | 'sawtooth' | 'triangle'`. Refer to the timbre guide in `new-sound` for the feel of each type.

### Extending duration

1. Increase `dur` (or the individual segment durations).
2. Ensure all `osc.stop()` calls are updated accordingly — use `now + dur + 0.02` as the safety margin.
3. Extend noise buffers: `makeNoiseBuffer(ctx, dur + 0.05)`.

### Fixing clicks

- Add `gain.gain.setValueAtTime(0, t)` immediately before the attack ramp if missing.
- Never ramp to `0` — use `0.001`.
- Ensure the `osc.stop()` time is at least `0.01` s after the envelope reaches `0.001`.

---

## Step 3 — Update IAudioManager (Rename Only)

**Skip this step** if the function name did not change.

**File:** `packages/web/src/audio/AudioManager.ts`

1. In the `IAudioManager` interface: replace `play<OldName>(): void` with `play<NewName>(): void`.
2. In the `AudioManager` class body: rename the stub method to match.

---

## Step 4 — Update SynthAudioManager (Rename Only)

**Skip this step** if the function name did not change.

**File:** `packages/web/src/audio/SynthAudioManager.ts`

1. Update the import: `import { play<NewName> } from './sounds/<newFile>.js';`
2. Rename the method and the function call inside it:
   ```ts
   play<NewName>(): void { const { ctx, master } = this.getCtx(); play<NewName>(ctx, master); }
   ```

---

## Step 5 — Update Call Sites (Rename Only)

**Skip this step** if the function name did not change.

Find every call site in the web package:

```sh
grep -r 'play<OldName>' packages/web/src/
```

Update each to `audio.play<NewName>()`.

---

## Step 6 — Validate

Run tests and listen to the result:

```sh
yarn workspace @load/web test          # unit tests
yarn workspace @load/web dev           # open app and trigger the sound manually
```

Post-edit checklist:

- [ ] Every `osc.start()` has a matching `osc.stop()` scheduled after the envelope ends
- [ ] No gain envelope ramps to exactly `0` — only `0.001`
- [ ] Opening JSDoc comment matches the actual layer list
- [ ] Total duration feels correct — not truncated, not lingering too long
- [ ] LFO oscillators are stopped at the correct time
- [ ] All imports use `.js` extensions (native ESM)
- [ ] If renamed: no remaining references to the old function name (`grep -r 'play<OldName>' packages/`)
- [ ] Gain budget stays within bounds for the layer count (see table below)

### Gain budget reference

| Layer count | Max gain per layer |
| ----------- | ------------------ |
| 1           | 0.6                |
| 2           | 0.45               |
| 3–4         | 0.35               |
| 5+          | 0.25               |

If the reworked sound is noticeably louder or softer than before, re-check the per-layer peaks and adjust.
