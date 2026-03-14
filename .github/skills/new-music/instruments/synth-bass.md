# Synth Bass

**Signal chain:** Sawtooth oscillator → lowpass filter (fc ≈ 200 Hz, Q ≈ 2) → amplitude envelope

**Character:** Warm, round, foundational. The lowpass removes sawtooth harshness, leaving the fundamental and a few harmonics.

**Performance tier:** ✅ Cheap — 3 nodes. Add 1 for the optional sub-oscillator. Safe in the hot scheduler path.

---

## Implementation

```ts
function scheduleBass(
  ctx: AudioContext,
  music: GainNode,
  midi: number,
  t: number,
  beat: number,
): void {
  const freq = noteFreq(midi);

  const osc  = ctx.createOscillator();
  const filt = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, t);

  filt.type = 'lowpass';
  filt.frequency.value = 200;
  filt.Q.value = 2;

  // Asymmetric envelope: fast attack, slight sustain sag, medium release.
  gain.gain.setValueAtTime(0,     t);
  gain.gain.linearRampToValueAtTime(0.35,  t + 0.010); // 10 ms attack
  gain.gain.setValueAtTime(0.28,           t + 0.080); // sustain sag: -2 dB at 80 ms
  gain.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.85);

  osc.connect(filt);
  filt.connect(gain);
  gain.connect(music);
  osc.start(t);
  osc.stop(t + beat + 0.05);
}
```

## Sub-oscillator (recommended)

A sine wave an octave below the fundamental at gain ≈ 0.15 fills the low end without obscuring the midrange. Connect it through the **same** filter and gain so it shares the envelope — no extra envelope nodes needed:

```ts
// Add inside scheduleBass, after creating osc/filt/gain and before osc.connect():
const sub = ctx.createOscillator();
sub.type = 'sine';
sub.frequency.setValueAtTime(freq / 2, t);
sub.connect(filt); // shares filter + gain chain
sub.start(t);
sub.stop(t + beat + 0.05);
```

This adds 1 node to the budget (total: 4 with sub).

---

## Usage notes

- Sit bass 1–2 octaves below the melody. They must never share the same octave.
- Syncopated patterns (root on beat 1, rest beat 2, fifth on beat 3) drive more groove than straight quarter notes.
- Apply `humanTime(t, step)` **only** to off-beat notes. On beats 1 and 3 the bass should lock with the kick — no jitter on downbeats.
- Do **not** apply `addRoomTail()` — reverb on the low end creates mud.
- Filter movement: a very slow LFO (0.15 Hz, ±30 Hz on `filt.frequency`) animates the timbre across phrases without being noticeable.
