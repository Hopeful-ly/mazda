"use client";

import { X } from "lucide-react";
import { useCallback } from "react";

export interface TocItem {
  id: string;
  label: string;
  href: string;
  subitems?: TocItem[];
}

interface TocPanelProps {
  toc: TocItem[];
  onNavigate: (href: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

function TocEntry({
  item,
  depth,
  onNavigate,
}: {
  item: TocItem;
  depth: number;
  onNavigate: (href: string) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onNavigate(item.href)}
        className="w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors truncate"
        style={{ paddingLeft: `${1 + depth * 1.25}rem` }}
        title={item.label.trim()}
      >
        {item.label.trim()}
      </button>
      {item.subitems?.map((sub) => (
        <TocEntry
          key={sub.id}
          item={sub}
          depth={depth + 1}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

export function TocPanel({ toc, onNavigate, isOpen, onClose }: TocPanelProps) {
  const handleNavigate = useCallback(
    (href: string) => {
      onNavigate(href);
      onClose();
    },
    [onNavigate, onClose],
  );

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
          aria-label="Close table of contents"
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-72 max-w-[80vw] bg-neutral-900 text-neutral-100 z-50 shadow-2xl
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Table of Contents
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

        <nav className="overflow-y-auto h-[calc(100%-3.25rem)]">
          {toc.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-400">
              No table of contents available.
            </p>
          ) : (
            toc.map((item) => (
              <TocEntry
                key={item.id}
                item={item}
                depth={0}
                onNavigate={handleNavigate}
              />
            ))
          )}
        </nav>
      </div>
    </>
  );
}
