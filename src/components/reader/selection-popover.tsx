"use client";

import { useEffect, useRef } from "react";

const HIGHLIGHT_COLORS = [
  { value: "yellow", bg: "#FDE68A" },
  { value: "green", bg: "#86EFAC" },
  { value: "blue", bg: "#93C5FD" },
  { value: "pink", bg: "#F9A8D4" },
  { value: "orange", bg: "#FDBA74" },
];

interface SelectionPopoverProps {
  /** Screen coordinates where the selection ends */
  position: { x: number; y: number } | null;
  selectedText: string;
  onHighlight: (color: string) => void;
  onDismiss: () => void;
}

export function SelectionPopover({
  position,
  selectedText,
  onHighlight,
  onDismiss,
}: SelectionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    // Delay to avoid immediately dismissing
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside as any);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside as any);
    };
  }, [position, onDismiss]);

  if (!position || !selectedText) return null;

  // Position the popover above the selection point, centered
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.max(8, Math.min(position.x, window.innerWidth - 180)),
    top: Math.max(8, position.y - 50),
    zIndex: 60,
  };

  return (
    <div ref={popoverRef} style={style} className="animate-[fadeIn_150ms_ease-out]">
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-neutral-800/95 backdrop-blur shadow-xl border border-white/10">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            onClick={() => onHighlight(color.value)}
            className="w-7 h-7 rounded-full border-2 border-transparent hover:border-white/50 transition-all hover:scale-110 active:scale-95"
            style={{ backgroundColor: color.bg }}
            aria-label={`Highlight ${color.value}`}
            title={color.value}
          />
        ))}
      </div>
    </div>
  );
}
