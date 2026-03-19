"use client";

import { ChevronRight, X } from "lucide-react";
import { useCallback, useState } from "react";

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
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.subitems && item.subitems.length > 0;

  return (
    <>
      <div className="flex items-center hover:bg-white/10 transition-colors">
        {hasChildren && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors"
            style={{ marginLeft: `${0.5 + depth * 1.25}rem` }}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronRight
              size={14}
              className={`transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        )}
        <button
          type="button"
          onClick={() => onNavigate(item.href)}
          className="flex-1 text-left py-2 pr-4 text-sm truncate"
          style={{ paddingLeft: hasChildren ? "0.25rem" : `${1 + depth * 1.25}rem` }}
          title={item.label.trim()}
        >
          {item.label.trim()}
        </button>
      </div>
      {hasChildren && expanded &&
        item.subitems!.map((sub) => (
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
