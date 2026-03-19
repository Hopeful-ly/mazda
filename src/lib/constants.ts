export const APP_NAME = "Mazda";

export const SUPPORTED_FORMATS = [
  ".epub",
  ".pdf",
  ".mobi",
  ".azw",
  ".azw3",
  ".cbz",
  ".cbr",
  ".txt",
  ".md",
] as const;

export const SUPPORTED_MIME_TYPES: Record<string, string> = {
  "application/epub+zip": "EPUB",
  "application/pdf": "PDF",
  "application/x-mobipocket-ebook": "MOBI",
  "application/vnd.comicbook+zip": "CBZ",
  "application/vnd.comicbook-rar": "CBR",
  "text/plain": "TXT",
  "text/markdown": "MARKDOWN",
};

export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export const READING_STATUSES = [
  { value: "WANT_TO_READ", label: "Want to Read", color: "#6366F1" },
  { value: "READING", label: "Reading", color: "#F59E0B" },
  { value: "FINISHED", label: "Finished", color: "#10B981" },
  { value: "DROPPED", label: "Dropped", color: "#EF4444" },
] as const;

export const READER_THEMES = [
  { value: "light", label: "Light", bg: "#FFFFFF", text: "#1A1A1A" },
  { value: "dark", label: "Dark", bg: "#1A1A1A", text: "#E5E5E5" },
  { value: "sepia", label: "Sepia", bg: "#F4ECD8", text: "#5B4636" },
  { value: "nord", label: "Nord", bg: "#2E3440", text: "#D8DEE9" },
] as const;

export const READER_FONTS = [
  {
    value: "serif",
    label: "Serif",
    family: "Georgia, 'Times New Roman', serif",
  },
  {
    value: "sans",
    label: "Sans Serif",
    family: "'Inter', 'Helvetica Neue', sans-serif",
  },
  {
    value: "mono",
    label: "Monospace",
    family: "'JetBrains Mono', 'Fira Code', monospace",
  },
  {
    value: "dyslexic",
    label: "OpenDyslexic",
    family: "'OpenDyslexic', sans-serif",
  },
] as const;

export const READER_FLOW_MODES = [
  { value: "paginated", label: "Paginated" },
  { value: "scrolled", label: "Scroll" },
] as const;

export const READER_MAX_WIDTH_RANGE = { min: 400, max: 1200, step: 40 } as const;
export const READER_MARGIN_RANGE = { min: 0, max: 15, step: 1 } as const;

export const PROGRESS_DEBOUNCE_MS = 2000;
