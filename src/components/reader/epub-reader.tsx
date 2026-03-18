"use client";

import type { NavItem, Rendition } from "epubjs";
import type Book from "epubjs/types/book";
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

interface ReaderPreferences {
  theme: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  columns: number;
}

interface EpubReaderProps {
  bookUrl: string;
  initialCfi?: string;
  onLocationChange: (progress: number, cfi: string) => void;
  preferences: ReaderPreferences;
  onTocLoaded?: (toc: NavItem[]) => void;
  onTextSelected?: (cfiRange: string, text: string) => void;
  onToggleControls?: () => void;
}

export interface EpubReaderHandle {
  nextPage: () => void;
  prevPage: () => void;
  goTo: (cfi: string) => void;
}

/** Minimum ms between navigation actions to prevent double-skip */
const NAV_THROTTLE_MS = 300;
/** Minimum horizontal px to count as a swipe */
const SWIPE_THRESHOLD = 50;
/** Max ms for a gesture to count as a swipe */
const SWIPE_MAX_TIME = 500;
/** Max px movement for a gesture to count as a tap */
const TAP_MAX_MOVE = 10;
/** Max ms for a gesture to count as a tap */
const TAP_MAX_TIME = 300;

function getThemeStyles(preferences: ReaderPreferences) {
  const theme = READER_THEMES.find((t) => t.value === preferences.theme);
  const font = READER_FONTS.find((f) => f.value === preferences.fontFamily);

  const bg = theme?.bg ?? "#FFFFFF";
  const text = theme?.text ?? "#1A1A1A";
  const family = font?.family ?? "Georgia, serif";

  return {
    bg,
    text,
    css: {
      body: {
        "font-family": `${family} !important`,
        "font-size": `${preferences.fontSize}px !important`,
        "line-height": `${preferences.lineHeight} !important`,
        color: `${text} !important`,
        background: `${bg} !important`,
      },
      "p, div, span, li, td, th, h1, h2, h3, h4, h5, h6, a, em, strong, blockquote":
        {
          color: `${text} !important`,
        },
      a: {
        color: `${text} !important`,
      },
    } as Record<string, Record<string, string>>,
  };
}

export const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(
  function EpubReader(
    {
      bookUrl,
      initialCfi,
      onLocationChange,
      preferences,
      onTocLoaded,
      onTextSelected,
      onToggleControls,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<Book | null>(null);
    const renditionRef = useRef<Rendition | null>(null);
    const objectUrlRef = useRef<string | null>(null);
    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState("");

    // Navigation throttle to prevent double page skips
    const lastNavTimeRef = useRef(0);

    // Store callbacks in refs so the init effect doesn't depend on them
    const onLocationChangeRef = useRef(onLocationChange);
    onLocationChangeRef.current = onLocationChange;
    const onTocLoadedRef = useRef(onTocLoaded);
    onTocLoadedRef.current = onTocLoaded;
    const onTextSelectedRef = useRef(onTextSelected);
    onTextSelectedRef.current = onTextSelected;
    const onToggleControlsRef = useRef(onToggleControls);
    onToggleControlsRef.current = onToggleControls;

    // Store initial values in refs (only used at init time)
    const initialCfiRef = useRef(initialCfi);
    initialCfiRef.current = initialCfi;
    const preferencesRef = useRef(preferences);
    preferencesRef.current = preferences;

    // Throttled navigation helpers
    const navigateNext = useCallback(() => {
      const now = Date.now();
      if (now - lastNavTimeRef.current < NAV_THROTTLE_MS) return;
      lastNavTimeRef.current = now;
      renditionRef.current?.next();
    }, []);

    const navigatePrev = useCallback(() => {
      const now = Date.now();
      if (now - lastNavTimeRef.current < NAV_THROTTLE_MS) return;
      lastNavTimeRef.current = now;
      renditionRef.current?.prev();
    }, []);

    // Refs for iframe event handlers (stable across renders)
    const navigateNextRef = useRef(navigateNext);
    navigateNextRef.current = navigateNext;
    const navigatePrevRef = useRef(navigatePrev);
    navigatePrevRef.current = navigatePrev;

    // Expose navigation methods
    useImperativeHandle(ref, () => ({
      nextPage: navigateNext,
      prevPage: navigatePrev,
      goTo(cfi: string) {
        renditionRef.current?.display(cfi);
      },
    }));

    // Initialize book
    useEffect(() => {
      let cancelled = false;

      async function init() {
        const mountElement = containerRef.current;
        if (!mountElement) return;

        try {
          setLoadError("");
          const ePub = (await import("epubjs")).default;
          if (cancelled) return;

          const response = await fetch(bookUrl);
          if (!response.ok) {
            throw new Error(`Failed to load EPUB (${response.status})`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const blob = new Blob([arrayBuffer], {
            type: "application/epub+zip",
          });
          const objectUrl = URL.createObjectURL(blob);
          objectUrlRef.current = objectUrl;

          const book = ePub();
          await book.open(arrayBuffer, "binary");
          bookRef.current = book;

          const { width, height } = mountElement.getBoundingClientRect();
          const prefs = preferencesRef.current;
          const themeStyles = getThemeStyles(prefs);

          const rendition = book.renderTo(mountElement, {
            width,
            height,
            spread: prefs.columns === 2 ? "auto" : "none",
            flow: "paginated",
          });

          renditionRef.current = rendition;

          // Content hook: fix stylesheets + inject touch/click handlers
          rendition.hooks.content.register(
            (contents: { document?: Document }) => {
              const doc = contents.document;
              if (!doc) return;

              // Fix missing <head> element
              if (!doc.head && doc.documentElement) {
                const head = doc.createElement("head");
                doc.documentElement.insertBefore(
                  head,
                  doc.documentElement.firstChild,
                );
              }

              // Fix stylesheet MIME types
              for (const link of doc.querySelectorAll(
                'link[rel="stylesheet"]',
              )) {
                const typed = link as HTMLLinkElement;
                if (!typed.type) {
                  typed.type = "text/css";
                }
              }

              // --- Touch gesture handling inside the epub iframe ---
              let touchStartX = 0;
              let touchStartY = 0;
              let touchStartTime = 0;

              doc.addEventListener(
                "touchstart",
                (e: TouchEvent) => {
                  if (e.touches.length !== 1) return;
                  touchStartX = e.touches[0].clientX;
                  touchStartY = e.touches[0].clientY;
                  touchStartTime = Date.now();
                },
                { passive: true },
              );

              doc.addEventListener(
                "touchend",
                (e: TouchEvent) => {
                  if (e.changedTouches.length !== 1) return;

                  // Don't navigate during text selection
                  const sel = doc.getSelection();
                  if (sel && sel.toString().trim()) return;

                  // Don't interfere with link taps
                  const target = e.target as Element;
                  if (target?.closest?.("a[href]")) return;

                  const touch = e.changedTouches[0];
                  const dx = touch.clientX - touchStartX;
                  const dy = touch.clientY - touchStartY;
                  const dt = Date.now() - touchStartTime;
                  const absDx = Math.abs(dx);
                  const absDy = Math.abs(dy);

                  // Horizontal swipe: primarily horizontal, >threshold, fast enough
                  if (
                    absDx > SWIPE_THRESHOLD &&
                    absDx > absDy * 1.5 &&
                    dt < SWIPE_MAX_TIME
                  ) {
                    e.preventDefault();
                    if (dx < 0) navigateNextRef.current();
                    else navigatePrevRef.current();
                    return;
                  }

                  // Tap: small movement, short duration
                  if (
                    absDx < TAP_MAX_MOVE &&
                    absDy < TAP_MAX_MOVE &&
                    dt < TAP_MAX_TIME
                  ) {
                    const docEl = doc.documentElement;
                    const w =
                      docEl?.clientWidth ?? window.innerWidth;
                    const h =
                      docEl?.clientHeight ?? window.innerHeight;
                    const xRatio = touch.clientX / w;
                    const yRatio = touch.clientY / h;

                    // Center zone → toggle controls
                    if (
                      xRatio > 0.25 &&
                      xRatio < 0.75 &&
                      yRatio > 0.2 &&
                      yRatio < 0.8
                    ) {
                      onToggleControlsRef.current?.();
                      return;
                    }

                    // Side zones → navigate
                    if (xRatio < 0.3) {
                      navigatePrevRef.current();
                    } else if (xRatio > 0.7) {
                      navigateNextRef.current();
                    }
                  }
                },
                { passive: false },
              );

              // Desktop: handle clicks inside the iframe
              doc.addEventListener("click", (e: MouseEvent) => {
                // Don't interfere with link clicks
                const target = e.target as Element;
                if (target?.closest?.("a[href]")) return;

                // Don't navigate during text selection
                const sel = doc.getSelection();
                if (sel && sel.toString().trim()) return;

                const docEl = doc.documentElement;
                const w = docEl?.clientWidth ?? window.innerWidth;
                const h =
                  docEl?.clientHeight ?? window.innerHeight;
                const xRatio = e.clientX / w;
                const yRatio = e.clientY / h;

                // Center zone → toggle controls
                if (
                  xRatio > 0.25 &&
                  xRatio < 0.75 &&
                  yRatio > 0.2 &&
                  yRatio < 0.8
                ) {
                  onToggleControlsRef.current?.();
                  return;
                }

                // Side zones → navigate
                if (xRatio < 0.3) {
                  navigatePrevRef.current();
                } else if (xRatio > 0.7) {
                  navigateNextRef.current();
                }
              });
            },
          );

          rendition.themes.default(themeStyles.css);

          const cfi = initialCfiRef.current;
          if (cfi) {
            await rendition.display(cfi);
          } else {
            await rendition.display();
          }

          if (cancelled) {
            book.destroy();
            return;
          }

          const navigation = await book.loaded.navigation;
          if (!cancelled) {
            onTocLoadedRef.current?.(navigation.toc);
          }

          await book.ready;
          if (!cancelled) {
            await book.locations.generate(1024);
          }

          rendition.on(
            "relocated",
            (location: { start: { cfi: string; percentage: number } }) => {
              if (!cancelled) {
                const percent = (location.start.percentage ?? 0) * 100;
                onLocationChangeRef.current(percent, location.start.cfi);
              }
            },
          );

          rendition.on(
            "selected",
            (
              cfiRange: string,
              _contents: { document?: Document },
            ) => {
              if (!cancelled) {
                const range = rendition.getRange(cfiRange);
                const text = range?.toString() ?? "";
                onTextSelectedRef.current?.(cfiRange, text);
              }
            },
          );

          rendition.on("displayError", () => {
            if (!cancelled) {
              setLoadError(
                "Some sections in this EPUB could not be rendered.",
              );
            }
          });

          if (!cancelled) setReady(true);
        } catch (error) {
          if (!cancelled) {
            setLoadError(
              error instanceof Error
                ? error.message
                : "Failed to load EPUB",
            );
          }
        }
      }

      init();

      return () => {
        cancelled = true;
        renditionRef.current = null;
        if (bookRef.current) {
          bookRef.current.destroy();
          bookRef.current = null;
        }
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        setReady(false);
      };
    }, [bookUrl]);

    // Apply theme/font changes to existing rendition
    useEffect(() => {
      const rendition = renditionRef.current;
      if (!rendition || !ready) return;

      const themeStyles = getThemeStyles(preferences);

      rendition.themes.default(themeStyles.css);

      // Also override spread setting
      rendition.spread(preferences.columns === 2 ? "auto" : "none");

      // Force re-render current location to apply changes
      const location = rendition.location;
      if (location?.start?.cfi) {
        rendition.display(location.start.cfi);
      }
    }, [preferences, ready]);

    // Handle window resize
    useEffect(() => {
      const container = containerRef.current;
      const rendition = renditionRef.current;
      if (!container || !rendition || !ready) return;

      let resizeTimer: ReturnType<typeof setTimeout>;

      const handleResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const { width, height } = container.getBoundingClientRect();
          rendition.resize(width, height);
        }, 200);
      };

      window.addEventListener("resize", handleResize);
      return () => {
        clearTimeout(resizeTimer);
        window.removeEventListener("resize", handleResize);
      };
    }, [ready]);

    // Keyboard navigation
    useEffect(() => {
      if (!ready) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          navigateNext();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          navigatePrev();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [ready, navigateNext, navigatePrev]);

    const theme = READER_THEMES.find((t) => t.value === preferences.theme);
    const bg = theme?.bg ?? "#FFFFFF";
    const text = theme?.text ?? "#1A1A1A";

    return (
      <div
        className="relative w-full h-full select-none"
        style={{ background: bg, color: text }}
      >
        {/* EPUB container */}
        <div ref={containerRef} className="w-full h-full" />

        {/* Desktop-only hover navigation arrows */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigatePrev();
          }}
          className="absolute left-0 top-0 h-full w-12 items-center justify-center
            opacity-0 hover:opacity-100 transition-opacity z-10 hidden md:flex"
          style={{ color: text }}
          aria-label="Previous page"
        >
          <ChevronLeft size={28} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigateNext();
          }}
          className="absolute right-0 top-0 h-full w-12 items-center justify-center
            opacity-0 hover:opacity-100 transition-opacity z-10 hidden md:flex"
          style={{ color: text }}
          aria-label="Next page"
        >
          <ChevronRight size={28} />
        </button>

        {/* Loading state */}
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
