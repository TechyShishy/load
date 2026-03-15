/** Build a short buffer of white noise at the AudioContext's sample rate. */
export function makeNoiseBuffer(ctx: BaseAudioContext, durationSec: number): AudioBuffer {
  const sampleCount = Math.ceil(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}
