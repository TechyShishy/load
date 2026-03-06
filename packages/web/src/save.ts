import type { GameContext, SerializedGameContext, StorageAdapter } from '@load/game-core';
import { GameContextSchema, dehydrateContext, hydrateContext } from '@load/game-core';
import { LocalStorageAdapter } from './storage/LocalStorageAdapter.js';

export const SAVE_KEY = 'load-save';

export function saveGame(
  context: GameContext,
  storage: StorageAdapter = LocalStorageAdapter,
): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(dehydrateContext(context)));
  } catch {
    // Storage quota exceeded or unavailable --- silently ignore
  }
}

export function loadGame(
  storage: StorageAdapter = LocalStorageAdapter,
): GameContext | null {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const result = GameContextSchema.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    return hydrateContext(result.data as SerializedGameContext);
  } catch {
    return null;
  }
}

export function clearSave(
  storage: StorageAdapter = LocalStorageAdapter,
): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable — silently ignore
  }
}
