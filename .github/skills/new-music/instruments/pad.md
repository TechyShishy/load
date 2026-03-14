# Synth Pad

**Signal chain:** 4× detuned sawtooth oscillators → lowpass filter (fc ≈ 900 Hz, Q ≈ 0.8) → slow swell envelope

**Character:** Lush, atmospheric. The four detuned oscillators create natural chorus phasing. The slow attack means the pad swells in rather than striking — it blurs chord boundaries by design.

**Performance tier:** ⚠️ Moderate — 12 nodes for a 3-note chord (4 OSCs × 3 notes). Safe if fired once per section boundary (every 16 beats), not every step. If firing more frequently or alongside other complex layers, pre-render each chord voicing.

**Note on use:** The pad is the most pervasive instrument across existing tracks. Exercise all three harmonic bed options (pad, FM Rhodes, additive organ) equally across the soundtrack — do not default to pad.

---

## Implementation

```ts
/**
 * Sustained pad chord tone. Call once per chord note; sustains for `dur` seconds.
 * Intended to fire at section boundaries (every 16 beats), not every step.
 *
 * vol: 0.05 per oscillator (12 OSCs total for a 3-note chord → manageable sum).
 */
function schedulePad(
  ctx: AudioContext,
  music: GainNode,
  midi: number,
  t: number,
  dur: number,
): void {
  const DETUNES = [-8, 0, 8, 14]; // 4-oscillator spread: slight flat, center, slight sharp, octave+2
  const vol = 0.05;

  for (const detune of DETUNES) {
    const osc  = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = noteFreq(midi);
    osc.detune.value = detune;

    filt.type = 'lowpass';
    filt.frequency.value = 900;
    filt.Q.value = 0.8;

    // Slow attack swell → sustain → slow release at tail
    gain.gain.setValueAtTime(0,    t);
    gain.gain.linearRampToValueAtTime(vol,  t + 0.3);   // 300 ms swell
    gain.gain.setValueAtTime(vol,           t + dur - 0.4);
    gain.gain.linearRampToValueAtTime(0,    t + dur);    // 400 ms fade

    osc.connect(filt);
    filt.connect(gain);
    gain.connect(music);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
```

### Firing for a full chord

Call `schedulePad` once per chord tone. Pass a `dur` that covers the full section length plus a small overlap so the release tail crosses the section boundary cleanly:

```ts
const PAD_OVERLAP = 0.4; // seconds — slow-release tail bleeds across boundary

// At section boundary (step % 16 === 0):
for (const midi of [55, 58, 62]) { // e.g. Gm: G3, Bb3, D4
  schedulePad(ctx, music, midi, t, 16 * BEAT + PAD_OVERLAP);
}
```

---

## Usage notes

- Fire at section boundaries only, not every beat.
- The slow attack means the pad is never the first thing the listener hears on a chord change — bass or a shorter attack instrument should land first.
- `dur` should equal the section length + `PAD_OVERLAP` to avoid a gap between sections.
- Do not add `addRoomTail()` — the unison detune already creates natural spatial spread. Adding room tail doubles the blur.
