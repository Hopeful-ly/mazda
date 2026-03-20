import { collectIsbnCandidates } from "@/server/services/isbn";

interface DetectedBookSignals {
  title?: string;
  author?: string;
  titleCandidates: string[];
  isbnCandidates: string[];
}

const TITLE_AUTHOR_SEPARATORS = [" - ", " -- ", " by "];

export function detectBookSignalsFromFilename(
  filename: string,
): DetectedBookSignals {
  const baseName = filename.replace(/\.[^.]+$/, "");
  const isbnCandidates = collectIsbnCandidates(baseName);

  const normalizedBase = sanitizeFilenameText(baseName);
  const stripped = removeIsbnFragments(normalizedBase);

  const { title, author } = splitTitleAndAuthor(stripped);

  const titleCandidates = uniqueNonEmpty([
    title,
    normalizeTitleForLookup(stripped),
    normalizeTitleForLookup(normalizedBase),
  ]);

  return {
    title,
    author,
    titleCandidates,
    isbnCandidates,
  };
}

function splitTitleAndAuthor(value: string): {
  title?: string;
  author?: string;
} {
  for (const separator of TITLE_AUTHOR_SEPARATORS) {
    if (!value.toLowerCase().includes(separator.trim().toLowerCase())) continue;

    const parts = value.split(new RegExp(separator, "i"));
    if (parts.length < 2) continue;

    const left = cleanText(parts[0]);
    const right = cleanText(parts.slice(1).join(" "));

    if (!left || !right) continue;
    if (!isLikelyAuthor(right)) continue;

    return { title: left, author: right };
  }

  return { title: cleanText(value) };
}

function sanitizeFilenameText(value: string): string {
  return cleanText(
    value
      .replace(/[._]+/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(epub|pdf|mobi|azw3?|cbz|cbr|scan|retail|ocr|v\d+)\b/gi, " "),
  );
}

function removeIsbnFragments(value: string): string {
  return cleanText(
    value
      .replace(/urn\s*:\s*isbn\s*:?\s*[0-9Xx\s-]{8,20}/gi, " ")
      .replace(/isbn(?:-1[03])?\s*:?\s*[0-9Xx\s-]{8,20}/gi, " ")
      .replace(/\b97[89][0-9\s-]{9,17}\b/g, " "),
  );
}

function normalizeTitleForLookup(value: string): string | undefined {
  const normalized = cleanText(
    value.replace(/\b(the|a)\b\s*$/i, "").replace(/\b\d{4}\b/g, ""),
  );

  return normalized || undefined;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isLikelyAuthor(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 7 && value.length <= 60;
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  const result = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    result.add(value);
  }
  return [...result];
}
