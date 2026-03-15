import { describe, it, expect, vi, afterEach } from 'vitest';
import { SynthAudioManager } from '../audio/SynthAudioManager.js';

// ── Minimal Web Audio mock ────────────────────────────────────────────────────
// All node factory methods return a plain object implementing just enough of the
// Web Audio API for the schedule* helpers to run without throwing.

function makeAudioParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    // AudioParam itself can receive connections (LFO → oscillator.frequency)
    connect: vi.fn(),
  };
}

function makeNode() {
  return {
    type: '' as OscillatorType | BiquadFilterType,
    buffer: null as AudioBuffer | null,
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    frequency: makeAudioParam(),
    detune: makeAudioParam(),
    gain: makeAudioParam(),
    Q: makeAudioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

class MockOfflineAudioContext {
  readonly sampleRate = 44100;
  readonly currentTime = 0;
  readonly destination = makeNode();
  readonly length: number;

  constructor(_numChannels: number, length: number, _sampleRate: number) {
    this.length = length;
  }

  createGain = vi.fn(() => makeNode());
  createOscillator = vi.fn(() => makeNode());
  createBiquadFilter = vi.fn(() => makeNode());
  createBufferSource = vi.fn(() => makeNode());
  createBuffer = vi.fn((_ch: number, len: number, sr: number) => ({
    length: len,
    numberOfChannels: 2,
    sampleRate: sr,
    duration: len / sr,
    getChannelData: vi.fn(() => new Float32Array(len)),
  }));
  startRendering = vi.fn((): Promise<AudioBuffer> => {
    const buf = {
      length: this.length,
      numberOfChannels: 2,
      sampleRate: this.sampleRate,
      duration: this.length / this.sampleRate,
      getChannelData: vi.fn(() => new Float32Array(this.length)),
    } as unknown as AudioBuffer;
    return Promise.resolve(buf);
  });
}

// Thin subclass that exposes the protected renderedBuffers map for assertions.
class TestableSynthAudioManager extends SynthAudioManager {
  getRenderedBuffer(id: string): AudioBuffer | undefined {
    return this.renderedBuffers.get(id);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SynthAudioManager pre-render', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preRenderTrack resolves for all known track IDs', async () => {
    vi.stubGlobal('OfflineAudioContext', MockOfflineAudioContext);
    const mgr = new SynthAudioManager();

    await mgr.preRenderTrack('titleTheme');
    await mgr.preRenderTrack('tutorialTheme');
    await mgr.preRenderTrack('contractTheme');

    mgr.destroy();
  });

  it('preRenderTrack resolves as a no-op for an unknown track ID', async () => {
    vi.stubGlobal('OfflineAudioContext', MockOfflineAudioContext);
    const mgr = new SynthAudioManager();

    await expect(mgr.preRenderTrack('unknownTrack')).resolves.toBeUndefined();

    mgr.destroy();
  });

  it('preRenderTrack renders a non-zero-length buffer for each track and stores it', async () => {
    const constructorArgs: Array<[number, number, number]> = [];
    const SpyCtx = class extends MockOfflineAudioContext {
      constructor(numChannels: number, length: number, sampleRate: number) {
        super(numChannels, length, sampleRate);
        constructorArgs.push([numChannels, length, sampleRate]);
      }
    };
    vi.stubGlobal('OfflineAudioContext', SpyCtx);
    const mgr = new TestableSynthAudioManager();

    for (const trackId of ['titleTheme', 'tutorialTheme', 'contractTheme']) {
      constructorArgs.length = 0;
      await mgr.preRenderTrack(trackId);

      // OfflineAudioContext constructed once with correct stereo, 44100 Hz args
      expect(constructorArgs).toHaveLength(1);
      const [channels, length, sampleRate] = constructorArgs[0]!;
      expect(channels).toBe(2);
      expect(length).toBeGreaterThan(0);
      expect(sampleRate).toBe(44100);

      // Buffer must be stored so _startTrack can use it.
      const buf = mgr.getRenderedBuffer(trackId);
      expect(buf).toBeDefined();
      expect(buf!.length).toBe(length);
    }

    mgr.destroy();
  });

  it('preRenderTrack silently skips when OfflineAudioContext is unavailable', async () => {
    // Explicitly stub to undefined so the test doesn't rely on jsdom's absence
    // of OfflineAudioContext, which could change in future jsdom versions.
    vi.stubGlobal('OfflineAudioContext', undefined);
    const mgr = new SynthAudioManager();
    await expect(mgr.preRenderTrack('titleTheme')).resolves.toBeUndefined();
    mgr.destroy();
  });

  it('warmUp pre-renders all three tracks', async () => {
    let renderCount = 0;
    class CountingCtx extends MockOfflineAudioContext {
      override startRendering = vi.fn((): Promise<AudioBuffer> => {
        renderCount++;
        const buf = {
          length: this.length,
          numberOfChannels: 2,
          sampleRate: this.sampleRate,
          duration: this.length / this.sampleRate,
          getChannelData: vi.fn(() => new Float32Array(this.length)),
        } as unknown as AudioBuffer;
        return Promise.resolve(buf);
      });
    }
    vi.stubGlobal('OfflineAudioContext', CountingCtx);
    const mgr = new SynthAudioManager();

    await mgr.warmUp();

    expect(renderCount).toBe(3);
    mgr.destroy();
  });
});
