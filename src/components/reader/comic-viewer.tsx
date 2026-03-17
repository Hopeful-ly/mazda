"use client";

import JSZip from "jszip";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

interface ComicViewerProps {
  bookUrl: string;
  initialPage?: number;
  onProgress?: (progress: number, page: number) => void;
}

function isImageFile(name: string) {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
}

export function ComicViewer({
  bookUrl,
  initialPage = 1,
  onProgress,
}: ComicViewerProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(Math.max(0, initialPage - 1));
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const urls: string[] = [];

    async function loadComic() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(bookUrl);
        if (!res.ok) throw new Error("Failed to load comic file");
        const buffer = await res.arrayBuffer();

        const zip = await JSZip.loadAsync(buffer);
        const imageEntries = Object.values(zip.files)
          .filter((f) => !f.dir && isImageFile(f.name))
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true }),
          );

        if (imageEntries.length === 0) {
          throw new Error("No image pages found in archive");
        }

        const pageUrls: string[] = [];
        for (const entry of imageEntries) {
          const blob = await entry.async("blob");
          const objectUrl = URL.createObjectURL(blob);
          urls.push(objectUrl);
          pageUrls.push(objectUrl);
        }

        if (mounted) {
          setPages(pageUrls);
          setPageIndex(
            Math.min(Math.max(initialPage - 1, 0), pageUrls.length - 1),
          );
        }
      } catch (e) {
        if (mounted)
          setError(e instanceof Error ? e.message : "Failed to load comic");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadComic();

    return () => {
      mounted = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [bookUrl, initialPage]);

  useEffect(() => {
    if (!pages.length) return;
    onProgress?.(((pageIndex + 1) / pages.length) * 100, pageIndex + 1);
  }, [pageIndex, pages.length, onProgress]);

  const canPrev = pageIndex > 0;
  const canNext = pageIndex < pages.length - 1;

  const status = useMemo(() => {
    if (loading) return "Loading comic...";
    if (!pages.length) return "No pages";
    return `Page ${pageIndex + 1} / ${pages.length}`;
  }, [loading, pages.length, pageIndex]);

  return (
    <div className="flex h-full w-full flex-col bg-black text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="text-xs text-neutral-300">{status}</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded p-1.5 hover:bg-white/10"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
          >
            <ZoomOut size={16} />
          </button>
          <span className="w-12 text-center text-xs">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="rounded p-1.5 hover:bg-white/10"
            onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            Loading comic...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-red-400">
            {error}
          </div>
        ) : pages[pageIndex] ? (
          <div className="flex min-h-full items-center justify-center p-4">
            <Image
              src={pages[pageIndex]}
              alt={`Comic page ${pageIndex + 1}`}
              width={1200}
              height={1800}
              unoptimized
              className="h-auto max-h-full w-auto max-w-full object-contain"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
              }}
            />
          </div>
        ) : null}

        <button
          type="button"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded bg-black/50 p-2 text-white hover:bg-black/70 disabled:opacity-40"
          onClick={() => canPrev && setPageIndex((p) => p - 1)}
          disabled={!canPrev}
          aria-label="Previous page"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-black/50 p-2 text-white hover:bg-black/70 disabled:opacity-40"
          onClick={() => canNext && setPageIndex((p) => p + 1)}
          disabled={!canNext}
          aria-label="Next page"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
