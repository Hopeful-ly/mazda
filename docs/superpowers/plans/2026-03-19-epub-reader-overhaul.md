# EPUB Reader Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace epub.js with foliate-js and redesign the reader for rock-solid mobile and desktop UX.

**Architecture:** Vendor foliate-js into `public/foliate-js/` as native ES modules. Create a React wrapper that manages the `<foliate-view>` custom element imperatively. Redesign the toolbar as a bottom sheet on mobile with progress slider. Keep all existing backend APIs unchanged.

**Tech Stack:** foliate-js (rendering), React 19 (UI), Tailwind CSS (styling), tRPC (data), Prisma (persistence)

**Spec:** `docs/superpowers/specs/2026-03-19-epub-reader-overhaul-design.md`

---

### Task 1: Vendor foliate-js

**Files:**
- Create: `public/foliate-js/` (entire library)

- [ ] **Step 1: Clone foliate-js into public directory**

Clone the entire repo into `public/foliate-js/`. The library uses native ES modules with internal relative imports, so all files must be present. Remove non-essential files (tests, CI, rollup config) but keep all `.js` files and the `vendor/` directory intact.

```bash
cd /home/hopeful/dev/umami-turtle/mazda
git clone --depth 1 https://github.com/johnfactotum/foliate-js.git public/foliate-js
rm -rf public/foliate-js/.git public/foliate-js/.github public/foliate-js/tests public/foliate-js/rollup public/foliate-js/rollup.config.js public/foliate-js/eslint.config.js public/foliate-js/.gitignore public/foliate-js/.gitattributes
```

Note the commit hash of the version vendored for future reference. Do NOT use git submodules — vendor directly so the library is self-contained.

- [ ] **Step 2: Verify the files load**

Start the dev server and open browser console:
```js
await import('/foliate-js/view.js')
// Should register <foliate-view> custom element without errors
```

- [ ] **Step 3: Commit**

```bash
git add public/foliate-js/
git commit -m "chore: vendor foliate-js for EPUB rendering"
```

---

### Task 2: Add CSP headers

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add Content-Security-Policy header**

foliate-js loads EPUB content into iframes. Malicious EPUBs can contain scripts. CSP prevents them from executing in our origin.

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        // Apply CSP only to the reader route
        source: "/reader/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "script-src 'self' 'unsafe-eval' 'unsafe-inline'; object-src 'none';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

Note: `'unsafe-eval'` and `'unsafe-inline'` are needed for Next.js itself. The key protection is `object-src 'none'` and the fact that EPUB iframe content gets its own restrictive CSP from foliate-js's iframe sandboxing. Read the Next.js docs at `node_modules/next/dist/docs/` for the correct headers API before implementing.

- [ ] **Step 2: Commit**

```bash
git add next.config.ts
git commit -m "feat: add CSP headers for reader security"
```

---

### Task 3: Extend preferences schema

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/constants.ts`
- Modify: `src/server/routers/reader.ts`

- [ ] **Step 1: Add new fields to UserPreferences model**

In `prisma/schema.prisma`, add to the `UserPreferences` model after `readerColumns`:

```prisma
  readerFlowMode String @default("paginated") // paginated, scrolled
  readerMaxWidth Int    @default(720)          // px
  readerMargin   Int    @default(5)            // percentage
```

- [ ] **Step 2: Generate and run migration**

```bash
npx prisma migrate dev --name add_reader_flow_margin_prefs
```

- [ ] **Step 3: Update constants**

In `src/lib/constants.ts`, add after `READER_FONTS`:

```ts
export const READER_FLOW_MODES = [
  { value: "paginated", label: "Paginated" },
  { value: "scrolled", label: "Scroll" },
] as const;

export const READER_MAX_WIDTH_RANGE = { min: 400, max: 1200, step: 40 } as const;
export const READER_MARGIN_RANGE = { min: 0, max: 15, step: 1 } as const;
```

- [ ] **Step 4: Update reader router preferences mutation**

In `src/server/routers/reader.ts`, add to the `updatePreferences` input schema:

```ts
readerFlowMode: z.enum(["paginated", "scrolled"]).optional(),
readerMaxWidth: z.number().min(400).max(1200).optional(),
readerMargin: z.number().min(0).max(15).optional(),
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/lib/constants.ts src/server/routers/reader.ts
git commit -m "feat: add reader flow mode, max width, margin preferences"
```

---

### Task 4: Build the foliate-reader React wrapper

This is the core component. It manages the `<foliate-view>` custom element imperatively.

**Files:**
- Create: `src/components/reader/foliate-reader.tsx`

- [ ] **Step 1: Create the component file**

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { READER_FONTS, READER_THEMES } from "@/lib/constants";

export interface ReaderPreferences {
  theme: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  columns: number;
  flowMode: string;
  maxWidth: number;
  margin: number;
}

export interface FoliateReaderHandle {
  nextPage: () => void;
  prevPage: () => void;
  goTo: (target: string) => void;
  goToFraction: (fraction: number) => void;
}

interface FoliateReaderProps {
  bookUrl: string;
  initialCfi?: string;
  onLocationChange: (progress: number, cfi: string) => void;
  preferences: ReaderPreferences;
  onTocLoaded?: (toc: TocNode[]) => void;
  onTextSelected?: (cfi: string, text: string, position: { x: number; y: number }) => void;
  onToggleControls?: () => void;
  onAnnotationClick?: (annotation: { value: string }) => void;
  annotations?: Array<{ value: string; color: string }>;
}

export interface TocNode {
  label: string;
  href: string;
  subitems?: TocNode[];
}

/** Min ms between nav actions */
const NAV_THROTTLE_MS = 250;

export const FoliateReader = forwardRef<FoliateReaderHandle, FoliateReaderProps>(
  function FoliateReader(
    {
      bookUrl,
      initialCfi,
      onLocationChange,
      preferences,
      onTocLoaded,
      onTextSelected,
      onToggleControls,
      onAnnotationClick,
      annotations,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<any>(null);
    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState("");
    const lastNavTimeRef = useRef(0);

    // Store callbacks in refs to avoid re-init
    const onLocationChangeRef = useRef(onLocationChange);
    onLocationChangeRef.current = onLocationChange;
    const onTocLoadedRef = useRef(onTocLoaded);
    onTocLoadedRef.current = onTocLoaded;
    const onTextSelectedRef = useRef(onTextSelected);
    onTextSelectedRef.current = onTextSelected;
    const onToggleControlsRef = useRef(onToggleControls);
    onToggleControlsRef.current = onToggleControls;
    const onAnnotationClickRef = useRef(onAnnotationClick);
    onAnnotationClickRef.current = onAnnotationClick;

    const initialCfiRef = useRef(initialCfi);
    const preferencesRef = useRef(preferences);
    preferencesRef.current = preferences;

    const throttledNav = useCallback((fn: () => void) => {
      const now = Date.now();
      if (now - lastNavTimeRef.current < NAV_THROTTLE_MS) return;
      lastNavTimeRef.current = now;
      fn();
    }, []);

    useImperativeHandle(ref, () => ({
      nextPage: () => throttledNav(() => viewRef.current?.next()),
      prevPage: () => throttledNav(() => viewRef.current?.prev()),
      goTo: (target: string) => viewRef.current?.goTo(target),
      goToFraction: (f: number) => viewRef.current?.goToFraction(f),
    }));

    // Initialize foliate-view
    useEffect(() => {
      let cancelled = false;
      const container = containerRef.current;
      if (!container) return;

      async function init() {
        try {
          setLoadError("");

          // Dynamic import from public/, bypassing the bundler
          await import(/* webpackIgnore: true */ "/foliate-js/view.js");
          if (cancelled) return;

          // Fetch the book as a blob
          const response = await fetch(bookUrl);
          if (!response.ok) throw new Error(`Failed to load book (${response.status})`);
          const blob = await response.blob();
          if (cancelled) return;

          // Create the custom element
          const view = document.createElement("foliate-view") as any;
          view.style.cssText = "width:100%;height:100%;";
          container.appendChild(view);
          viewRef.current = view;

          // Open the book
          await view.open(blob);
          if (cancelled) return;

          // Apply initial preferences to renderer
          const prefs = preferencesRef.current;
          applyPreferences(view, prefs);

          // Initialize with saved position
          const cfi = initialCfiRef.current;
          await view.init({ lastLocation: cfi || undefined });
          if (cancelled) return;

          // TOC
          const toc = view.book?.toc;
          if (toc) onTocLoadedRef.current?.(toc);

          // Listen for location changes
          view.addEventListener("relocate", (e: CustomEvent) => {
            if (cancelled) return;
            const { fraction, cfi } = e.detail;
            const percent = (fraction ?? 0) * 100;
            onLocationChangeRef.current(percent, cfi ?? "");
          });

          // Listen for text selection (via the loaded document)
          view.addEventListener("load", (e: CustomEvent) => {
            const { doc } = e.detail;
            if (!doc) return;

            // Tap zones for navigation
            doc.addEventListener("pointerup", (pe: PointerEvent) => {
              // Skip if text is selected
              const sel = doc.getSelection?.();
              if (sel && sel.toString().trim()) {
                // Fire text selected callback with pointer position for popover
                const range = sel.getRangeAt(0);
                const text = sel.toString().trim();
                if (text && range) {
                  const index = e.detail.index;
                  const cfi = view.getCFI(index, range);
                  // Use the pointer event coordinates (already in viewport space)
                  // for positioning the selection popover
                  const iframeRect = view.getBoundingClientRect();
                  onTextSelectedRef.current?.(cfi, text, {
                    x: pe.clientX + iframeRect.left,
                    y: pe.clientY + iframeRect.top,
                  });
                }
                return;
              }

              // Skip links
              const target = pe.target as Element;
              if (target?.closest?.("a[href]")) return;

              // Tap zones (only for short, non-drag interactions)
              if (pe.pointerType === "touch" || pe.pointerType === "mouse") {
                const rect = doc.documentElement.getBoundingClientRect();
                const x = pe.clientX / rect.width;
                const y = pe.clientY / rect.height;

                // Center zone: toggle controls
                if (x > 0.25 && x < 0.75 && y > 0.2 && y < 0.8) {
                  onToggleControlsRef.current?.();
                  return;
                }

                // Side zones: navigate (mouse only, touch swipe is handled by paginator)
                if (pe.pointerType === "mouse") {
                  if (x < 0.25) view.goLeft();
                  else if (x > 0.75) view.goRight();
                }
              }
            });
          });

          // Annotation clicks
          view.addEventListener("show-annotation", (e: CustomEvent) => {
            onAnnotationClickRef.current?.(e.detail);
          });

          // External links: open in new tab
          view.addEventListener("external-link", (e: CustomEvent) => {
            e.preventDefault();
            window.open(e.detail.href, "_blank", "noopener");
          });

          if (!cancelled) setReady(true);
        } catch (error) {
          if (!cancelled) {
            setLoadError(
              error instanceof Error ? error.message : "Failed to load book",
            );
          }
        }
      }

      init();

      return () => {
        cancelled = true;
        // Clean up: remove the foliate-view element
        const view = viewRef.current;
        if (view) {
          view.close?.();
          view.remove();
          viewRef.current = null;
        }
        setReady(false);
      };
    }, [bookUrl]);

    // Apply preference changes to live renderer
    useEffect(() => {
      const view = viewRef.current;
      if (!view || !ready) return;
      applyPreferences(view, preferences);
    }, [preferences, ready]);

    // Sync annotations
    useEffect(() => {
      const view = viewRef.current;
      if (!view || !ready || !annotations) return;

      // Clear existing and re-add
      for (const ann of annotations) {
        view.addAnnotation(ann).catch(() => {});
      }
    }, [annotations, ready]);

    // Draw annotation handler
    useEffect(() => {
      const view = viewRef.current;
      if (!view || !ready) return;

      const handleDraw = async (e: CustomEvent) => {
        const { draw, annotation } = e.detail;
        // Dynamic import overlayer for draw functions
        const { Overlayer } = await import(
          /* webpackIgnore: true */ "/foliate-js/overlayer.js"
        );
        draw(Overlayer.highlight, { color: annotation.color || "yellow" });
      };

      view.addEventListener("draw-annotation", handleDraw);
      return () => view.removeEventListener("draw-annotation", handleDraw);
    }, [ready]);

    // Keyboard navigation
    useEffect(() => {
      if (!ready) return;
      const view = viewRef.current;
      if (!view) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        switch (e.key) {
          case "ArrowRight":
          case "ArrowDown":
            e.preventDefault();
            view.goRight();
            break;
          case "ArrowLeft":
          case "ArrowUp":
            e.preventDefault();
            view.goLeft();
            break;
          case " ":
            e.preventDefault();
            if (e.shiftKey) view.prev();
            else view.next();
            break;
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [ready]);

    // Note: foliate-view handles resize internally via its own ResizeObserver.
    // No additional resize handling is needed.

    const theme = READER_THEMES.find((t) => t.value === preferences.theme);
    const bg = theme?.bg ?? "#FFFFFF";
    const text = theme?.text ?? "#1A1A1A";

    return (
      <div
        className="relative w-full h-full select-none"
        style={{ background: bg, color: text }}
      >
        {/* foliate-view container */}
        <div ref={containerRef} className="w-full h-full" />

        {/* Desktop-only hover navigation arrows */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); viewRef.current?.goLeft(); }}
          className="absolute left-0 top-0 h-full w-12 items-center justify-center
            opacity-0 hover:opacity-100 transition-opacity z-10 hidden md:flex"
          style={{ color: text }}
          aria-label="Previous page"
        >
          <ChevronLeft size={28} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); viewRef.current?.goRight(); }}
          className="absolute right-0 top-0 h-full w-12 items-center justify-center
            opacity-0 hover:opacity-100 transition-opacity z-10 hidden md:flex"
          style={{ color: text }}
          aria-label="Next page"
        >
          <ChevronRight size={28} />
        </button>

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            {loadError ? (
              <div className="rounded bg-black/60 px-3 py-2 text-sm text-red-300">
                {loadError}
              </div>
            ) : (
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-current border-t-transparent" />
            )}
          </div>
        )}
      </div>
    );
  },
);

/** Apply reader preferences to the foliate-view instance */
function applyPreferences(view: any, prefs: ReaderPreferences) {
  const renderer = view.renderer;
  if (!renderer) return;

  const theme = READER_THEMES.find((t) => t.value === prefs.theme);
  const font = READER_FONTS.find((f) => f.value === prefs.fontFamily);
  const bg = theme?.bg ?? "#FFFFFF";
  const text = theme?.text ?? "#1A1A1A";
  const family = font?.family ?? "Georgia, serif";

  // Flow mode
  renderer.setAttribute("flow", prefs.flowMode || "paginated");

  // Layout
  renderer.setAttribute("max-inline-size", `${prefs.maxWidth}px`);
  renderer.setAttribute("gap", `${prefs.margin}%`);
  renderer.setAttribute("max-column-count", String(prefs.columns));

  // Animated page transitions (paginated only)
  if (prefs.flowMode === "paginated") {
    renderer.setAttribute("animated", "");
  } else {
    renderer.removeAttribute("animated");
  }

  // Inject theme/font CSS
  const css = `
    html {
      color-scheme: ${prefs.theme === "dark" || prefs.theme === "nord" ? "dark" : "light"};
    }
    body {
      font-family: ${family} !important;
      font-size: ${prefs.fontSize}px !important;
      line-height: ${prefs.lineHeight} !important;
      color: ${text} !important;
      background: ${bg} !important;
    }
    p, div, span, li, td, th, h1, h2, h3, h4, h5, h6, blockquote {
      color: inherit !important;
    }
    a { color: ${text} !important; }
  `;
  renderer.setStyles(css);

  // Set container background to match
  const container = view.parentElement;
  if (container) {
    container.style.background = bg;
    container.style.color = text;
  }
}
```

- [ ] **Step 2: Verify it renders an EPUB**

Open the reader page with an EPUB book. The foliate-view element should appear and render pages. Swipe left/right on mobile should turn pages (handled by foliate-js paginator). Tap center should toggle controls (once wired up in a later task).

- [ ] **Step 3: Commit**

```bash
git add src/components/reader/foliate-reader.tsx
git commit -m "feat: add foliate-reader component wrapping foliate-js"
```

---

### Task 5: Redesign the toolbar

The toolbar becomes a bottom sheet on mobile (thumb-reachable) and remains a top bar on desktop. Includes a progress slider.

**Files:**
- Rewrite: `src/components/reader/reader-toolbar.tsx`

- [ ] **Step 1: Rewrite the toolbar**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reader/reader-toolbar.tsx
git commit -m "feat: redesign reader toolbar with bottom sheet and progress slider"
```

---

### Task 6: Create selection popover for highlights

Instead of auto-saving highlights on any text selection, show a popover with color choices.

**Files:**
- Create: `src/components/reader/selection-popover.tsx`

- [ ] **Step 1: Create the popover component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

const HIGHLIGHT_COLORS = [
  { value: "yellow", bg: "#FDE68A" },
  { value: "green", bg: "#86EFAC" },
  { value: "blue", bg: "#93C5FD" },
  { value: "pink", bg: "#F9A8D4" },
  { value: "orange", bg: "#FDBA74" },
];

interface SelectionPopoverProps {
  /** Screen coordinates where the selection ends */
  position: { x: number; y: number } | null;
  selectedText: string;
  onHighlight: (color: string) => void;
  onDismiss: () => void;
}

export function SelectionPopover({
  position,
  selectedText,
  onHighlight,
  onDismiss,
}: SelectionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    // Delay to avoid immediately dismissing
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside as any);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside as any);
    };
  }, [position, onDismiss]);

  if (!position || !selectedText) return null;

  // Position the popover above the selection point, centered
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.max(8, Math.min(position.x, window.innerWidth - 180)),
    top: Math.max(8, position.y - 50),
    zIndex: 60,
  };

  return (
    <div ref={popoverRef} style={style} className="animate-[fadeIn_150ms_ease-out]">
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-neutral-800/95 backdrop-blur shadow-xl border border-white/10">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            onClick={() => onHighlight(color.value)}
            className="w-7 h-7 rounded-full border-2 border-transparent hover:border-white/50 transition-all hover:scale-110 active:scale-95"
            style={{ backgroundColor: color.bg }}
            aria-label={`Highlight ${color.value}`}
            title={color.value}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reader/selection-popover.tsx
git commit -m "feat: add selection popover for highlight color choice"
```

---

### Task 7: Create bookmark panel

**Files:**
- Create: `src/components/reader/bookmark-panel.tsx`

- [ ] **Step 1: Create the bookmark panel**

```tsx
"use client";

import { Bookmark, Trash2, X } from "lucide-react";

interface BookmarkItem {
  id: string;
  label?: string | null;
  cfi?: string | null;
  page?: number | null;
  position?: number | null;
  createdAt: string | Date;
}

interface BookmarkPanelProps {
  bookmarks: BookmarkItem[];
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (bookmark: BookmarkItem) => void;
  onRemove: (id: string) => void;
}

export function BookmarkPanel({
  bookmarks,
  isOpen,
  onClose,
  onNavigate,
  onRemove,
}: BookmarkPanelProps) {
  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
          aria-label="Close bookmarks"
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-72 max-w-[80vw] bg-neutral-900 text-neutral-100 z-50 shadow-2xl
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold tracking-wide uppercase flex items-center gap-2">
            <Bookmark size={16} />
            Bookmarks
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-3.25rem)]">
          {bookmarks.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-400">
              No bookmarks yet. Tap the bookmark icon to add one.
            </p>
          ) : (
            bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="flex items-center gap-2 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onNavigate(bm)}
                  className="flex-1 text-left text-sm truncate"
                >
                  {bm.label || `Page ${bm.page ?? "?"}` || "Bookmark"}
                </button>
                <span className="text-xs text-neutral-500 shrink-0">
                  {new Date(bm.createdAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(bm.id)}
                  className="p-1 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors shrink-0"
                  aria-label="Remove bookmark"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reader/bookmark-panel.tsx
git commit -m "feat: add bookmark panel UI"
```

---

### Task 8: Wire everything up in the reader page

This is the integration task. Completely rewrite the reader page to use FoliateReader, wire up all new components.

**Files:**
- Rewrite: `src/app/(app)/reader/[id]/page.tsx`

- [ ] **Step 1: Rewrite the reader page with the complete file below**

```tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookmarkPanel } from "@/components/reader/bookmark-panel";
import { ComicViewer } from "@/components/reader/comic-viewer";
import {
  FoliateReader,
  type FoliateReaderHandle,
  type ReaderPreferences,
  type TocNode,
} from "@/components/reader/foliate-reader";
import { PdfViewer } from "@/components/reader/pdf-viewer";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { SelectionPopover } from "@/components/reader/selection-popover";
import { TextReader } from "@/components/reader/text-reader";
import { type TocItem, TocPanel } from "@/components/reader/toc-panel";
import { Spinner } from "@/components/ui/spinner";
import { useDebounce } from "@/hooks/useDebounce";
import { trpc } from "@/lib/trpc";

const DEFAULT_PREFERENCES: ReaderPreferences = {
  theme: "light",
  fontFamily: "serif",
  fontSize: 16,
  lineHeight: 1.6,
  columns: 1,
  flowMode: "paginated",
  maxWidth: 720,
  margin: 5,
};

function mapFoliateToc(items: TocNode[], parentId = "toc"): TocItem[] {
  return items.map((item, i) => ({
    id: `${parentId}-${i}`,
    label: item.label,
    href: item.href,
    subitems: item.subitems
      ? mapFoliateToc(item.subitems, `${parentId}-${i}`)
      : [],
  }));
}

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const readerRef = useRef<FoliateReaderHandle>(null);
  const utils = trpc.useUtils();

  // --- State ---
  const [preferences, setPreferences] =
    useState<ReaderPreferences>(DEFAULT_PREFERENCES);
  const [progress, setProgress] = useState(0);
  const [currentCfi, setCurrentCfi] = useState("");
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Selection popover state
  const [selectionState, setSelectionState] = useState<{
    cfi: string;
    text: string;
    position: { x: number; y: number };
  } | null>(null);

  // Progress save debounce
  const [savePayload, setSavePayload] = useState<{
    progress: number;
    currentCfi: string;
    currentPage?: number;
  } | null>(null);
  const lastSavedRef = useRef<typeof savePayload>(null);

  // --- tRPC queries ---
  const { data: user } = trpc.auth.me.useQuery();
  const { data: book, isLoading: isBookLoading } = trpc.books.get.useQuery(
    { id },
    { enabled: !!id },
  );
  const { data: readerProgress, isLoading: isProgressLoading } =
    trpc.reader.getProgress.useQuery({ bookId: id }, { enabled: !!id });
  const { data: bookmarks = [] } = trpc.reader.getBookmarks.useQuery(
    { bookId: id },
    { enabled: !!id },
  );
  const { data: highlights = [] } = trpc.reader.getHighlights.useQuery(
    { bookId: id },
    { enabled: !!id },
  );

  // --- tRPC mutations ---
  const saveProgress = trpc.reader.saveProgress.useMutation({
    onSuccess: () => setSaveError(""),
    onError: (error) => setSaveError(error.message),
  });
  const addHighlight = trpc.reader.addHighlight.useMutation({
    onSuccess: () => utils.reader.getHighlights.invalidate(),
  });
  const addBookmark = trpc.reader.addBookmark.useMutation({
    onSuccess: () => utils.reader.getBookmarks.invalidate(),
  });
  const removeBookmark = trpc.reader.removeBookmark.useMutation({
    onSuccess: () => utils.reader.getBookmarks.invalidate(),
  });
  const savePreferences = trpc.reader.updatePreferences.useMutation();

  // --- Derived state ---
  const isBookmarked = bookmarks.some((bm) => bm.cfi === currentCfi);
  const highlightAnnotations = highlights
    .filter((h) => h.cfiRange)
    .map((h) => ({ value: h.cfiRange!, color: h.color ?? "yellow" }));

  // --- Load saved preferences ---
  useEffect(() => {
    if (!user?.preferences) return;
    setPreferences({
      theme: user.preferences.readerTheme,
      fontFamily: user.preferences.readerFontFamily,
      fontSize: user.preferences.readerFontSize,
      lineHeight: user.preferences.readerLineHeight,
      columns: user.preferences.readerColumns,
      flowMode: (user.preferences as any).readerFlowMode ?? "paginated",
      maxWidth: (user.preferences as any).readerMaxWidth ?? 720,
      margin: (user.preferences as any).readerMargin ?? 5,
    });
  }, [user?.preferences]);

  // --- Load saved progress ---
  useEffect(() => {
    if (!readerProgress) return;
    setProgress(readerProgress.progress ?? 0);
    setCurrentCfi(readerProgress.currentCfi ?? "");
  }, [readerProgress]);

  // --- Debounced progress save ---
  const debouncedSavePayload = useDebounce(savePayload, 2000);

  useEffect(() => {
    if (!debouncedSavePayload) return;
    const last = lastSavedRef.current;
    const sameCfi = (last?.currentCfi ?? "") === debouncedSavePayload.currentCfi;
    const samePage = (last?.currentPage ?? null) === (debouncedSavePayload.currentPage ?? null);
    const closeProgress = last != null && Math.abs(last.progress - debouncedSavePayload.progress) < 0.2;
    if (sameCfi && samePage && closeProgress) return;

    saveProgress.mutate({
      bookId: id,
      progress: debouncedSavePayload.progress,
      currentCfi: debouncedSavePayload.currentCfi || undefined,
      currentPage: debouncedSavePayload.currentPage,
    });
    lastSavedRef.current = debouncedSavePayload;
  }, [debouncedSavePayload, id, saveProgress]);

  // --- Debounced preferences save ---
  const debouncedPrefs = useDebounce(preferences, 1000);

  useEffect(() => {
    if (!user) return;
    savePreferences.mutate({
      readerTheme: debouncedPrefs.theme,
      readerFontFamily: debouncedPrefs.fontFamily,
      readerFontSize: debouncedPrefs.fontSize,
      readerLineHeight: debouncedPrefs.lineHeight,
      readerColumns: debouncedPrefs.columns,
      readerFlowMode: debouncedPrefs.flowMode,
      readerMaxWidth: debouncedPrefs.maxWidth,
      readerMargin: debouncedPrefs.margin,
    });
  }, [debouncedPrefs]);

  // --- Handlers ---
  function handleLocationChange(nextProgress: number, cfi: string) {
    setProgress(nextProgress);
    setCurrentCfi(cfi);
    setSaveError("");
    setSavePayload({ progress: nextProgress, currentCfi: cfi });
  }

  function handleTextSelected(
    cfi: string,
    text: string,
    position: { x: number; y: number },
  ) {
    if (!text.trim()) return;
    setSelectionState({ cfi, text: text.trim(), position });
  }

  function handleHighlight(color: string) {
    if (!selectionState) return;
    addHighlight.mutate({
      bookId: id,
      text: selectionState.text,
      cfiRange: selectionState.cfi,
      color,
    });
    setSelectionState(null);
  }

  function handleToggleBookmark() {
    const existing = bookmarks.find((bm) => bm.cfi === currentCfi);
    if (existing) {
      removeBookmark.mutate({ id: existing.id });
    } else {
      addBookmark.mutate({
        bookId: id,
        cfi: currentCfi || undefined,
        position: progress,
      });
    }
  }

  function handleProgressScrub(fraction: number) {
    readerRef.current?.goToFraction(fraction);
  }

  function handleTocNavigate(href: string) {
    if (!href) return;
    readerRef.current?.goTo(href);
  }

  function handlePagedProgress(nextProgress: number, page: number) {
    setProgress(nextProgress);
    setSavePayload({
      progress: nextProgress,
      currentCfi: "",
      currentPage: page,
    });
  }

  // --- Loading / not found states ---
  if (isBookLoading || isProgressLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="rounded-lg border border-border bg-background p-6">
        <p className="text-sm text-muted-foreground">Book not found.</p>
      </div>
    );
  }

  // --- Formats that use the foliate reader ---
  const useFoliateReader = book.format === "EPUB" || book.format === "MOBI";

  return (
    <div className="fixed inset-0 z-20 bg-background">
      <ReaderToolbar
        preferences={preferences}
        onPreferencesChange={setPreferences}
        onToggleToc={() => setTocOpen((prev) => !prev)}
        onToggleBookmarks={() => setBookmarksOpen((prev) => !prev)}
        bookTitle={book.title}
        progress={progress}
        onBack={() => router.push(`/books/${id}`)}
        visible={controlsVisible}
        onToggleVisibility={() => setControlsVisible((v) => !v)}
        onProgressScrub={handleProgressScrub}
        isBookmarked={isBookmarked}
        onToggleBookmark={handleToggleBookmark}
      />

      {useFoliateReader && (
        <>
          <TocPanel
            toc={toc}
            onNavigate={handleTocNavigate}
            isOpen={tocOpen}
            onClose={() => setTocOpen(false)}
          />

          <BookmarkPanel
            bookmarks={bookmarks}
            isOpen={bookmarksOpen}
            onClose={() => setBookmarksOpen(false)}
            onNavigate={(bm) => {
              if (bm.cfi) readerRef.current?.goTo(bm.cfi);
              setBookmarksOpen(false);
            }}
            onRemove={(bmId) => removeBookmark.mutate({ id: bmId })}
          />

          <FoliateReader
            ref={readerRef}
            bookUrl={`/api/books/${id}/content`}
            initialCfi={currentCfi || undefined}
            onLocationChange={handleLocationChange}
            onTextSelected={handleTextSelected}
            preferences={preferences}
            onTocLoaded={(items) => setToc(mapFoliateToc(items))}
            onToggleControls={() => setControlsVisible((v) => !v)}
            annotations={highlightAnnotations}
          />

          <SelectionPopover
            position={selectionState?.position ?? null}
            selectedText={selectionState?.text ?? ""}
            onHighlight={handleHighlight}
            onDismiss={() => setSelectionState(null)}
          />
        </>
      )}

      {book.format === "PDF" && (
        <PdfViewer
          bookUrl={`/api/books/${id}/content`}
          initialPage={readerProgress?.currentPage ?? 1}
          onProgress={handlePagedProgress}
        />
      )}

      {(book.format === "CBZ" || book.format === "CBR") && (
        <ComicViewer
          bookUrl={`/api/books/${id}/content`}
          initialPage={readerProgress?.currentPage ?? 1}
          onProgress={handlePagedProgress}
        />
      )}

      {(book.format === "TXT" || book.format === "MARKDOWN") && (
        <TextReader
          bookUrl={`/api/books/${id}/content`}
          isMarkdown={book.format === "MARKDOWN"}
          preferences={preferences}
          onProgress={(nextProgress) => {
            setProgress(nextProgress);
            setSavePayload({ progress: nextProgress, currentCfi: "" });
          }}
        />
      )}

      {saveError && (
        <div className="pointer-events-none fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-md bg-red-900/90 px-3 py-1.5 text-xs text-red-200 shadow">
          Save failed: {saveError}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Test all features manually**

Verify:
- EPUB loads and renders
- Swipe left/right turns pages on mobile
- Tap center toggles toolbar
- Arrow keys navigate on desktop, hover arrows appear on edge hover
- Progress slider scrubs to position
- Settings (theme, font, size, line height, flow mode, margins, width) apply live
- Scroll mode works
- Bookmarks: add, remove, navigate via panel
- Text selection shows color popover, highlight saves with chosen color
- Existing highlights render as overlays in the book
- TOC navigation works
- Progress saves and restores on reload
- MOBI books render via foliate reader (no more "not supported" message)
- Preferences auto-save after 1 second of inactivity

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/reader/\[id\]/page.tsx
git commit -m "feat: wire up foliate reader with bookmarks, highlights, and new toolbar"
```

---

### Task 9: Clean up old epub.js code

**Files:**
- Delete: `src/components/reader/epub-reader.tsx`
- Modify: `package.json` (remove `epubjs` dependency)

- [ ] **Step 1: Delete the old epub reader component**

```bash
rm src/components/reader/epub-reader.tsx
```

- [ ] **Step 2: Remove epubjs from package.json**

Remove `"epubjs": "^0.3.93"` from dependencies.

```bash
npm uninstall epubjs
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Ensure no imports reference `epubjs` or `epub-reader.tsx`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove epub.js dependency, replaced by foliate-js"
```

---

### Task 10: Polish and edge cases

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx` (or root layout)
- Modify: `src/components/reader/toc-panel.tsx`

- [ ] **Step 1: Add safe-area-inset CSS for notched phones**

The toolbar uses `safe-area-top` and `safe-area-bottom` classes. Add to `src/app/globals.css`:

```css
.safe-area-top { padding-top: env(safe-area-inset-top); }
.safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }
```

Also ensure the `<meta name="viewport">` in the root layout includes `viewport-fit=cover`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

- [ ] **Step 2: Add fadeIn keyframe for selection popover**

The selection popover uses `animate-[fadeIn_150ms_ease-out]`. Add the keyframe to `src/app/globals.css`:

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: Make TOC panel theme-aware**

The TOC panel currently hardcodes dark theme colors (`bg-neutral-900 text-neutral-100`). Update `src/components/reader/toc-panel.tsx` to accept an optional `theme` prop or use neutral colors that work for both light and dark:

Change the panel's outer `div` class to use `bg-neutral-900/95 backdrop-blur` (consistent with toolbar), which works well enough for all reader themes since the panel overlays the content.

This is a minor tweak — the dark panel works well as a contrast overlay regardless of reader theme.

- [ ] **Step 4: Final manual test pass**

Test on:
- Mobile browser (Chrome/Safari): swipe navigation, tap zones, toolbar bottom sheet, safe areas on notched phones
- Desktop browser: keyboard nav, hover arrows on edge hover, progress slider, all settings
- Test with several different EPUBs (small, large, fixed-layout, RTL if available)
- Test MOBI format if a MOBI book is available
- Verify highlights persist across page reloads and render as colored overlays
- Verify bookmarks persist and navigating to a bookmark works

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: polish reader with safe areas, animation, theme consistency"
```
