import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function getBookFormatFromFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  const formatMap: Record<string, string> = {
    epub: "EPUB",
    pdf: "PDF",
    mobi: "MOBI",
    azw: "MOBI",
    azw3: "MOBI",
    cbz: "CBZ",
    cbr: "CBR",
    txt: "TXT",
    md: "MARKDOWN",
    markdown: "MARKDOWN",
  };
  return ext ? (formatMap[ext] ?? null) : null;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return `${str.slice(0, length)}...`;
}
