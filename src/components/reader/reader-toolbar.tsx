"use client";

import { ArrowLeft, Columns2, List, Minus, Plus, Settings } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { READER_FONTS, READER_THEMES } from "@/lib/constants";

interface ReaderPreferences {
  theme: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  columns: number;
}

interface ReaderToolbarProps {
  preferences: ReaderPreferences;
  onPreferencesChange: (prefs: ReaderPreferences) => void;
  onToggleToc: () => void;
  bookTitle: string;
  progress: number;
  onBack: () => void;
  visible?: boolean;
  onToggleVisibility?: () => void;
}

export function ReaderToolbar({
  preferences,
  onPreferencesChange,
  onToggleToc,
  bookTitle,
  progress,
  onBack,
  visible,
  onToggleVisibility,
}: ReaderToolbarProps) {
  const [internalVisible, setInternalVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVisible = visible ?? internalVisible;

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setInternalVisible(false);
      setSettingsOpen(false);
    }, 3000);
  }, []);

  const show = useCallback(() => {
    setInternalVisible(true);
    resetHideTimer();
  }, [resetHideTimer]);

  // Expose toggle via center-tap zone
  const handleCenterTap = useCallback(() => {
    if (isVisible) {
      setInternalVisible(false);
      setSettingsOpen(false);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      show();
    }
  }, [isVisible, show]);

  // Reset timer on any interaction within the toolbar
  const handleInteraction = useCallback(() => {
    if (isVisible) resetHideTimer();
  }, [isVisible, resetHideTimer]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const update = useCallback(
    (patch: Partial<ReaderPreferences>) => {
      onPreferencesChange({ ...preferences, ...patch });
    },
    [preferences, onPreferencesChange],
  );

  return (
    <>
      {onToggleVisibility ? null : (
        <button
          type="button"
          aria-label="Toggle toolbar"
          className="fixed bottom-4 right-4 z-40 rounded-full bg-neutral-900/80 px-3 py-2 text-xs text-neutral-100 shadow hover:bg-neutral-800"
          onClick={handleCenterTap}
        >
          Menu
        </button>
      )}

      {/* Top bar */}
      <div
        role="toolbar"
        aria-label="Reader toolbar"
        className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out
          ${isVisible ? "translate-y-0" : "-translate-y-full"}`}
        onPointerMove={handleInteraction}
        onClick={handleInteraction}
        onKeyDown={handleInteraction}
      >
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900/95 backdrop-blur text-neutral-100 shadow-lg">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-md hover:bg-white/10 transition-colors shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>

          <button
            type="button"
            onClick={onToggleToc}
            className="p-2 rounded-md hover:bg-white/10 transition-colors shrink-0"
            aria-label="Table of contents"
          >
            <List size={20} />
          </button>

          <span className="flex-1 text-sm truncate text-center px-2">
            {bookTitle}
          </span>

          <span className="text-xs text-neutral-400 shrink-0 tabular-nums">
            {Math.round(progress)}%
          </span>

          <button
            type="button"
            onClick={() => setSettingsOpen((prev) => !prev)}
            className="p-2 rounded-md hover:bg-white/10 transition-colors shrink-0"
            aria-label="Settings"
          >
            <Settings size={20} />
          </button>
        </div>

        {/* Settings panel */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out bg-neutral-900/95 backdrop-blur text-neutral-100
            ${settingsOpen ? "max-h-80 border-t border-white/10" : "max-h-0"}`}
        >
          <div className="px-4 py-4 space-y-5">
            {/* Theme selector */}
            <fieldset>
              <legend className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">
                Theme
              </legend>
              <div className="flex gap-3">
                {READER_THEMES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => update({ theme: t.value })}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      preferences.theme === t.value
                        ? "border-blue-400 scale-110"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: t.bg }}
                    aria-label={t.label}
                    title={t.label}
                  />
                ))}
              </div>
            </fieldset>

            {/* Font family selector */}
            <fieldset>
              <legend className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">
                Font
              </legend>
              <div className="flex flex-wrap gap-2">
                {READER_FONTS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => update({ fontFamily: f.value })}
                    className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                      preferences.fontFamily === f.value
                        ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/50"
                        : "bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Font size */}
            <fieldset className="flex items-center justify-between">
              <legend className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Font Size
              </legend>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    update({ fontSize: Math.max(12, preferences.fontSize - 1) })
                  }
                  className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                  aria-label="Decrease font size"
                >
                  <Minus size={16} />
                </button>
                <span className="text-sm tabular-nums w-8 text-center">
                  {preferences.fontSize}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    update({ fontSize: Math.min(32, preferences.fontSize + 1) })
                  }
                  className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                  aria-label="Increase font size"
                >
                  <Plus size={16} />
                </button>
              </div>
            </fieldset>

            {/* Line height */}
            <fieldset className="flex items-center justify-between">
              <legend className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Line Height
              </legend>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    update({
                      lineHeight: Math.max(
                        1,
                        Math.round((preferences.lineHeight - 0.1) * 10) / 10,
                      ),
                    })
                  }
                  className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                  aria-label="Decrease line height"
                >
                  <Minus size={16} />
                </button>
                <span className="text-sm tabular-nums w-8 text-center">
                  {preferences.lineHeight.toFixed(1)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      lineHeight: Math.min(
                        2.5,
                        Math.round((preferences.lineHeight + 0.1) * 10) / 10,
                      ),
                    })
                  }
                  className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                  aria-label="Increase line height"
                >
                  <Plus size={16} />
                </button>
              </div>
            </fieldset>

            {/* Columns toggle */}
            <fieldset className="flex items-center justify-between">
              <legend className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Columns
              </legend>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => update({ columns: 1 })}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    preferences.columns === 1
                      ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/50"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  1
                </button>
                <button
                  type="button"
                  onClick={() => update({ columns: 2 })}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors flex items-center gap-1 ${
                    preferences.columns === 2
                      ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/50"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <Columns2 size={14} />2
                </button>
              </div>
            </fieldset>

            <p className="text-[11px] text-neutral-500">
              Tip: use arrow keys for page navigation.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
