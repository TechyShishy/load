import { Howl, Howler } from 'howler';

/**
 * Interface for all game audio operations.
 * Consuming code should depend on this type so tests can inject a no-op stub
 * without touching module-level singletons.
 */
export interface IAudioManager {
  playCardDrop(): void;
  playSLAFail(): void;
  playOverload(): void;
  playWin(): void;
  playLose(): void;
  playAdvance(): void;
  setMasterVolume(volume: number): void;
  setMusicVolume(volume: number): void;
  mute(muted: boolean): void;
  startMusic(trackId: string): void;
  stopMusic(): void;
  /** Resume the AudioContext after a user gesture. Safe to call repeatedly. */
  unlock(): void;
  /** Close the AudioContext and release all audio resources. Call once on unmount. */
  destroy(): void;
}

/**
 * Concrete AudioManager backed by Howler.js.
 * Audio files should be placed in packages/web/public/audio/.
 * Falls back gracefully if files are missing (dev mode).
 *
 * Instantiate via `new AudioManager()` and provide the instance through
 * React context (see AudioContext.tsx) rather than using a module-level
 * singleton — this keeps the class injectable and testable.
 */
export class AudioManager implements IAudioManager {
  private cardDrop: Howl;
  private slaFail: Howl;
  private overload: Howl;
  private win: Howl;
  private lose: Howl;
  private advance: Howl;

  constructor() {
    // Howler will log a warning if the file 404s, but won't throw — safe in dev before assets exist
    this.cardDrop = new Howl({
      src: ['./audio/card-drop.ogg', './audio/card-drop.mp3'],
      volume: 0.6,
    });
    this.slaFail = new Howl({
      src: ['./audio/sla-fail.ogg', './audio/sla-fail.mp3'],
      volume: 0.8,
    });
    this.overload = new Howl({
      src: ['./audio/overload.ogg', './audio/overload.mp3'],
      volume: 0.8,
    });
    this.win = new Howl({
      src: ['./audio/win.ogg', './audio/win.mp3'],
      volume: 1.0,
    });
    this.lose = new Howl({
      src: ['./audio/lose.ogg', './audio/lose.mp3'],
      volume: 1.0,
    });
    this.advance = new Howl({
      src: ['./audio/advance.ogg', './audio/advance.mp3'],
      volume: 0.5,
    });
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

  playAdvance(): void {
    this.advance.play();
  }

  setMasterVolume(volume: number): void {
    Howler.volume(Math.max(0, Math.min(1, volume)));
  }

  mute(muted: boolean): void {
    Howler.mute(muted);
  }

  // TODO-0014: implement file-backed music when public/audio/music/ assets are added
  startMusic(_trackId: string): void { /* no-op */ }
  stopMusic(): void { /* no-op */ }
  setMusicVolume(_volume: number): void { /* no-op until file-backed music is implemented */ }
  unlock(): void { /* Howler handles autoplay policy internally */ }
  destroy(): void { Howler.unload(); }
}
