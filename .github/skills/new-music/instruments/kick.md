# Kick Drum

**Signal chain:** Sine oscillator (80 Hz) with exponential pitch drop → amplitude decay; optionally layered with a sub sine (45 Hz, fixed pitch) and a highpass noise transient for beater click

**Character:** Punchy low transient. Anchors beats 1 and 3. The pitch drop gives the characteristic "thud" of a real kick drum — the fundamental frequency drops from 80 Hz to 30 Hz over 60 ms, mimicking the head's decay.

**Performance tier:** ✅ Cheap — 2 nodes base. 5 nodes with full realism enhancements. Safe in the hot scheduler path at any density.

---

## Base implementation

```ts
function scheduleKick(ctx: AudioContext, music: GainNode, t: number): void {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 0.06); // pitch drop over 60 ms

  gain.gain.setValueAtTime(0.7, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

  osc.connect(gain);
  gain.connect(music);
  osc.start(t);
  osc.stop(t + 0.10);
}
```

---

## Realism enhancements

### Sub body layer (recommended)

A fixed-pitch sine at 40–45 Hz adds physical low-end weight — the sub-bass you feel more than hear. It does **not** pitch-drop; it stays constant to reinforce the fundamental after the transient:

```ts
const sub  = ctx.createOscillator();
const subG = ctx.createGain();
sub.type = 'sine';
sub.frequency.value = 45;
subG.gain.setValueAtTime(0.35, t);
subG.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
sub.connect(subG);
subG.connect(music);
sub.start(t);
sub.stop(t + 0.14);
```

### Beater click transient (recommended)

A 2–3 ms burst of highpass noise at the attack onset simulates the beater striking the drumhead. This adds presence on small speakers where the sub body is inaudible:

```ts
const clickBuf  = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.003), ctx.sampleRate);
const clickData = clickBuf.getChannelData(0);
for (let i = 0; i < clickData.length; i++) clickData[i] = Math.random() * 2 - 1;

const click  = ctx.createBufferSource();
const clickHp = ctx.createBiquadFilter();
const clickG  = ctx.createGain();
click.buffer         = clickBuf;
clickHp.type         = 'highpass';
clickHp.frequency.value = 3500;
clickG.gain.setValueAtTime(0.30, t);
clickG.gain.exponentialRampToValueAtTime(0.001, t + 0.003);
click.connect(clickHp);
clickHp.connect(clickG);
clickG.connect(music);
click.start(t);
click.stop(t + 0.005);
```

### Complete enhanced implementation

```ts
function scheduleKick(ctx: AudioContext, music: GainNode, t: number): void {
  // Main pitch-drop body
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 0.06);
  gain.gain.setValueAtTime(0.65, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(gain); gain.connect(music);
  osc.start(t); osc.stop(t + 0.10);

  // Sub body (constant 45 Hz)
  const sub  = ctx.createOscillator();
  const subG = ctx.createGain();
  sub.type = 'sine'; sub.frequency.value = 45;
  subG.gain.setValueAtTime(0.32, t);
  subG.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  sub.connect(subG); subG.connect(music);
  sub.start(t); sub.stop(t + 0.14);

  // Beater click transient
  const cbuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.003), ctx.sampleRate);
  const cd   = cbuf.getChannelData(0);
  for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
  const click = ctx.createBufferSource();
  const hp    = ctx.createBiquadFilter();
  const cg    = ctx.createGain();
  click.buffer = cbuf; hp.type = 'highpass'; hp.frequency.value = 3500;
  cg.gain.setValueAtTime(0.28, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.003);
  click.connect(hp); hp.connect(cg); cg.connect(music);
  click.start(t); click.stop(t + 0.005);
}
```

Total: 8 nodes. ✅ Still safe in the hot path at all densities.

---

## Usage notes

- Fire on beats 1 and 3 for a standard 4/4 feel. Beats 2 and 4 are snare territory.
- Do **not** apply `humanTime()` to the kick — it anchors the tempo. Bass should lock to kick, not the other way around.
- Do **not** apply `addRoomTail()` — reverb on kick destroys low-end definition.
- Reduce `gain.gain` peak to 0.45 if the kick is too dominant relative to other layers — perceived loudness from the sub body is high.
