import { Assets, Application } from 'pixi.js';
import { CARD_ART } from './cardArt.js';
import type { IAudioManager } from './audio/AudioManager.js';

export interface LoadTask {
  label: string;
  run: () => Promise<void>;
}

const pixiWarmUpTask: LoadTask = {
  label: 'Initialising renderer',
  run: async () => {
    const app = new Application();
    await app.init({ width: 1, height: 1, antialias: false });
    app.destroy(true, { children: true });
  },
};

const cardArtTask: LoadTask = {
  label: 'Loading card art',
  run: async () => {
    await Promise.allSettled(
      Object.values(CARD_ART)
        .filter((u): u is string => !!u)
        .map((u) => Assets.load(u)),
    );
  },
};

/**
 * Returns the list of load-screen tasks for the given audio manager.
 * If the manager implements warmUp, a music pre-render task is included
 * and runs concurrently with the other tasks.
 */
export function makeLoadTasks(audio: IAudioManager): LoadTask[] {
  const tasks: LoadTask[] = [pixiWarmUpTask, cardArtTask];
  if (audio.warmUp) {
    const warmUp = audio.warmUp.bind(audio);
    tasks.push({
      label: 'Pre-rendering music',
      run: warmUp,
    });
  }
  return tasks;
}
