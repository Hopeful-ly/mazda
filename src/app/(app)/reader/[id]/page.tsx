"use client";

import type { NavItem } from "epubjs";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ComicViewer } from "@/components/reader/comic-viewer";
import {
  EpubReader,
  type EpubReaderHandle,
} from "@/components/reader/epub-reader";
import { PdfViewer } from "@/components/reader/pdf-viewer";
import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { TextReader } from "@/components/reader/text-reader";
import { type TocItem, TocPanel } from "@/components/reader/toc-panel";
import { Spinner } from "@/components/ui/spinner";
import { useDebounce } from "@/hooks/useDebounce";
import { trpc } from "@/lib/trpc";

type ReaderPreferences = {
  theme: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  columns: number;
};

const DEFAULT_PREFERENCES: ReaderPreferences = {
  theme: "light",
  fontFamily: "serif",
  fontSize: 16,
  lineHeight: 1.6,
  columns: 1,
};

function mapTocItems(items: NavItem[], parentId = "toc"): TocItem[] {
  return items.map((item, index) => {
    const id = `${parentId}-${index}`;
    return {
      id,
      label: item.label ?? "Untitled",
      href: item.href ?? "",
      subitems: item.subitems ? mapTocItems(item.subitems, id) : [],
    };
  });
}

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const readerRef = useRef<EpubReaderHandle>(null);

  const [preferences, setPreferences] =
    useState<ReaderPreferences>(DEFAULT_PREFERENCES);
  const [progress, setProgress] = useState(0);
  const [currentCfi, setCurrentCfi] = useState("");
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [savePayload, setSavePayload] = useState<{
    progress: number;
    currentCfi: string;
    currentPage?: number;
  } | null>(null);
  const [saveError, setSaveError] = useState("");
  const lastSavedRef = useRef<{
    progress: number;
    currentCfi: string;
    currentPage?: number;
  } | null>(null);

  const { data: user } = trpc.auth.me.useQuery();
  const { data: book, isLoading: isBookLoading } = trpc.books.get.useQuery(
    { id },
    { enabled: !!id },
  );
  const { data: readerProgress, isLoading: isProgressLoading } =
    trpc.reader.getProgress.useQuery({ bookId: id }, { enabled: !!id });

  const saveProgress = trpc.reader.saveProgress.useMutation({
    onSuccess() {
      setSaveError("");
    },
    onError(error) {
      setSaveError(error.message);
    },
  });

  const addHighlight = trpc.reader.addHighlight.useMutation();

  useEffect(() => {
    if (!user?.preferences) return;
    setPreferences({
      theme: user.preferences.readerTheme,
      fontFamily: user.preferences.readerFontFamily,
      fontSize: user.preferences.readerFontSize,
      lineHeight: user.preferences.readerLineHeight,
      columns: user.preferences.readerColumns,
    });
  }, [user?.preferences]);

  useEffect(() => {
    if (!readerProgress) return;
    setProgress(readerProgress.progress ?? 0);
    setCurrentCfi(readerProgress.currentCfi ?? "");
  }, [readerProgress]);

  const debouncedSavePayload = useDebounce(savePayload, 2000);

  useEffect(() => {
    if (!debouncedSavePayload) return;

    const last = lastSavedRef.current;
    const sameCfi =
      (last?.currentCfi ?? "") === debouncedSavePayload.currentCfi;
    const samePage =
      (last?.currentPage ?? null) ===
      (debouncedSavePayload.currentPage ?? null);
    const closeProgress =
      last != null &&
      Math.abs(last.progress - debouncedSavePayload.progress) < 0.2;

    if (sameCfi && samePage && closeProgress) return;

    saveProgress.mutate({
      bookId: id,
      progress: debouncedSavePayload.progress,
      currentCfi: debouncedSavePayload.currentCfi || undefined,
      currentPage: debouncedSavePayload.currentPage,
    });
    lastSavedRef.current = debouncedSavePayload;
  }, [debouncedSavePayload, id, saveProgress]);

  function handleLocationChange(nextProgress: number, cfi: string) {
    setProgress(nextProgress);
    setCurrentCfi(cfi);
    setSaveError("");
    setSavePayload({ progress: nextProgress, currentCfi: cfi });
  }

  function handleTextSelected(cfiRange: string, text: string) {
    const selected = text.trim();
    if (!selected) return;
    addHighlight.mutate({
      bookId: id,
      text: selected,
      cfiRange,
      color: "yellow",
    });
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

  return (
    <div className="fixed inset-0 z-20 bg-background">
      <ReaderToolbar
        preferences={preferences}
        onPreferencesChange={setPreferences}
        onToggleToc={() => setTocOpen((prev) => !prev)}
        bookTitle={book.title}
        progress={progress}
        onBack={() => router.push(`/books/${id}`)}
        visible={controlsVisible}
        onToggleVisibility={() => setControlsVisible((v) => !v)}
      />

      {book.format === "EPUB" && (
        <>
          <TocPanel
            toc={toc}
            onNavigate={handleTocNavigate}
            isOpen={tocOpen}
            onClose={() => setTocOpen(false)}
          />

          <EpubReader
            ref={readerRef}
            bookUrl={`/api/books/${id}/content`}
            initialCfi={currentCfi || undefined}
            onLocationChange={handleLocationChange}
            onTextSelected={handleTextSelected}
            preferences={preferences}
            onTocLoaded={(items) => setToc(mapTocItems(items))}
            onToggleControls={() => setControlsVisible((v) => !v)}
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

      {book.format === "MOBI" && (
        <div className="flex h-full items-center justify-center">
          <div className="mx-auto max-w-lg rounded-lg border border-border bg-background p-6">
            <h1 className="text-lg font-semibold text-foreground">Reader</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              MOBI rendering is not yet available in-browser. Download to read
              in a compatible app.
            </p>
            <Link
              href={`/books/${id}`}
              className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
            >
              Back to book
            </Link>
          </div>
        </div>
      )}

      {saveError && (
        <div className="pointer-events-none fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-md bg-red-900/90 px-3 py-1.5 text-xs text-red-200 shadow">
          Save failed: {saveError}
        </div>
      )}
    </div>
  );
}
