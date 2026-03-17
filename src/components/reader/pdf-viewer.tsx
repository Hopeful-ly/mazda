"use client";

import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface PdfViewerProps {
  bookUrl: string;
  initialPage?: number;
  onPageChange?: (page: number, totalPages: number) => void;
  onProgress?: (progress: number, page: number) => void;
}

interface PdfLoadSuccess {
  numPages: number;
}

export function PdfViewer({
  bookUrl,
  initialPage = 1,
  onPageChange,
  onProgress,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [scale, setScale] = useState(1.1);
  const [rotation, setRotation] = useState(0);
  const [Pdf, setPdf] = useState<typeof import("react-pdf")["Document"] | null>(
    null,
  );
  const [PdfPage, setPdfPage] = useState<
    typeof import("react-pdf")["Page"] | null
  >(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const reactPdf = await import("react-pdf");
      const pdfjs = await import("react-pdf").then((m) => m.pdfjs);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      if (mounted) {
        setPdf(() => reactPdf.Document);
        setPdfPage(() => reactPdf.Page);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!numPages) return;
    const clamped = Math.min(Math.max(pageNumber, 1), numPages);
    const progress = (clamped / numPages) * 100;
    onPageChange?.(clamped, numPages);
    onProgress?.(progress, clamped);
  }, [pageNumber, numPages, onPageChange, onProgress]);

  const canPrev = pageNumber > 1;
  const canNext = pageNumber < numPages;

  const status = useMemo(() => {
    if (!numPages) return "Loading PDF...";
    return `Page ${pageNumber} / ${numPages}`;
  }, [numPages, pageNumber]);

  const Doc = Pdf;
  const PageCmp = PdfPage;

  return (
    <div className="flex h-full w-full flex-col bg-neutral-950 text-neutral-100">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="text-xs text-neutral-300">{status}</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded p-1.5 hover:bg-white/10"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="w-12 text-center text-xs">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="rounded p-1.5 hover:bg-white/10"
            onClick={() => setScale((s) => Math.min(3, s + 0.1))}
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            className="rounded p-1.5 hover:bg-white/10"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            aria-label="Rotate"
          >
            <RotateCw size={16} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-auto">
        {!Doc || !PageCmp ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            Loading viewer...
          </div>
        ) : (
          <Doc
            file={bookUrl}
            onLoadSuccess={({ numPages: total }: PdfLoadSuccess) => {
              setNumPages(total);
              setPageNumber(Math.min(Math.max(initialPage, 1), total));
            }}
            loading={
              <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                Loading PDF...
              </div>
            }
            error={
              <div className="flex h-full items-center justify-center text-sm text-red-400">
                Failed to load PDF
              </div>
            }
            className="flex min-h-full items-start justify-center p-4"
          >
            <PageCmp
              pageNumber={pageNumber}
              scale={scale}
              rotate={rotation}
              renderTextLayer
              renderAnnotationLayer
            />
          </Doc>
        )}

        <button
          type="button"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded bg-black/50 p-2 text-white hover:bg-black/70 disabled:opacity-40"
          onClick={() => canPrev && setPageNumber((p) => p - 1)}
          disabled={!canPrev}
          aria-label="Previous page"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-black/50 p-2 text-white hover:bg-black/70 disabled:opacity-40"
          onClick={() => canNext && setPageNumber((p) => p + 1)}
          disabled={!canNext}
          aria-label="Next page"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
