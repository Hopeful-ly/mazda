"use client";

import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Columns2,
  List,
  Minus,
  Plus,
  ScrollText,
  Settings,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import {
  READER_FLOW_MODES,
  READER_FONTS,
  READER_MAX_WIDTH_RANGE,
  READER_MARGIN_RANGE,
  READER_THEMES,
} from "@/lib/constants";
import type { ReaderPreferences } from "./foliate-reader";

interface ReaderToolbarProps {
  preferences: ReaderPreferences;
  onPreferencesChange: (prefs: ReaderPreferences) => void;
  onToggleToc: () => void;
  onToggleBookmarks: () => void;
  bookTitle: string;
  progress: number;
  onBack: () => void;
  visible: boolean;
  onToggleVisibility: () => void;
  onProgressScrub: (fraction: number) => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
}

export function ReaderToolbar({
  preferences,
  onPreferencesChange,
  onToggleToc,
  onToggleBookmarks,
  bookTitle,
  progress,
  onBack,
  visible,
  onToggleVisibility,
  onProgressScrub,
  isBookmarked,
  onToggleBookmark,
}: ReaderToolbarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const update = useCallback(
    (patch: Partial<ReaderPreferences>) => {
      onPreferencesChange({ ...preferences, ...patch });
    },
    [preferences, onPreferencesChange],
  );

  return (
    <>
      {/* Top bar — always present, slides in/out */}
      <div
        role="toolbar"
        aria-label="Reader toolbar"
        className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out
          ${visible ? "translate-y-0" : "-translate-y-full"}`}
      >
        <div className="flex items-center gap-1 px-2 py-2 bg-neutral-900/95 backdrop-blur text-neutral-100 shadow-lg safe-area-top">
          <button type="button" onClick={onBack} className="p-2 rounded-md hover:bg-white/10 shrink-0" aria-label="Go back">
            <ArrowLeft size={20} />
          </button>
          <button type="button" onClick={onToggleToc} className="p-2 rounded-md hover:bg-white/10 shrink-0" aria-label="Table of contents">
            <List size={20} />
          </button>
          <span className="flex-1 text-sm truncate text-center px-1">{bookTitle}</span>
          <button
            type="button"
            onClick={onToggleBookmark}
            className={`p-2 rounded-md hover:bg-white/10 shrink-0 transition-colors ${isBookmarked ? "text-yellow-400" : ""}`}
            aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
          >
            <Bookmark size={20} fill={isBookmarked ? "currentColor" : "none"} />
          </button>
          <button type="button" onClick={onToggleBookmarks} className="p-2 rounded-md hover:bg-white/10 shrink-0" aria-label="Bookmarks list">
            <BookOpen size={20} />
          </button>
          <button
            type="button"
            onClick={onToggleVisibility}
            className="p-2 rounded-md hover:bg-white/10 shrink-0"
            aria-label="Close toolbar"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Bottom sheet — progress bar + settings */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out
          ${visible ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="bg-neutral-900/95 backdrop-blur text-neutral-100 shadow-lg safe-area-bottom">
          {/* Progress slider */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-400 tabular-nums shrink-0 w-10 text-right">
                {Math.round(progress)}%
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={progress}
                onChange={(e) => onProgressScrub(Number(e.target.value) / 100)}
                className="flex-1 h-1 accent-blue-400 cursor-pointer"
                aria-label="Reading progress"
              />
            </div>
          </div>

          {/* Settings toggle */}
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              className="flex items-center gap-1 px-3 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
              aria-label={settingsOpen ? "Hide settings" : "Show settings"}
            >
              <Settings size={14} />
              {settingsOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>

          {/* Settings panel */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out border-t border-white/10
              ${settingsOpen ? "max-h-[60vh] overflow-y-auto" : "max-h-0 border-t-transparent"}`}
          >
            <div className="px-4 py-4 space-y-5">
              {/* Theme selector */}
              <fieldset>
                <legend className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">Theme</legend>
                <div className="flex gap-3">
                  {READER_THEMES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => update({ theme: t.value })}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        preferences.theme === t.value ? "border-blue-400 scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: t.bg }}
                      aria-label={t.label}
                      title={t.label}
                    />
                  ))}
                </div>
              </fieldset>

              {/* Font family */}
              <fieldset>
                <legend className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">Font</legend>
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
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Font Size</span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => update({ fontSize: Math.max(12, preferences.fontSize - 1) })} className="p-1.5 rounded-md hover:bg-white/10" aria-label="Decrease font size">
                    <Minus size={16} />
                  </button>
                  <span className="text-sm tabular-nums w-8 text-center">{preferences.fontSize}</span>
                  <button type="button" onClick={() => update({ fontSize: Math.min(32, preferences.fontSize + 1) })} className="p-1.5 rounded-md hover:bg-white/10" aria-label="Increase font size">
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Line height */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Line Height</span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => update({ lineHeight: Math.max(1, Math.round((preferences.lineHeight - 0.1) * 10) / 10) })} className="p-1.5 rounded-md hover:bg-white/10" aria-label="Decrease line height">
                    <Minus size={16} />
                  </button>
                  <span className="text-sm tabular-nums w-8 text-center">{preferences.lineHeight.toFixed(1)}</span>
                  <button type="button" onClick={() => update({ lineHeight: Math.min(2.5, Math.round((preferences.lineHeight + 0.1) * 10) / 10) })} className="p-1.5 rounded-md hover:bg-white/10" aria-label="Increase line height">
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Flow mode */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Layout</span>
                <div className="flex items-center gap-2">
                  {READER_FLOW_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => update({ flowMode: mode.value })}
                      className={`px-3 py-1.5 rounded-md text-xs transition-colors flex items-center gap-1 ${
                        preferences.flowMode === mode.value
                          ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/50"
                          : "bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      {mode.value === "scrolled" ? <ScrollText size={14} /> : <Columns2 size={14} />}
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Columns (only in paginated mode) */}
              {preferences.flowMode === "paginated" && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Columns</span>
                  <div className="flex items-center gap-2">
                    {[1, 2].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => update({ columns: n })}
                        className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                          preferences.columns === n
                            ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/50"
                            : "bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reading width */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Reading Width</span>
                  <span className="text-xs text-neutral-400 tabular-nums">{preferences.maxWidth}px</span>
                </div>
                <input
                  type="range"
                  min={READER_MAX_WIDTH_RANGE.min}
                  max={READER_MAX_WIDTH_RANGE.max}
                  step={READER_MAX_WIDTH_RANGE.step}
                  value={preferences.maxWidth}
                  onChange={(e) => update({ maxWidth: Number(e.target.value) })}
                  className="w-full h-1 accent-blue-400"
                  aria-label="Reading width"
                />
              </div>

              {/* Margins */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Margins</span>
                  <span className="text-xs text-neutral-400 tabular-nums">{preferences.margin}%</span>
                </div>
                <input
                  type="range"
                  min={READER_MARGIN_RANGE.min}
                  max={READER_MARGIN_RANGE.max}
                  step={READER_MARGIN_RANGE.step}
                  value={preferences.margin}
                  onChange={(e) => update({ margin: Number(e.target.value) })}
                  className="w-full h-1 accent-blue-400"
                  aria-label="Margins"
                />
              </div>

              <p className="text-[11px] text-neutral-500">
                Arrow keys or swipe to turn pages. Tap center to toggle toolbar.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
