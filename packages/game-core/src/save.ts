import type { GameContext } from './types.js';

export const SAVE_KEY = 'load-save';

export function saveGame(context: GameContext): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(context));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}

export function loadGame(): GameContext | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GameContext;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
