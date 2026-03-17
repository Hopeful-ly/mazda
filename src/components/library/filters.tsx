"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterState {
  search: string;
  format: string;
  status: string;
  sortBy: string;
}

interface FiltersProps {
  value: FilterState;
  onChange: (filters: FilterState) => void;
  className?: string;
}

const formats = [
  { value: "", label: "All Formats" },
  { value: "EPUB", label: "EPUB" },
  { value: "PDF", label: "PDF" },
  { value: "MOBI", label: "MOBI" },
  { value: "CBZ", label: "CBZ" },
  { value: "CBR", label: "CBR" },
  { value: "TXT", label: "TXT" },
];

const statuses = [
  { value: "", label: "All Statuses" },
  { value: "WANT_TO_READ", label: "Want to Read" },
  { value: "READING", label: "Reading" },
  { value: "FINISHED", label: "Finished" },
  { value: "DROPPED", label: "Dropped" },
];

const sortOptions = [
  { value: "createdAt", label: "Recently Added" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "progress", label: "Progress" },
  { value: "lastReadAt", label: "Last Read" },
];

const selectClasses =
  "h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export function Filters({ value, onChange, className }: FiltersProps) {
  function update(patch: Partial<FilterState>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search books..."
          value={value.search}
          onChange={(e) => update({ search: e.target.value })}
          className={cn(selectClasses, "w-full pl-9")}
        />
      </div>

      {/* Format filter */}
      <select
        value={value.format}
        onChange={(e) => update({ format: e.target.value })}
        className={selectClasses}
        aria-label="Filter by format"
      >
        {formats.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Status filter */}
      <select
        value={value.status}
        onChange={(e) => update({ status: e.target.value })}
        className={selectClasses}
        aria-label="Filter by status"
      >
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {/* Sort */}
      <select
        value={value.sortBy}
        onChange={(e) => update({ sortBy: e.target.value })}
        className={selectClasses}
        aria-label="Sort by"
      >
        {sortOptions.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
