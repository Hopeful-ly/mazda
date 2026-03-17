"use client";

import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface DropdownItem {
  key?: string;
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

export type DropdownEntry = DropdownItem | "divider";

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownEntry[];
  align?: "left" | "right";
  className?: string;
}

let dividerCounter = 0;

const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(
  ({ trigger, items, align = "left", className }, ref) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const close = useCallback(() => setOpen(false), []);

    useEffect(() => {
      if (!open) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)
        ) {
          close();
        }
      };
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") close();
      };
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }, [open, close]);

    return (
      <div ref={ref} className={cn("relative inline-block", className)}>
        <div ref={containerRef}>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex items-center"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            {trigger}
          </button>
        </div>

        {open && (
          <div
            role="menu"
            className={cn(
              "absolute top-full z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-background py-1 shadow-lg",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            {items.map((item) => {
              if (item === "divider") {
                return (
                  <div
                    key={`divider-${++dividerCounter}`}
                    className="my-1 border-t border-border"
                  />
                );
              }
              return (
                <button
                  key={item.key ?? item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    "hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
                    item.danger
                      ? "text-danger hover:bg-danger/5"
                      : "text-foreground",
                  )}
                  onClick={() => {
                    item.onClick();
                    close();
                  }}
                >
                  {item.icon && (
                    <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);

Dropdown.displayName = "Dropdown";

export { Dropdown };
