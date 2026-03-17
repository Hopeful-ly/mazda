"use client";

import type { Contents, NavItem, Rendition } from "epubjs";
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
}

export interface EpubReaderHandle {
  nextPage: () => void;
  prevPage: () => void;
  goTo: (cfi: string) => void;
}

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
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<Book | null>(null);
    const renditionRef = useRef<Rendition | null>(null);
    const [ready, setReady] = useState(false);

    // Store callbacks in refs so the init effect doesn't depend on them
    const onLocationChangeRef = useRef(onLocationChange);
    onLocationChangeRef.current = onLocationChange;
    const onTocLoadedRef = useRef(onTocLoaded);
    onTocLoadedRef.current = onTocLoaded;
    const onTextSelectedRef = useRef(onTextSelected);
    onTextSelectedRef.current = onTextSelected;

    // Store initial values in refs (only used at init time)
    const initialCfiRef = useRef(initialCfi);
    initialCfiRef.current = initialCfi;
    const preferencesRef = useRef(preferences);
    preferencesRef.current = preferences;

    // Expose navigation methods
    useImperativeHandle(ref, () => ({
      nextPage() {
        renditionRef.current?.next();
      },
      prevPage() {
        renditionRef.current?.prev();
      },
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

        const ePub = (await import("epubjs")).default;
        if (cancelled) return;

        const book = ePub(bookUrl);
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

        // Apply theme
        rendition.themes.default(themeStyles.css);

        // Navigate to initial position or start
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

        // Resolve TOC
        const navigation = await book.loaded.navigation;
        if (!cancelled) {
          onTocLoadedRef.current?.(navigation.toc);
        }

        // Generate locations for progress tracking
        await book.ready;
        if (!cancelled) {
          await book.locations.generate(1024);
        }

        // Track location changes
        rendition.on(
          "relocated",
          (location: { start: { cfi: string; percentage: number } }) => {
            if (!cancelled) {
              const percent = (location.start.percentage ?? 0) * 100;
              onLocationChangeRef.current(percent, location.start.cfi);
            }
          },
        );

        // Handle text selection
        rendition.on("selected", (cfiRange: string, _contents: Contents) => {
          if (!cancelled) {
            const range = rendition.getRange(cfiRange);
            const text = range?.toString() ?? "";
            onTextSelectedRef.current?.(cfiRange, text);
          }
        });

        if (!cancelled) setReady(true);
      }

      init();

      return () => {
        cancelled = true;
        renditionRef.current = null;
        if (bookRef.current) {
          bookRef.current.destroy();
          bookRef.current = null;
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
          renditionRef.current?.next();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          renditionRef.current?.prev();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [ready]);

    const handlePrev = useCallback(() => {
      renditionRef.current?.prev();
    }, []);

    const handleNext = useCallback(() => {
      renditionRef.current?.next();
    }, []);

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

        {/* Navigation arrows */}
        <button
          type="button"
          onClick={handlePrev}
          className="absolute left-0 top-0 h-full w-12 flex items-center justify-center
            opacity-0 hover:opacity-100 transition-opacity z-10"
          style={{ color: text }}
          aria-label="Previous page"
        >
          <ChevronLeft size={28} />
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="absolute right-0 top-0 h-full w-12 flex items-center justify-center
            opacity-0 hover:opacity-100 transition-opacity z-10"
          style={{ color: text }}
          aria-label="Next page"
        >
          <ChevronRight size={28} />
        </button>

        {/* Loading state */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-current border-t-transparent" />
          </div>
        )}
      </div>
    );
  },
);
