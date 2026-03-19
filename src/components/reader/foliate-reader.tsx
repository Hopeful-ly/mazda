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
