import React, { createContext, useContext, useEffect, useState } from 'react';
import { SynthAudioManager } from './SynthAudioManager.js';
import type { IAudioManager } from './AudioManager.js';

// Swap SynthAudioManager → AudioManager when public/audio/ assets are ready.
const AudioCtx = createContext<IAudioManager | null>(null);

/**
 * Instantiates a single AudioManager for the React tree below it.
 * Place this once near the root (e.g. wrapping <App />) so every consumer
 * receives the same manager instance without module-level singletons.
 */
export function AudioProvider({ children }: { children: React.ReactNode }) {
  // useState initializer runs once on mount. useEffect cleanup calls destroy()
  // when the provider unmounts so the AudioContext is properly closed.
  const [manager] = useState<SynthAudioManager>(() => new SynthAudioManager());
  useEffect(() => () => { manager.destroy(); }, [manager]);
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
