# Hi-Hat (Closed)

**Signal chain:** Short noise burst → highpass filter (fc ≈ 6–8 kHz) → short gain decay

**Character:** Bright, airy, rhythmic subdivision. Closed hi-hat keeps time above the other layers without occupying low or mid frequencies.

**Performance tier:** ✅ Cheap — 3 nodes base. 6 nodes with dual-source realism. Safe in the hot scheduler path at all densities.

---

## Base implementation

```ts
function scheduleHat(
  ctx: AudioContext,
  music: GainNode,
  t: number,
  step: number,
): void {
  const bufLen = Math.ceil(ctx.sampleRate * 0.04);
  const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data   = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buf;

  const hp = ctx.createBiquadFilter();
  hp.type  = 'highpass';
  hp.frequency.value = 7000;

  const gain = ctx.createGain();
  // Accent on beats 1 and 3 (downbeats) vs. 2 and 4
  const isDownbeat = step % 4 === 0 || step % 4 === 2;
  gain.gain.setValueAtTime(isDownbeat ? 0.17 : 0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

  noise.connect(hp); hp.connect(gain); gain.connect(music);
  noise.start(t); noise.stop(t + 0.04);
}
```

---

## Realism enhancement — dual-source cymbal sheen

Real cymbals have a complex metallic frequency profile. Using two noise sources at slightly different highpass cutoffs (6 kHz and 8.5 kHz) produces a more believable, slightly modulated sheen. Apply velocity variation per hit:

```ts
function scheduleHat(
  ctx: AudioContext,
  music: GainNode,
  t: number,
  step: number,
): void {
  const isDownbeat = step % 4 === 0 || step % 4 === 2;
  const baseVol    = isDownbeat ? 0.16 : 0.11;
  const vol        = humanVol(baseVol, step); // ±18% per hit

  // Source A — lower high band (body of the cymbal)
  const lenA = Math.ceil(ctx.sampleRate * 0.04);
  const bufA = ctx.createBuffer(1, lenA, ctx.sampleRate);
  const dA   = bufA.getChannelData(0);
  for (let i = 0; i < lenA; i++) dA[i] = Math.random() * 2 - 1;
  const noiseA = ctx.createBufferSource(); noiseA.buffer = bufA;
  const hpA    = ctx.createBiquadFilter();
  hpA.type = 'highpass'; hpA.frequency.value = 6000;
  const gainA  = ctx.createGain();
  gainA.gain.setValueAtTime(vol,  t);
  gainA.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  noiseA.connect(hpA); hpA.connect(gainA); gainA.connect(music);
  noiseA.start(t); noiseA.stop(t + 0.04);

  // Source B — upper high band (sizzle/sheen)
  const lenB = Math.ceil(ctx.sampleRate * 0.025);
  const bufB = ctx.createBuffer(1, lenB, ctx.sampleRate);
  const dB   = bufB.getChannelData(0);
  for (let i = 0; i < lenB; i++) dB[i] = Math.random() * 2 - 1;
  const noiseB = ctx.createBufferSource(); noiseB.buffer = bufB;
  const hpB    = ctx.createBiquadFilter();
  hpB.type = 'highpass'; hpB.frequency.value = 8500;
  const gainB  = ctx.createGain();
  gainB.gain.setValueAtTime(vol * 0.65, t); // sizzle layer is quieter
  gainB.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
  noiseB.connect(hpB); hpB.connect(gainB); gainB.connect(music);
  noiseB.start(t); noiseB.stop(t + 0.028);
}
```

Total: 6 nodes. ✅ Safe at any step density.

---

## Usage notes

- Every beat is too dense for most moods; every other beat (8th notes) is a natural default.
- The downbeat/off-beat accent asymmetry (`isDownbeat ? 0.16 : 0.11`) provides natural groove dynamics without audible quantisation artifacts.
- Do **not** apply `humanTime()` to hi-hat on beats 1 and 3 — keep it locked with the kick. Off-beats can have subtle microtiming (±4 ms is enough).
- For an open hi-hat sound, extend the gain decay from 30 ms to 120–180 ms.
- Do **not** add `addRoomTail()` — reverb on cymbals smears the high-frequency detail that makes the rhythm readable.
