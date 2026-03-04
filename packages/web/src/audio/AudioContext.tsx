import React, { createContext, useContext, useMemo } from 'react';
import { AudioManager, type IAudioManager } from './AudioManager.js';

const AudioCtx = createContext<IAudioManager | null>(null);

/**
 * Instantiates a single AudioManager for the React tree below it.
 * Place this once near the root (e.g. wrapping <App />) so every consumer
 * receives the same manager instance without module-level singletons.
 */
export function AudioProvider({ children }: { children: React.ReactNode }) {
  // useMemo with [] guarantees one AudioManager for the lifetime of the provider.
  const manager = useMemo(() => new AudioManager(), []);
  return <AudioCtx.Provider value={manager}>{children}</AudioCtx.Provider>;
}

/**
 * Returns the nearest AudioManager from context.
 * Throws if called outside an <AudioProvider> so misconfiguration surfaces
 * immediately rather than silently dropping audio.
 */
export function useAudio(): IAudioManager {
  const manager = useContext(AudioCtx);
  if (!manager) {
    throw new Error('useAudio must be called inside <AudioProvider>');
  }
  return manager;
}

/** Re-export for tests that need to provide a stub via AudioCtx.Provider. */
export { AudioCtx };
