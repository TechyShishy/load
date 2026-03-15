import { Assets, Application } from 'pixi.js';
import { CARD_ART } from './cardArt.js';

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

export const DEFAULT_LOAD_TASKS: LoadTask[] = [pixiWarmUpTask, cardArtTask];
