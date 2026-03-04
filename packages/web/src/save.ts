import type { GameContext, StorageAdapter } from '@load/game-core';
import { GameContextSchema } from '@load/game-core';
import { LocalStorageAdapter } from './storage/LocalStorageAdapter.js';

export const SAVE_KEY = 'load-save';

export function saveGame(
  context: GameContext,
  storage: StorageAdapter = LocalStorageAdapter,
): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(context));
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
    // Cast is safe: Zod has validated the runtime shape. The type mismatch is a
    // known Zod + exactOptionalPropertyTypes incompatibility (Zod infers
    // optional fields as `T | undefined` rather than absent-key-only).
    return result.data as GameContext;
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
