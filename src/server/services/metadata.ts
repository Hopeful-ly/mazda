import { normalizeCoverBuffer } from "@/server/services/cover";
import { normalizeIsbn, toIsbn10 } from "@/server/services/isbn";

const OPEN_LIBRARY_TIMEOUT_MS = 8000;
const MAX_ISBN_LOOKUPS = 4;
const MAX_TITLE_LOOKUPS = 4;

interface OpenLibrarySearchDoc {
  title?: string;
  subtitle?: string;
  author_name?: string[];
  publisher?: string[];
  isbn?: string[];
  cover_i?: number;
  first_sentence?: string | string[];
  language?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
  edition_count?: number;
}

export interface BookMetadata {
  title?: string;
  author?: string;
  description?: string;
  isbn?: string;
  publisher?: string;
  publishedDate?: string;
  coverUrl?: string;
  pageCount?: number;
  language?: string;
}

export async function fetchMetadataByISBNCandidates(
  isbnCandidates: string[],
): Promise<BookMetadata | null> {
  const uniqueCandidates = [
    ...new Set(
      isbnCandidates
        .map(normalizeIsbn)
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, MAX_ISBN_LOOKUPS);

  for (const candidate of uniqueCandidates) {
    const metadata = await fetchMetadataByISBN(candidate);
    if (metadata) {
      return metadata;
    }
  }

  return null;
}

export async function fetchMetadataByISBN(
  isbn: string,
): Promise<BookMetadata | null> {
  const normalizedIsbn = normalizeIsbn(isbn);
  if (!normalizedIsbn) {
    return null;
  }

  const isbnVariants = [normalizedIsbn, toIsbn10(normalizedIsbn)].filter(
    (value): value is string => Boolean(value),
  );

  try {
    const bibKeys = isbnVariants.map((value) => `ISBN:${value}`).join(",");
    const data = await fetchJson<Record<string, unknown>>(
      `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(bibKeys)}&format=json&jscmd=data`,
    );

    if (data) {
      for (const variant of isbnVariants) {
        const key = `ISBN:${variant}`;
        const entry = data[key];
        if (entry && typeof entry === "object") {
          return mapIsbnBookResult(
            entry as Record<string, unknown>,
            normalizedIsbn,
          );
        }
      }
    }

    const docs = await fetchSearchDocs(
      `https://openlibrary.org/search.json?isbn=${encodeURIComponent(normalizedIsbn)}&limit=8`,
    );
    const fallbackDoc = docs[0];
    if (fallbackDoc) {
      return mapSearchDocToMetadata(fallbackDoc, normalizedIsbn);
    }

    return null;
  } catch (err) {
    console.warn(`[metadata] ISBN lookup error for ${normalizedIsbn}:`, err);
    return null;
  }
}

export async function fetchMetadataByTitleCandidates(
  titleCandidates: string[],
  author?: string,
): Promise<BookMetadata | null> {
  const uniqueTitles = [
    ...new Set(
      titleCandidates
        .map(cleanText)
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, MAX_TITLE_LOOKUPS);

  for (const title of uniqueTitles) {
    const metadata = await fetchMetadataByTitle(title, author);
    if (metadata) {
      return metadata;
    }
  }

  return null;
}

export async function fetchMetadataByTitle(
  title: string,
  author?: string,
): Promise<BookMetadata | null> {
  const cleanedTitle = cleanText(title);
  if (!cleanedTitle || cleanedTitle.length < 2) {
    return null;
  }

  try {
    let query = `title=${encodeURIComponent(cleanedTitle)}`;
    if (author) {
      query += `&author=${encodeURIComponent(author)}`;
    }

    const docs = await fetchSearchDocs(
      `https://openlibrary.org/search.json?${query}&limit=12`,
    );
    if (docs.length === 0) {
      return null;
    }

    const normalizedTitle = normalizeForScoring(cleanedTitle);
    const normalizedAuthor = normalizeForScoring(author ?? "");

    let bestDoc: OpenLibrarySearchDoc | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const doc of docs) {
      const score = scoreTitleCandidate(doc, normalizedTitle, normalizedAuthor);
      if (score > bestScore) {
        bestScore = score;
        bestDoc = doc;
      }
    }

    if (!bestDoc) {
      return null;
    }

    return mapSearchDocToMetadata(bestDoc);
  } catch (err) {
    console.warn(`[metadata] Title search error for "${cleanedTitle}":`, err);
    return null;
  }
}

export async function downloadCover(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(OPEN_LIBRARY_TIMEOUT_MS),
      headers: {
        Accept: "image/*",
      },
    });
    if (!res.ok) {
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength < 1_200) {
      return null;
    }

    const normalized = await normalizeCoverBuffer(Buffer.from(arrayBuffer));
    return normalized;
  } catch {
    return null;
  }
}

async function fetchSearchDocs(url: string): Promise<OpenLibrarySearchDoc[]> {
  const data = await fetchJson<{ docs?: OpenLibrarySearchDoc[] }>(url);
  return data?.docs ?? [];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(OPEN_LIBRARY_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function mapIsbnBookResult(
  rawBook: Record<string, unknown>,
  fallbackIsbn: string,
): BookMetadata {
  const notes = rawBook.notes;
  const notesDescription =
    typeof notes === "string"
      ? notes
      : isRecord(notes)
        ? asString(notes.value)
        : undefined;

  return {
    title: cleanText(asString(rawBook.title)),
    author: firstName(rawBook.authors),
    description: cleanText(notesDescription),
    isbn: fallbackIsbn,
    publisher: firstName(rawBook.publishers),
    publishedDate: cleanText(asString(rawBook.publish_date)),
    coverUrl: extractCoverUrl(rawBook.cover),
    pageCount: asNumber(rawBook.number_of_pages),
    language: undefined,
  };
}

function mapSearchDocToMetadata(
  doc: OpenLibrarySearchDoc,
  forcedIsbn?: string,
): BookMetadata {
  const isbn = forcedIsbn ?? findFirstValidIsbn(doc.isbn);
  const firstSentence = toSingleString(doc.first_sentence);
  const language = normalizeLanguageCode(doc.language?.[0]);

  const metadata: BookMetadata = {
    title: cleanText(doc.title),
    author: cleanText(doc.author_name?.[0]),
    description: cleanText(firstSentence ?? doc.subtitle),
    isbn,
    publisher: cleanText(doc.publisher?.[0]),
    publishedDate: doc.first_publish_year
      ? String(doc.first_publish_year)
      : undefined,
    coverUrl: getCoverUrl(doc.cover_i, isbn),
    pageCount: doc.number_of_pages_median,
    language,
  };

  return metadata;
}

function scoreTitleCandidate(
  doc: OpenLibrarySearchDoc,
  normalizedTitle: string,
  normalizedAuthor: string,
): number {
  const docTitle = normalizeForScoring(doc.title ?? "");
  const docAuthor = normalizeForScoring(doc.author_name?.[0] ?? "");

  const titleScore = tokenOverlap(normalizedTitle, docTitle) * 6;
  const authorScore = normalizedAuthor
    ? tokenOverlap(normalizedAuthor, docAuthor) * 2
    : 0;

  const coverScore = doc.cover_i ? 1 : 0;
  const isbnScore = findFirstValidIsbn(doc.isbn) ? 1.25 : 0;
  const editionScore = Math.min(1, (doc.edition_count ?? 0) / 40);

  return titleScore + authorScore + coverScore + isbnScore + editionScore;
}

function tokenOverlap(left: string, right: string): number {
  if (!left || !right) return 0;

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));

  const shortestLength = Math.max(
    1,
    Math.min(leftTokens.size, rightTokens.size),
  );
  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / shortestLength;
}

function extractCoverUrl(cover: unknown): string | undefined {
  if (!isRecord(cover)) {
    return undefined;
  }

  return (
    asString(cover.large) ?? asString(cover.medium) ?? asString(cover.small)
  );
}

function firstName(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const first = value[0];
  if (!isRecord(first)) {
    return undefined;
  }

  return cleanText(asString(first.name));
}

function findFirstValidIsbn(values?: string[]): string | undefined {
  if (!values) {
    return undefined;
  }

  for (const value of values) {
    const normalized = normalizeIsbn(value);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function getCoverUrl(coverId?: number, isbn?: string): string | undefined {
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
  }

  if (coverId) {
    return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  }

  return undefined;
}

function normalizeLanguageCode(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (normalized === "eng") return "en";
  if (normalized === "fre") return "fr";
  if (normalized === "ger") return "de";
  if (normalized === "spa") return "es";

  return normalized;
}

function normalizeForScoring(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function toSingleString(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  return value[0];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
