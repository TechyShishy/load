# Lead Melody

**Signal chain:** Triangle (or sawtooth) oscillator → vibrato LFO on frequency → amplitude envelope

**Character:** Clear, singable, present. Triangle is warmer and less harsh than sawtooth for a melodic line. The vibrato LFO adds warmth without sounding wobbly at moderate depth.

**Performance tier:** ✅ Cheap — 4 nodes (oscillator, LFO oscillator, LFO gain, amplitude gain). Safe in the hot scheduler path.

---

## Implementation

```ts
function scheduleMelody(
  ctx: AudioContext,
  music: GainNode,
  midi: number,
  t: number,
  beat: number,
): void {
  const dur = beat * 0.88; // slightly shorter than a beat so lines don't smear

  const osc  = ctx.createOscillator();
  const lfo  = ctx.createOscillator();
  const lfoG = ctx.createGain();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(noteFreq(midi), t);

  // Vibrato: 5.5 Hz at ±4 Hz — adds warmth; start delayed 40 ms to match natural technique
  lfo.type = 'sine';
  lfo.frequency.value = 5.5;
  lfoG.gain.setValueAtTime(0,  t);
  lfoG.gain.linearRampToValueAtTime(4,  t + 0.04); // delayed vibrato onset
  lfo.connect(lfoG);
  lfoG.connect(osc.frequency);

  // Asymmetric envelope: moderate attack, gentle sustain sag, 40 ms release
  gain.gain.setValueAtTime(0,    t);
  gain.gain.linearRampToValueAtTime(0.28,  t + 0.015);
  gain.gain.setValueAtTime(0.24,           t + dur - 0.05); // slight sag
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain);
  gain.connect(music);
  osc.start(t); lfo.start(t);
  osc.stop(t + dur + 0.02);
  lfo.stop(t + dur + 0.02);
}
```

### Sawtooth variant (brighter lead)

Replace `osc.type = 'triangle'` with `'sawtooth'` and reduce `vol` to `0.18` to compensate for sawtooth's higher RMS. Use a mild highpass filter (fc ≈ 800 Hz) to remove excess low-end weight and sharpen the attack.

---

## Usage notes

- Play one note at a time — the melody layer is monophonic by convention.
- Apply `humanTime(t, step)` from the timing humanization guidelines for subtle microtiming.
- Note density: 40–55% of steps is a natural starting point. Too many consecutive notes sounds mechanical; deliberate rests create phrasing.
- Melody should move stepwise (adjacent scale degrees) most of the time; leaps of a third or fourth add interest and should be followed by a step in the opposite direction.
- Melody and bass must not occupy the same octave — use the register above the chord voicing.
