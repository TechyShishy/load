import { Howl, Howler } from 'howler';

/**
 * AudioManager — singleton wrapping Howler.js for all game SFX.
 * Audio files should be placed in packages/web/public/audio/.
 * Falls back gracefully if files are missing (dev mode).
 */
export class AudioManager {
  private static instance: AudioManager | null = null;

  private cardDrop: Howl;
  private slaFail: Howl;
  private overload: Howl;
  private win: Howl;
  private lose: Howl;

  private constructor() {
    // Howler will log a warning if the file 404s, but won't throw — safe in dev before assets exist
    this.cardDrop = new Howl({
      src: ['/audio/card-drop.ogg', '/audio/card-drop.mp3'],
      volume: 0.6,
    });
    this.slaFail = new Howl({
      src: ['/audio/sla-fail.ogg', '/audio/sla-fail.mp3'],
      volume: 0.8,
    });
    this.overload = new Howl({
      src: ['/audio/overload.ogg', '/audio/overload.mp3'],
      volume: 0.8,
    });
    this.win = new Howl({
      src: ['/audio/win.ogg', '/audio/win.mp3'],
      volume: 1.0,
    });
    this.lose = new Howl({
      src: ['/audio/lose.ogg', '/audio/lose.mp3'],
      volume: 1.0,
    });
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  playCardDrop(): void {
    this.cardDrop.play();
  }

  playSLAFail(): void {
    this.slaFail.play();
  }

  playOverload(): void {
    this.overload.play();
  }

  playWin(): void {
    this.win.play();
  }

  playLose(): void {
    this.lose.play();
  }

  setMasterVolume(volume: number): void {
    Howler.volume(Math.max(0, Math.min(1, volume)));
  }

  mute(muted: boolean): void {
    Howler.mute(muted);
  }
}
