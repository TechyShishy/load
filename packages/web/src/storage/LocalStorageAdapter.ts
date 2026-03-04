import type { StorageAdapter } from '@load/game-core';

/**
 * StorageAdapter backed by window.localStorage.
 * Used by the web and mobile (Capacitor WebView) targets.
 */
export const LocalStorageAdapter: StorageAdapter = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};
