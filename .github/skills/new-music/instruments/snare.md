# Snare / Rim

**Signal chain:** Noise burst → bandpass filter (fc ≈ 750 Hz, Q ≈ 3) → gain decay; plus a pitched triangle body (fc ≈ 180 Hz) for crack

**Character:** Crisp mid-range hit. The noise component provides the "ssh" of a snare wire; the pitched body provides the transient crack. Together they read clearly on all speaker sizes.

**Performance tier:** ✅ Cheap — 5 nodes (2 noise + bandpass + nGain + pitched osc + pGain). Safe in the hot scheduler path.

---

## Base implementation

```ts
function scheduleSnare(ctx: AudioContext, music: GainNode, t: number): void {
  // ── Noise component (snare wire "ssssh") ─────────────────────────────────
  const noiseBuf  = makeNoiseBuffer(ctx, 0.15);
  const noise     = ctx.createBufferSource();
  noise.buffer    = noiseBuf;
  const bp        = ctx.createBiquadFilter();
  bp.type         = 'bandpass';
  bp.frequency.value = 750;
  bp.Q.value      = 3;
  const nGain     = ctx.createGain();
  nGain.gain.setValueAtTime(0.30, t);
  nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  noise.connect(bp); bp.connect(nGain); nGain.connect(music);
  noise.start(t); noise.stop(t + 0.15);

  // ── Pitched body (transient crack) ───────────────────────────────────────
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 180;
  gain.gain.setValueAtTime(0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  osc.connect(gain); gain.connect(music);
  osc.start(t); osc.stop(t + 0.05);
}
```

---

## Realism enhancement — high-crack layer

Layer a second noise burst at higher frequency (fc ≈ 2 kHz bandpass) to simulate the upper-frequency crack of a real snare shell. Vary the noise-to-tone ratio per hit for natural inconsistency:

```ts
function scheduleSnare(ctx: AudioContext, music: GainNode, t: number, step: number): void {
  const crackRatio = humanVol(1.0, step); // 0.82–1.18 variation per hit

  // Low noise band (wire buzz)
  const buf1 = makeNoiseBuffer(ctx, 0.15);
  const n1   = ctx.createBufferSource(); n1.buffer = buf1;
  const bp1  = ctx.createBiquadFilter();
  bp1.type = 'bandpass'; bp1.frequency.value = 750; bp1.Q.value = 3;
  const g1   = ctx.createGain();
  g1.gain.setValueAtTime(0.28 * crackRatio, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  n1.connect(bp1); bp1.connect(g1); g1.connect(music);
  n1.start(t); n1.stop(t + 0.15);

  // High noise band (shell crack)
  const buf2 = makeNoiseBuffer(ctx, 0.06);
  const n2   = ctx.createBufferSource(); n2.buffer = buf2;
  const bp2  = ctx.createBiquadFilter();
  bp2.type = 'bandpass'; bp2.frequency.value = 2000; bp2.Q.value = 2;
  const g2   = ctx.createGain();
  g2.gain.setValueAtTime(0.22 / crackRatio, t); // inverse ratio: more crack when less wire
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  n2.connect(bp2); bp2.connect(g2); g2.connect(music);
  n2.start(t); n2.stop(t + 0.07);

  // Pitched crack body
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle'; osc.frequency.value = 185;
  gain.gain.setValueAtTime(0.14, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  osc.connect(gain); gain.connect(music);
  osc.start(t); osc.stop(t + 0.05);
}
```

Total: 9 nodes. ✅ Still safe in the hot scheduler path.

---

## Usage notes

- Snare typically fires on beats 2 and 4. Snare on beat 1 is a pick-up or accent, not a backbeat.
- Do **not** apply `humanTime()` to snare downbeats — it anchors the groove against the kick. Off-beat snare hits (ghost notes) can have subtle timing.
- The `makeNoiseBuffer` helper is from `packages/web/src/audio/sounds/utils.ts`. Import it in music track files.
- A short `addRoomTail()` (roomMs ≈ 22 ms, decayGain ≈ 0.15) adds a natural snare ambience without obscuring the attack — use sparingly.
