# FM Rhodes (Electric Piano)

**Signal chain:** Sine modulator (2× carrier freq) → modulation depth GainNode → carrier frequency AudioParam; sine carrier → amplitude envelope

**Character:** Bell-like shimmer at the attack that decays into warm tine resonance, exactly mimicking a struck Fender Rhodes. Chord changes arrive as events with timing and weight rather than atmospheric crossfades.

**Performance tier:** ⚠️ Moderate — 4 nodes per note (mod oscillator, modDepth gain, carrier oscillator, envelope gain). For a 3-note chord that's 12 nodes; safe if this is the only complex layer on that step. Pre-render if the track also fires bass + percussion on the same step.

---

## Implementation

```ts
/**
 * Two-operator FM electric piano tone.
 * Call once per chord tone; stagger t by 15–25 ms between notes to simulate a strum.
 * vol: 0.18–0.22 per note in a 3-note chord.
 * dur: typically BEAT * 1.8 to BEAT * 2.5 — let it decay naturally across the bar.
 */
function scheduleFMRhodes(
  ctx: AudioContext,
  music: GainNode,
  midi: number,
  t: number,
  dur: number,
  vol: number,
): void {
  const freq = noteFreq(midi);

  const mod      = ctx.createOscillator();
  const modDepth = ctx.createGain();
  const carrier  = ctx.createOscillator();
  const env      = ctx.createGain();

  mod.type            = 'sine';
  mod.frequency.value = freq * 2; // 2:1 ratio → Rhodes-like sideband character

  // β = modDepth / mod_freq.
  // High β at onset (bright shimmer) decays to near 0 (warm fundamental only).
  modDepth.gain.setValueAtTime(freq * 5,    t);
  modDepth.gain.exponentialRampToValueAtTime(freq * 0.6,  t + 0.07);
  modDepth.gain.exponentialRampToValueAtTime(freq * 0.04, t + dur);

  carrier.type            = 'sine';
  carrier.frequency.value = freq;

  // Sharp transient → shoulder → long exponential decay
  env.gain.setValueAtTime(0,          t);
  env.gain.linearRampToValueAtTime(vol,        t + 0.008);
  env.gain.setValueAtTime(vol * 0.7,           t + 0.04);  // shoulder
  env.gain.exponentialRampToValueAtTime(0.001, t + dur);

  mod.connect(modDepth);
  modDepth.connect(carrier.frequency);
  carrier.connect(env);
  env.connect(music);

  mod.start(t);     mod.stop(t + dur + 0.05);
  carrier.start(t); carrier.stop(t + dur + 0.05);
}
```

### Voicing example (Gm strum)

```ts
// Upward strum with 20 ms between strings:
[[55, 0.000], [58, 0.020], [62, 0.040]].forEach(([midi, offset]) => {
  scheduleFMRhodes(ctx, music, midi, t + offset, BEAT * 2.2, 0.20);
});
```

---

## Spatial depth

Add `addRoomTail()` with a short room (22–28 ms) — the Rhodes' decay tail in a small room is part of its character:

```ts
const noteOut = ctx.createGain();
noteOut.gain.value = 1.0;
carrier.connect(env);
env.connect(noteOut);
addRoomTail(ctx, noteOut, music, 24, 0.18);
```

---

## Pre-rendering

When this instrument co-fires with bass and percussion on the same step, pre-render each pitch using `prerenderNote()` (see the [Performance budget](../SKILL.md#performance-budget--quality-vs-timing-tradeoffs) section). The synthesis chain above maps directly into an `OfflineAudioContext` — replace `ctx` with `offCtx` and connect the final `env` to `offCtx.destination`.

---

## Usage notes

- Fire on beat 1 and beat 3 (or beats 2 and 4 for a backbeat feel) with a 1.5–2.5 beat decay. Avoid every beat — the bell transient loses impact with overuse.
- **Do not** use as a sustained pad replacement. It is a struck instrument; it must have a rhythmic role.
- The strum offset (15–25 ms between notes) is essential — simultaneous onset sounds electronic, not physical.
- Velocity variation via `humanVol(vol, step)` is audibly effective on this instrument because the modulation β is proportional to amplitude.
