import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAudio } from '../audio/AudioContext.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type ThemeId = 'dark' | 'light';
export type WindowSizeId = '1280x720' | '1280x800' | '1600x900' | '1920x1080';

export interface WindowPreset {
  id: WindowSizeId;
  label: string;
  width: number;
  height: number;
}

export const WINDOW_PRESETS: WindowPreset[] = [
  { id: '1280x720',  label: '1280 × 720',  width: 1280, height: 720  },
  { id: '1280x800',  label: '1280 × 800',  width: 1280, height: 800  },
  { id: '1600x900',  label: '1600 × 900',  width: 1600, height: 900  },
  { id: '1920x1080', label: '1920 × 1080', width: 1920, height: 1080 },
];

export interface Settings {
  sfxVolume: number;      // 0.0–1.0
  musicVolume: number;    // 0.0–1.0
  sfxMuted: boolean;
  musicMuted: boolean;
  reducedMotion: boolean;
  theme: ThemeId;
  windowSize: WindowSizeId;
  fullscreen: boolean;
}

// -----------------------------------------------------------------------------
// Electron API — augments window so TypeScript knows the shape
// -----------------------------------------------------------------------------

export interface ElectronAPI {
  quit: () => void;
  setWindowSize: (width: number, height: number) => void;
  setFullscreen: (enabled: boolean) => void;
  isElectron: true;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export const isElectron = (): boolean => Boolean(window.electronAPI?.isElectron);

// -----------------------------------------------------------------------------
// Persistence
// -----------------------------------------------------------------------------

const SETTINGS_KEY = 'load-settings';

function getDefaultSettings(): Settings {
  const osReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  return {
    sfxVolume: 1.0,
    musicVolume: 0.6,
    sfxMuted: false,
    musicMuted: false,
    reducedMotion: osReducedMotion,
    theme: 'dark',
    windowSize: '1280x800',
    fullscreen: false,
  };
}

const VALID_THEMES = new Set<string>(['dark', 'light']);
const VALID_WINDOW_SIZES = new Set<string>(WINDOW_PRESETS.map((p) => p.id));

function clampVolume(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return getDefaultSettings();
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const defaults = getDefaultSettings();
    return {
      sfxVolume:    clampVolume(saved['sfxVolume'] ?? defaults.sfxVolume, defaults.sfxVolume),
      musicVolume:  clampVolume(saved['musicVolume'] ?? defaults.musicVolume, defaults.musicVolume),
      sfxMuted:     Boolean(saved['sfxMuted']),
      musicMuted:   Boolean(saved['musicMuted']),
      reducedMotion: Boolean(saved['reducedMotion'] ?? defaults.reducedMotion),
      theme:        VALID_THEMES.has(String(saved['theme'])) ? String(saved['theme']) as ThemeId : defaults.theme,
      windowSize:   VALID_WINDOW_SIZES.has(String(saved['windowSize'])) ? String(saved['windowSize']) as WindowSizeId : defaults.windowSize,
      // fullscreen is runtime window-chrome state the OS never restores.
      // Always start windowed; the checkbox in Settings will set it explicitly.
      fullscreen: false,
    };
  } catch {
    return getDefaultSettings();
  }
}

function persistSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable — silently ignore
  }
}

// -----------------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------------

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const SettingsCtx = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const audio = useAudio();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  // Apply all side effects whenever settings change.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.setAttribute(
      'data-reduced-motion',
      settings.reducedMotion ? 'true' : 'false',
    );
    // Effective volume: 0 when the channel is muted, otherwise the stored level.
    audio.setMasterVolume(settings.sfxMuted ? 0 : settings.sfxVolume);
    audio.setMusicVolume(settings.musicMuted ? 0 : settings.musicVolume);
  }, [settings, audio]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };

      if (patch.windowSize !== undefined) {
        const preset = WINDOW_PRESETS.find((p) => p.id === next.windowSize);
        if (preset) window.electronAPI?.setWindowSize(preset.width, preset.height);
      }

      if (patch.fullscreen !== undefined) {
        if (window.electronAPI) {
          window.electronAPI.setFullscreen(next.fullscreen);
        } else {
          if (next.fullscreen && !document.fullscreenElement) {
            void document.documentElement.requestFullscreen().catch(() => undefined);
          } else if (!next.fullscreen && document.fullscreenElement) {
            void document.exitFullscreen().catch(() => undefined);
          }
        }
      }

      persistSettings(next);
      return next;
    });
  }, []);

  return (
    <SettingsCtx.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsCtx.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be called inside <SettingsProvider>');
  return ctx;
}
