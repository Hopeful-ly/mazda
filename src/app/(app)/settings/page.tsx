"use client";

import { Save, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { READER_FONTS, READER_THEMES } from "@/lib/constants";
import { trpc } from "@/lib/trpc";

export default function SettingsPage() {
  const router = useRouter();
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  const [theme, setTheme] = useState("light");
  const [fontFamily, setFontFamily] = useState("serif");
  const [fontSize, setFontSize] = useState(16);
  const [lineHeight, setLineHeight] = useState(1.6);
  const [columns, setColumns] = useState(1);
  const [libraryView, setLibraryView] = useState("grid");
  const [successMessage, setSuccessMessage] = useState("");

  // Populate form from existing preferences
  useEffect(() => {
    if (user?.preferences) {
      const p = user.preferences;
      setTheme(p.readerTheme);
      setFontFamily(p.readerFontFamily);
      setFontSize(p.readerFontSize);
      setLineHeight(p.readerLineHeight);
      setColumns(p.readerColumns);
      setLibraryView(p.libraryView);
    }
  }, [user]);

  const updatePreferences = trpc.reader.updatePreferences.useMutation({
    onSuccess: () => {
      setSuccessMessage("Preferences saved successfully.");
      setTimeout(() => setSuccessMessage(""), 3000);
    },
  });

  // Redirect unauthenticated users
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;

  function handleSave() {
    updatePreferences.mutate({
      readerTheme: theme,
      readerFontFamily: fontFamily,
      readerFontSize: fontSize,
      readerLineHeight: lineHeight,
      readerColumns: columns,
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
      </div>

      {/* Reader Preferences */}
      <section className="space-y-6 rounded-xl border border-border bg-background p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Reader Preferences
        </h2>

        {/* Theme Selector */}
        <fieldset className="space-y-3">
          <legend className="mb-1.5 block text-sm font-medium text-foreground">
            Theme
          </legend>
          <div className="flex flex-wrap gap-3">
            {READER_THEMES.map((t) => (
              <label
                key={t.value}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-2.5 transition-colors ${
                  theme === t.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={t.value}
                  checked={theme === t.value}
                  onChange={() => setTheme(t.value)}
                  className="sr-only"
                />
                <span
                  className="h-6 w-6 rounded-full border border-border"
                  style={{ background: t.bg }}
                  aria-hidden="true"
                />
                <span
                  className="h-3 w-3 -ml-4 rounded-full"
                  style={{ background: t.text }}
                  aria-hidden="true"
                />
                <span className="text-sm text-foreground">{t.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Font Family Selector */}
        <fieldset className="space-y-3">
          <legend className="mb-1.5 block text-sm font-medium text-foreground">
            Font Family
          </legend>
          <div className="flex flex-wrap gap-3">
            {READER_FONTS.map((f) => (
              <label
                key={f.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 transition-colors ${
                  fontFamily === f.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="fontFamily"
                  value={f.value}
                  checked={fontFamily === f.value}
                  onChange={() => setFontFamily(f.value)}
                  className="sr-only"
                />
                <span className="text-sm" style={{ fontFamily: f.family }}>
                  Aa
                </span>
                <span className="text-sm text-foreground">{f.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Font Size Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="fontSize"
              className="text-sm font-medium text-foreground"
            >
              Font Size
            </label>
            <span className="text-sm tabular-nums text-muted-foreground">
              {fontSize}px
            </span>
          </div>
          <input
            id="fontSize"
            type="range"
            min={10}
            max={32}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>10px</span>
            <span>32px</span>
          </div>
        </div>

        {/* Line Height Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="lineHeight"
              className="text-sm font-medium text-foreground"
            >
              Line Height
            </label>
            <span className="text-sm tabular-nums text-muted-foreground">
              {lineHeight.toFixed(1)}
            </span>
          </div>
          <input
            id="lineHeight"
            type="range"
            min={1.0}
            max={3.0}
            step={0.1}
            value={lineHeight}
            onChange={(e) => setLineHeight(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1.0</span>
            <span>3.0</span>
          </div>
        </div>

        {/* Columns */}
        <fieldset className="space-y-3">
          <legend className="mb-1.5 block text-sm font-medium text-foreground">
            Columns
          </legend>
          <div className="flex gap-3">
            {[1, 2].map((col) => (
              <label
                key={col}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 transition-colors ${
                  columns === col
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="columns"
                  value={col}
                  checked={columns === col}
                  onChange={() => setColumns(col)}
                  className="sr-only"
                />
                <span className="text-sm text-foreground">
                  {col} Column{col > 1 ? "s" : ""}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* Library Preferences */}
      <section className="space-y-6 rounded-xl border border-border bg-background p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Library Preferences
        </h2>

        <fieldset className="space-y-3">
          <legend className="mb-1.5 block text-sm font-medium text-foreground">
            Default View
          </legend>
          <div className="flex gap-3">
            {(["grid", "list"] as const).map((view) => (
              <label
                key={view}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 transition-colors ${
                  libraryView === view
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="libraryView"
                  value={view}
                  checked={libraryView === view}
                  onChange={() => setLibraryView(view)}
                  className="sr-only"
                />
                <span className="text-sm capitalize text-foreground">
                  {view}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* Save */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} loading={updatePreferences.isPending}>
          <Save className="h-4 w-4" />
          Save Preferences
        </Button>

        {successMessage && (
          <span className="text-sm font-medium text-success">
            {successMessage}
          </span>
        )}

        {updatePreferences.isError && (
          <span className="text-sm font-medium text-danger">
            {updatePreferences.error.message}
          </span>
        )}
      </div>
    </div>
  );
}
