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
                  {bm.label || (bm.page != null ? `Page ${bm.page}` : "Bookmark")}
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
