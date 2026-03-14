import type { IAudioManager } from './AudioManager.js';
import { playCardDrop } from './sounds/cardDrop.js';
import { playSLAFail } from './sounds/slaFail.js';
import { playOverload } from './sounds/overload.js';
import { playWin } from './sounds/win.js';
import { playLose } from './sounds/lose.js';
import { playAdvance } from './sounds/advance.js';
import { startTitleTheme } from './music/titleTheme.js';
import { startTutorialTheme } from './music/tutorialTheme.js';
import { startContractTheme } from './music/contractTheme.js';

/**
 * Procedural audio manager backed by the Web Audio API.
 * All sounds are synthesized in code — no audio files required.
 *
 * This is the active implementation wired in AudioContext.tsx.
 * To switch to file-backed audio, replace `new SynthAudioManager()` with
 * `new AudioManager()` in AudioContext.tsx (and ensure public/audio/ assets exist).
 *
 * Individual sound definitions live in src/audio/sounds/.
 */

/** Initial music gain before settings are applied. Must match
 *  `musicVolume` in `getDefaultSettings()` in SettingsContext.tsx. */
const DEFAULT_MUSIC_VOLUME = 0.6;
export class SynthAudioManager implements IAudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private mutedVolume = 1;
  private isMuted = false;

  // Music is routed to its own GainNode (→ ctx.destination directly), kept
  // independent of the SFX masterGain so the two can be mixed separately.
  private musicGain: GainNode | null = null;
  private musicVolume = DEFAULT_MUSIC_VOLUME; // user-controlled; range 0–1
  private stopCurrentTrack: (() => void) | null = null;
  // Track deferred until the first user gesture unlocks the AudioContext.
  private pendingTrackId: string | null = null;

  private getCtx(): { ctx: AudioContext; master: GainNode } {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.mutedVolume;
      this.masterGain.connect(this.ctx.destination);
    }
    return { ctx: this.ctx, master: this.masterGain! };
  }

  playCardDrop(): void { const { ctx, master } = this.getCtx(); playCardDrop(ctx, master); }
  playSLAFail():  void { const { ctx, master } = this.getCtx(); playSLAFail(ctx, master); }
  playOverload(): void { const { ctx, master } = this.getCtx(); playOverload(ctx, master); }
  playWin():      void { const { ctx, master } = this.getCtx(); playWin(ctx, master); }
  playLose():     void { const { ctx, master } = this.getCtx(); playLose(ctx, master); }
  playAdvance():  void { const { ctx, master } = this.getCtx(); playAdvance(ctx, master); }

  setMasterVolume(volume: number): void {
    this.mutedVolume = Math.max(0, Math.min(1, volume));
    if (!this.isMuted && this.masterGain) {
      this.masterGain.gain.value = this.mutedVolume;
    }
  }

  /**
   * Mutes or unmutes all audio (SFX + music) at once.
   * NOTE: This is NOT used by the settings subsystem. Settings control volume
   * via setMasterVolume(0) / setMusicVolume(0) directly. Calling mute() then
   * updateSettings() can desync isMuted with the gain values — keep these
   * two code paths separate.
   */
  mute(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : this.mutedVolume;
    }
    // Music is on a separate gain chain but mute(true) should silence everything.
    if (this.musicGain) {
      this.musicGain.gain.value = muted ? 0 : this.musicVolume;
    }
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicGain && !this.isMuted) {
      this.musicGain.gain.value = this.musicVolume;
    }
  }

  private getMusicGain(): { ctx: AudioContext; music: GainNode } {
    const { ctx } = this.getCtx();
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(ctx.destination);
    }
    return { ctx, music: this.musicGain };
  }

  startMusic(trackId: string): void {
    this.stopCurrentTrack?.();
    this.stopCurrentTrack = null;
    // If the AudioContext isn't running yet (either not created pre-gesture, or
    // suspended by autoplay policy), defer the track. unlock() will start it once
    // the context transitions to 'running' inside a real user gesture.
    if (!this.ctx || this.ctx.state !== 'running') {
      this.pendingTrackId = trackId;
      return;
    }
    this.pendingTrackId = null;
    this._startTrack(trackId);
  }

  private _startTrack(trackId: string): void {
    const { ctx, music } = this.getMusicGain();
    music.gain.cancelScheduledValues(ctx.currentTime);
    music.gain.setValueAtTime(this.musicVolume, ctx.currentTime);
    switch (trackId) {
      case 'titleTheme':
        this.stopCurrentTrack = startTitleTheme(ctx, music);
        break;
      case 'tutorialTheme':
        this.stopCurrentTrack = startTutorialTheme(ctx, music);
        break;
      case 'contractTheme':
        this.stopCurrentTrack = startContractTheme(ctx, music);
        break;
      default:
        console.warn(`SynthAudioManager: unknown music track "${trackId}"`);
        break;
    }
  }

  stopMusic(): void {
    this.pendingTrackId = null; // cancel any track waiting for a gesture
    this.stopCurrentTrack?.();
    this.stopCurrentTrack = null;
    // Fade out the music gain quickly so long-tailed pad oscillators don't bleed
    // into the next context (e.g. into gameplay after leaving the start screen).
    if (this.musicGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(0, now + 0.25);
    }
  }

  unlock(): void {
    // Called from a document click listener — the first real user gesture.
    // Create the AudioContext inside the gesture so Chrome starts it running.
    // Then call resume() once (handles the case where it's still suspended)
    // and start any track that was deferred pre-gesture.
    const { ctx } = this.getCtx();
    void ctx.resume().then(() => {
      if (this.pendingTrackId !== null) {
        const trackId = this.pendingTrackId;
        this.pendingTrackId = null;
        this._startTrack(trackId);
      }
    });
  }

  destroy(): void {
    this.stopCurrentTrack?.();
    this.stopCurrentTrack = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
  }
}
