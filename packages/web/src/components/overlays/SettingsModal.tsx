import React, { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { useSettings, isElectron, WINDOW_PRESETS } from '../../settings/SettingsContext.js';
import type { ThemeId, WindowSizeId } from '../../settings/SettingsContext.js';

interface SettingsModalProps {
  onClose: () => void;
  /** True while a game session is active — disables destructive data actions. */
  midGame: boolean;
  hasSave: boolean;
  onClearSave: () => void;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-1 mb-3">
      {children}
    </div>
  );
}

function VolumeRow({
  label,
  id,
  volume,
  muted,
  onVolumeChange,
  onMuteToggle,
}: {
  label: string;
  id: string;
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onMuteToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="text-xs font-mono text-gray-400 w-14 shrink-0">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={Math.round(volume * 100)}
        onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
        disabled={muted}
        className="flex-1 accent-cyan-500 disabled:opacity-30"
        aria-label={`${label} volume`}
      />
      <span className="text-xs font-mono text-gray-500 w-9 text-right tabular-nums">
        {Math.round(volume * 100)}%
      </span>
      <button
        onClick={onMuteToggle}
        className={`text-xs font-mono px-2 py-1 rounded border transition-colors w-16 ${
          muted
            ? 'border-red-700 bg-red-950 text-red-400 hover:bg-red-900'
            : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700'
        }`}
        aria-pressed={muted}
        aria-label={`${muted ? 'Unmute' : 'Mute'} ${label}`}
      >
        {muted ? 'MUTED' : 'MUTE'}
      </button>
    </div>
  );
}

export function SettingsModal({ onClose, midGame, hasSave, onClearSave }: SettingsModalProps) {
  const { settings, updateSettings } = useSettings();
  const [confirmClear, setConfirmClear] = useState(false);
  const electron = isElectron();

  const clearDisabled = midGame || !hasSave;

  return (
    <FocusTrap
      focusTrapOptions={{
        onDeactivate: onClose,
        initialFocus: '#settings-close-btn',
        escapeDeactivates: true,
      }}
    >
      <div
        className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="border border-cyan-900 bg-gray-950 rounded-lg p-6 max-w-sm w-full shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2
              id="settings-title"
              className="text-cyan-400 text-lg font-bold font-mono tracking-widest"
            >
              SETTINGS
            </h2>
            <button
              id="settings-close-btn"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 font-mono text-xl leading-none px-2 py-0.5 rounded hover:bg-gray-800 transition-colors"
              aria-label="Close settings"
            >
              ×
            </button>
          </div>

          <div className="flex flex-col gap-6">
            {/* ── AUDIO ─────────────────────────────────────────────────── */}
            <section aria-label="Audio settings">
              <SectionHeader>Audio</SectionHeader>
              <div className="flex flex-col gap-3">
                <VolumeRow
                  label="SFX"
                  id="settings-sfx-volume"
                  volume={settings.sfxVolume}
                  muted={settings.sfxMuted}
                  onVolumeChange={(v) => updateSettings({ sfxVolume: v })}
                  onMuteToggle={() => updateSettings({ sfxMuted: !settings.sfxMuted })}
                />
                <VolumeRow
                  label="Music"
                  id="settings-music-volume"
                  volume={settings.musicVolume}
                  muted={settings.musicMuted}
                  onVolumeChange={(v) => updateSettings({ musicVolume: v })}
                  onMuteToggle={() => updateSettings({ musicMuted: !settings.musicMuted })}
                />
              </div>
            </section>

            {/* ── ACCESSIBILITY ─────────────────────────────────────────── */}
            <section aria-label="Accessibility settings">
              <SectionHeader>Accessibility</SectionHeader>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  id="settings-reduced-motion"
                  checked={settings.reducedMotion}
                  onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
                  className="accent-cyan-500 w-4 h-4 mt-0.5 shrink-0"
                />
                <span>
                  <span className="text-sm font-mono text-gray-200 group-hover:text-white transition-colors">
                    Reduced Motion
                  </span>
                  <span className="block text-xs font-mono text-gray-500 mt-0.5">
                    Skips card draw animations
                  </span>
                </span>
              </label>
            </section>

            {/* ── DISPLAY ───────────────────────────────────────────────── */}
            <section aria-label="Display settings">
              <SectionHeader>Display</SectionHeader>
              <div className="flex flex-col gap-3">
                {/* Theme */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-400 w-20 shrink-0">Theme</span>
                  <div className="flex rounded overflow-hidden border border-gray-700">
                    {(['dark', 'light'] as ThemeId[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => updateSettings({ theme: t })}
                        className={`px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-widest transition-colors ${
                          settings.theme === t
                            ? 'bg-cyan-700 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                        aria-pressed={settings.theme === t}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fullscreen / Borderless Window */}
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    id="settings-fullscreen"
                    checked={settings.fullscreen}
                    onChange={(e) => updateSettings({ fullscreen: e.target.checked })}
                    className="accent-cyan-500 w-4 h-4 shrink-0"
                  />
                  <span className="text-sm font-mono text-gray-200 group-hover:text-white transition-colors">
                    {electron ? 'Borderless Window' : 'Fullscreen'}
                  </span>
                </label>

                {/* Window size — Electron only */}
                {electron && (
                  <div className="flex items-center gap-3">
                    <label
                      htmlFor="settings-window-size"
                      className="text-xs font-mono text-gray-400 w-20 shrink-0"
                    >
                      Resolution
                    </label>
                    <select
                      id="settings-window-size"
                      value={settings.windowSize}
                      onChange={(e) =>
                        updateSettings({ windowSize: e.target.value as WindowSizeId })
                      }
                      className="flex-1 bg-gray-800 border border-gray-700 text-gray-200 font-mono text-xs rounded px-2 py-1.5 focus:border-cyan-700 focus:outline-none"
                    >
                      {WINDOW_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </section>

            {/* ── DATA ──────────────────────────────────────────────────── */}
            <section aria-label="Data settings">
              <SectionHeader>Data</SectionHeader>
              {!confirmClear ? (
                <button
                  onClick={() => setConfirmClear(true)}
                  disabled={clearDisabled}
                  aria-disabled={clearDisabled}
                  title={
                    midGame
                      ? 'Cannot clear save during an active game'
                      : !hasSave
                        ? 'No save data to clear'
                        : undefined
                  }
                  className={`w-full px-4 py-2 rounded font-mono font-bold text-sm border transition-colors ${
                    clearDisabled
                      ? 'border-gray-800 bg-gray-900 text-gray-600 cursor-not-allowed opacity-50'
                      : 'border-red-800 bg-red-950 text-red-400 hover:bg-red-900 hover:border-red-700'
                  }`}
                >
                  CLEAR SAVE DATA
                </button>
              ) : (
                <div className="border border-red-800 rounded p-3 bg-red-950/40">
                  <p className="text-xs font-mono text-red-300 mb-3">
                    This will permanently delete your save. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onClearSave();
                        setConfirmClear(false);
                      }}
                      className="flex-1 px-3 py-1.5 rounded font-mono font-bold text-xs bg-red-700 hover:bg-red-600 text-white transition-colors"
                    >
                      CONFIRM
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="flex-1 px-3 py-1.5 rounded font-mono font-bold text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
