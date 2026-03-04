import type { GameContext, StorageAdapter } from '@load/game-core';
import { LocalStorageAdapter } from './storage/LocalStorageAdapter.js';

export const SAVE_KEY = 'load-save';

export function saveGame(
  context: GameContext,
  storage: StorageAdapter = LocalStorageAdapter,
): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(context));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}

export function loadGame(
  storage: StorageAdapter = LocalStorageAdapter,
): GameContext | null {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GameContext;
  } catch {
    return null;
  }
}

export function clearSave(
  storage: StorageAdapter = LocalStorageAdapter,
): void {
  storage.removeItem(SAVE_KEY);
}
