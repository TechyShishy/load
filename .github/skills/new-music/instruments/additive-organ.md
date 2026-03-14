# Additive Organ (Hammond Drawbar)

**Signal chain:** 4 sine partial oscillators at harmonic ratios 1×/2×/3×/4× → individual partial gain nodes → shared note gain → tremolo LFO on note gain

**Character:** Transparent, present, no blur or swell. Instant attack and release — the chord is unambiguous the moment it fires. The 6.5 Hz tremolo simulates a Leslie cabinet in slow rotation.

**Performance tier:** 🔴 Expensive — 10 nodes per chord tone (4 oscillators, 4 partial gains, 1 note gain, 1 LFO oscillator, 1 LFO gain = 11 nodes). **Must be pre-rendered** for any track with more than one simultaneous layer. See pre-rendering instructions below.

---

## Implementation (live synthesis — use only for isolated testing)

```ts
// Drawbar partial weights approximating Hammond setting 888800000:
// 8' (fundamental), 4', 2⅔', 2'
const ORGAN_PARTIALS: [number, number][] = [
  [1, 0.50],
  [2, 0.38],
  [3, 0.18],
  [4, 0.12],
];

/**
 * Additive organ chord tone.
 * Call once per chord note; all notes fire at the same t — no strum.
 * vol: 0.10–0.12 per note; reduce to 0.07–0.09 for 4-note chords.
 * dur: typically 4 * BEAT (vamping) or 16 * BEAT (section hold).
 */
function scheduleOrgan(
  ctx: AudioContext,
  music: GainNode,
  midi: number,
  t: number,
  dur: number,
  vol: number,
): void {
  const freq = noteFreq(midi);

  const noteGain = ctx.createGain();
  // 5 ms ramps at both edges eliminate key-click transients
  noteGain.gain.setValueAtTime(0,   t);
  noteGain.gain.linearRampToValueAtTime(vol,  t + 0.005);
  noteGain.gain.setValueAtTime(vol,           t + dur - 0.008);
  noteGain.gain.linearRampToValueAtTime(0,    t + dur);

  // Leslie tremolo: ±10% depth at 6.5 Hz
  const lfo     = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type            = 'sine';
  lfo.frequency.value = 6.5;
  lfoGain.gain.value  = vol * 0.10;
  lfo.connect(lfoGain);
  lfoGain.connect(noteGain.gain);

  for (const [ratio, level] of ORGAN_PARTIALS) {
    const osc   = ctx.createOscillator();
    const pGain = ctx.createGain();
    osc.type            = 'sine';
    osc.frequency.value = freq * ratio;
    pGain.gain.value    = level;
    osc.connect(pGain);
    pGain.connect(noteGain);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  noteGain.connect(music);
  lfo.start(t); lfo.stop(t + dur + 0.05);
}
```

---

## Pre-rendering (required for production tracks)

The live implementation creates 11 nodes per chord tone. Pre-render each pitch at startup:

```ts
async function buildOrganBuffers(
  ctx: AudioContext,
  midiNotes: number[],
  dur: number,
): Promise<Map<number, AudioBuffer>> {
  const buffers = new Map<number, AudioBuffer>();

  await Promise.all(
    midiNotes.map(async (midi) => {
      const buf = await prerenderNote(
        ctx,
        (offCtx) => {
          const freq = noteFreq(midi);
          const noteGain = offCtx.createGain();
          noteGain.gain.setValueAtTime(0,    0);
          noteGain.gain.linearRampToValueAtTime(0.10,  0.005);
          noteGain.gain.setValueAtTime(0.10,           dur - 0.008);
          noteGain.gain.linearRampToValueAtTime(0,     dur);

          const lfo     = offCtx.createOscillator();
          const lfoGain = offCtx.createGain();
          lfo.type = 'sine'; lfo.frequency.value = 6.5;
          lfoGain.gain.value = 0.01;
          lfo.connect(lfoGain); lfoGain.connect(noteGain.gain);

          for (const [ratio, level] of ORGAN_PARTIALS) {
            const osc   = offCtx.createOscillator();
            const pGain = offCtx.createGain();
            osc.type = 'sine'; osc.frequency.value = freq * ratio;
            pGain.gain.value = level;
            osc.connect(pGain); pGain.connect(noteGain);
            osc.start(0); osc.stop(dur + 0.05);
          }

          noteGain.connect(offCtx.destination);
          lfo.start(0); lfo.stop(dur + 0.05);
        },
        dur + 0.1,
      );
      buffers.set(midi, buf);
    }),
  );

  return buffers;
}

// In the scheduler hot path — 2 nodes per chord tone:
function scheduleOrganFromBuffer(
  ctx: AudioContext,
  music: GainNode,
  midi: number,
  t: number,
  vol: number,
  buffers: Map<number, AudioBuffer>,
): void {
  const buf = buffers.get(midi);
  if (!buf) return;
  const src  = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer   = buf;
  gain.gain.value = humanVol(vol, currentStep);
  src.connect(gain);
  gain.connect(music);
  src.start(t);
}
```

The exported `startXxx` function must be `async` when using pre-rendering — see the **Performance budget** section in SKILL.md for the `SynthAudioManager` wiring pattern.

---

## Usage notes

- Fire all chord tones at the **same** `t` — simultaneous, never strummed. Organ keys open simultaneously.
- Organ does not compete with melody in the midrange because it is pure sines with no odd harmonics above the 4th partial. It can sit under a triangle melody without masking it.
- For section-length holds (`dur = 16 * BEAT`), pre-render a single buffer per chord voicing (not per pitch) to minimize the buffer count.
- Add `addRoomTail()` with `roomMs` 20–30 ms for a cabinet-in-a-room feel. Keep `decayGain` low (0.12–0.16) so the tremolo remains clear.
