# Chord Stab

**Signal chain:** Sawtooth oscillator → short amplitude envelope (no filter by default, or mild lowpass)

**Character:** Rhythmic harmonic punctuation. A short, percussive chord hit that places harmony at a specific beat without sustaining. Creates forward motion in a way the pad cannot.

**Performance tier:** ✅ Cheap — 2 nodes per chord tone (oscillator, gain). A 3-note chord is 6 nodes total. Safe in the hot scheduler path.

---

## Implementation

```ts
/**
 * Short sawtooth stab — one oscillator per chord tone.
 * Call once per note in the chord, all at the same t (or staggered by 10–15 ms for a strum).
 * vol: 0.18–0.22 per note for a 3-note chord.
 * dur: 0.10–0.30 s depending on desired staccato feel.
 */
function scheduleStab(
  ctx: AudioContext,
  music: GainNode,
  midi: number,
  t: number,
  dur: number,
  vol: number,
): void {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(noteFreq(midi), t);

  // Sharp attack, exponential decay — no sustain
  gain.gain.setValueAtTime(0,    t);
  gain.gain.linearRampToValueAtTime(vol,  t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain);
  gain.connect(music);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
```

### Voicing example (Gm stab)

```ts
// Upward strum with 12 ms between strings:
const stabT = t; // beat time
[[55, 0.000], [58, 0.012], [62, 0.024]].forEach(([midi, offset]) => {
  scheduleStab(ctx, music, midi, stabT + offset, 0.18, 0.20);
});
```

### Filtered variant (warmer stab)

Add a lowpass filter (fc ≈ 1200 Hz, Q ≈ 1.5) between the oscillator and gain to round off the sawtooth edge — gives a more keyboard-like tone:

```ts
const filt = ctx.createBiquadFilter();
filt.type = 'lowpass';
filt.frequency.value = 1200;
filt.Q.value = 1.5;

osc.connect(filt);
filt.connect(gain);
```

This adds 1 node per tone (total 3 nodes per tone, 9 for a 3-note chord).

---

## Usage notes

- Fire on off-beats (beat 2 or the "and" of beat 2) for syncopation. A stab on every downbeat competes with kick and bass.
- `dur` governs the staccato feel: `0.10 s` is very tight and punchy; `0.25–0.30 s` is more open and jazz-like.
- Strum offset (10–15 ms between notes) adds naturalness; simultaneous onset sounds more electronic.
- The chord stab and FM Rhodes occupy a similar rhythmic role — don't use both in the same track unless one is clearly in a different register.
