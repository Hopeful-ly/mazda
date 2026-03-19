"use client";

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
      readerFlowMode: debouncedPrefs.flowMode as "paginated" | "scrolled",
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
