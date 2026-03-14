---
name: rework-music
description: 'Rework an existing background music track in the Load game. Covers reading the current implementation, diagnosing what to change, editing patterns or instrument layers, adjusting tempo or key, handling track renames across IAudioManager and SynthAudioManager, and revalidating. Use when the user asks to change, rebalance, extend, retune, or rename an existing music track.'
argument-hint: "Track ID or context plus desired change, e.g. 'make schedulingTheme slower and more ambient' or 'add percussion to crisisBed' or 'rename schedulingTheme to focusLoop'"
---

# Rework Existing Music Track

Produces an updated looping music track: revised patterns, instrument layers, tempo, or key in the existing `music/<trackId>.ts` file, with any needed interface and manager updates. Delegates new-layer patterns and instrument templates to the `new-music` skill.

## When to Use

- Changing the mood, tempo, or key of an existing track
- Adding, removing, or replacing an instrument layer
- Rewriting melody, bass, or chord patterns because they feel repetitive or wrong
- Extending the pattern length for more musical variety
- Fixing a loop seam click, a timing gap, or a layer that clips
- Renaming a track (the `trackId` string and `start*()` function)

## Not in Scope

- Adding a brand-new track for a context that currently has no music → use the `new-music` skill instead
- Changing which game phase triggers which track — that belongs in the component or hook calling `startMusic()`
- Reworking a one-shot sound effect → use the `rework-sound` skill

## Prerequisites

Before touching any code, read the following:

1. The target track file — full contents: `packages/web/src/audio/music/<trackId>.ts`
2. `packages/web/src/audio/AudioManager.ts` — the `IAudioManager` interface
3. `packages/web/src/audio/SynthAudioManager.ts` — active implementation, specifically the `startMusic` switch and `getMusicGain`
4. `packages/web/src/audio/music/utils.ts` — `noteFreq`, scale helpers, chord helpers
5. One other track file for comparison (if any exist)

For instrument templates, envelope patterns, look-ahead scheduler mechanics, and composition guidelines, refer to the `new-music` skill.

---

## Step 0 — Audit the Current Track

Answer these questions before writing any code:

**Is the track ID (or `start*()` function name) changing?**

| Change                | Impact                                                                                       | Action                          |
| --------------------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| ID stays the same     | Transparent — only the music file changes                                                    | Proceed to Step 1               |
| ID / function changes | Must update the `switch` in `SynthAudioManager`, `IAudioManager` docs, and every call site   | See Rename section in Step 3    |

**What is wrong or insufficient with the current track?**

Document the diagnosis before editing. Common categories:

| Symptom | Likely cause |
|---|---|
| Feels like a short loop, not a song | Pattern too short (< 32 beats); extend it — see composition notes in `new-music` |
| Melody sounds random or tuneless | Leaps without resolution; non-scale notes; too high a note density — reduce and add stepwise motion |
| Loop seam has a click or gap | Last beat's envelope tail bleeds past `nextNoteTime`; or `osc.stop()` clips an envelope; see fixing clicks below |
| Bass and melody muddy each other | Bass is in the same octave as melody — move bass one or two octaves down |
| Mix is too loud / clips | Per-layer gains too high for the layer count — see gain budget table |
| Mix is too quiet / thin | Too few layers, or gains too conservative — add a layer or raise gains within budget |
| Track plays over itself on re-entry | Previous stop function not called before `startMusic()` — fix in `SynthAudioManager.startMusic()` |
| A layer is silent | Oscillator not connected to `music`; or `osc.stop()` fires before `osc.start()` |
| Tempo feels wrong | Recalculate `BEAT = 60 / BPM` and check that all pattern array lengths match the intended bar count |

---

## Step 1 — Design the Changes

Capture the full change set before editing. Use this table:

| Aspect | Current state | New state | Notes |
|---|---|---|---|
| Track ID / function name | `start<X>` | | Only if renaming |
| File name | `music/<x>.ts` | | Rename file if function renamed |
| Tempo (BPM) | | | Rebuild `BEAT` and verify all `osc.stop()` offsets if changing |
| Key / root | | | Update all MIDI numbers in all patterns if rekeying |
| Pattern length (beats) | | | If extending: pad all patterns with new phrases; if shortening: trim consistently |
| Layers | List each | Mark ➕ / ➖ / ✏️ | Adjust per-layer gains if count changes |
| Melody pattern | | | Note phrase structure: A, B, C, D |
| Bass pattern | | | Note harmonic movement |
| Chord/pad changes | | | Note where chord changes fall |
| Percussion pattern | | | Kick / snare / hat placement |
| Look-ahead / tick values | | | Only change if causing gap or latency problems |
| Opening JSDoc comment | | | Always update to reflect the new design |

For a **rebalance-only** change (BPM, key, or gain numbers only): only Step 1, Step 2, and Step 5 are needed.
For a **structural change** (new/removed layer, rewritten patterns, extended length): follow all steps.

---

## Step 2 — Edit the Track File

Open `packages/web/src/audio/music/<trackId>.ts` and apply only the changes identified in Step 1.

### Changing BPM

Update `const BPM = <N>` and nothing else — `BEAT` derives from it automatically. Verify that instrument `osc.stop()` times expressed as multiples of `BEAT` (e.g. `t + BEAT + 0.02`) still allow envelopes to decay cleanly at the new tempo.

### Rekeying (changing root note or mode)

Recompute every MIDI number in every pattern array. Use the `noteFreq` / `scale` / `chord` helpers from `music/utils.ts` to derive the new values rather than computing them by hand. Verify that bass remains one or two octaves below melody after transposition.

### Rewriting a pattern

Replace the relevant pattern array. Format as labelled phrase blocks matching the `new-music` skill template — 8 steps per line, one comment per phrase:

```ts
const MELODY_PATTERN: (number | null)[] = [
  // Phrase A — question
  null, null, 64, null,   null, 62, null, 60,
  // Phrase B — answer
  null, null, 62, null,   64, null, null, 67,
  // Phrase C — harmonic shift (iv)
  null, 65, null, 64,     null, 62, null, null,
  // Phrase D — climax + resolution
  67, null, 64, null,     62, null, 60, null,
  // … additional phrases
];
```

**Full ensemble silence** — to place a beat of complete silence across all layers, emit `null` on every pattern at that step. Only do this at phrase boundaries; see composition guidance in `new-music`.

### Extending a pattern

Add new phrase blocks to the end of each pattern array. Update `const STEPS = <N>` to match. The new phrases must lead harmonically back to phrase A for the loop to be seamless. Write the new phrases with the same label-comment format as above.

### Adding a layer

Follow the instrument templates in the `new-music` skill. Add the scheduling call to `scheduleStep`. Reduce existing layer gains proportionally to stay within the gain budget (see table below). Add the new layer's role to the opening JSDoc comment.

### Removing a layer

Delete the instrument scheduling function and its call in `scheduleStep`. Remove its pattern array. Raise remaining layer gains proportionally. Update the opening JSDoc comment.

### Fixing a loop seam click

The last scheduled note of the loop must decay to silence before step 0 is rescheduled. Check:

1. The envelope decay reaches `0.001` before `t + BEAT`.
2. `osc.stop()` is set to `t + BEAT + 0.02` (20 ms safety margin).
3. For pads with slow release: shorten the release envelope's tail, or schedule a short gain fade to 0 at beat `STEPS - 1`.

### Fixing a layer timing gap

If notes from one tick occasionally play late or out of order:
- Verify `TICK_MS / 1000 < LOOK_AHEAD` (required invariant).
- If the gap only happens on first playback, increase the startup offset: `nextNoteTime = ctx.currentTime + 0.1`.

---

## Step 3 — Rename (Conditional)

**Skip this step entirely if the track ID and function name are not changing.**

If renaming `start<OldId>` → `start<NewId>` and `<oldId>` → `<newId>`:

1. **Rename the file**: `mv packages/web/src/audio/music/<oldId>.ts packages/web/src/audio/music/<newId>.ts`
2. **Rename the exported function** in the file.
3. **Update `SynthAudioManager.ts`**:
   - Change the import path and function name.
   - Update the `case '<oldId>':` entry in `startMusic()` to `case '<newId>':`.
4. **Update `IAudioManager` docs** if the old track ID appeared in any comment.
5. **Find and update all call sites**: `grep -r "startMusic('<oldId>')" packages/web/src/`

---

## Step 4 — Verify utils.ts Coverage

If the rework uses any `noteFreq`, `scale`, `chord`, or interval constant that doesn't exist in `packages/web/src/audio/music/utils.ts` yet, add it there before using it. Do not inline the formula in the track file.

---

## Step 5 — Validate

```sh
yarn workspace @load/web test      # unit tests
yarn workspace @load/web dev       # open app, let the track play through at least one full loop
```

Checklist:

- [ ] Track loops without an audible click or gap at the seam
- [ ] The reworked section sounds compositionally correct — melody resolves, bass supports it
- [ ] Pattern arrays all have the same length (`STEPS`)
- [ ] `STEPS` constant matches the actual array length
- [ ] All `osc.start()` / `noise.start()` calls have matching `osc.stop()` / `noise.stop()` scheduled
- [ ] No gain envelope ramps to exactly `0` — use `0.001` (only pad release into `osc.stop()` may use `0`)
- [ ] Calling `startMusic()` twice does not layer two copies of the track
- [ ] `stopMusic()` silences the track within one `LOOK_AHEAD` window
- [ ] All imports use `.js` extensions (native ESM)
- [ ] If renamed: no remaining references to the old track ID or function name (`grep -r 'start<OldId>\|<oldId>' packages/`)
- [ ] Opening JSDoc comment reflects the actual layer list and duration

### Gain budget reference

| Layer count | Max gain per layer |
|---|---|
| 2 | 0.35 |
| 3 | 0.28 |
| 4–5 | 0.20 |

The `musicGain` node in `SynthAudioManager` is separate from the SFX `masterGain`. If the overall track level feels wrong relative to sound effects, adjust `this.musicGain.gain.value` (default 0.6) rather than individual layer gains.
