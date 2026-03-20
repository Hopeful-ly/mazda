// Fetch book metadata from Open Library

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

export async function fetchMetadataByISBN(
  isbn: string,
): Promise<BookMetadata | null> {
  try {
    // Strip hyphens for API lookup
    const cleanIsbn = isbn.replace(/-/g, "");
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) {
      console.warn(`[metadata] Open Library ISBN lookup failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const book = data[`ISBN:${cleanIsbn}`];
    if (!book) {
      console.log(`[metadata] No Open Library result for ISBN ${cleanIsbn}`);
      return null;
    }

    return {
      title: book.title,
      author: book.authors?.[0]?.name,
      description:
        typeof book.notes === "string"
          ? book.notes
          : (book.notes?.value ?? undefined),
      isbn: cleanIsbn,
      publisher: book.publishers?.[0]?.name,
      publishedDate: book.publish_date,
      coverUrl: book.cover?.large ?? book.cover?.medium,
      pageCount: book.number_of_pages,
      language: undefined,
    };
  } catch (err) {
    console.warn(`[metadata] ISBN lookup error:`, err);
    return null;
  }
}

export async function fetchMetadataByTitle(
  title: string,
  author?: string,
): Promise<BookMetadata | null> {
  try {
    let query = `title=${encodeURIComponent(title)}`;
    if (author) {
      query += `&author=${encodeURIComponent(author)}`;
    }

    const res = await fetch(
      `https://openlibrary.org/search.json?${query}&limit=3`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) {
      console.warn(`[metadata] Open Library title search failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    // Pick the first result that has a cover, or fall back to first result
    const docs = data.docs ?? [];
    const doc = docs.find((d: any) => d.cover_i) ?? docs[0];
    if (!doc) {
      console.log(`[metadata] No Open Library result for "${title}"`);
      return null;
    }

    const isbn = doc.isbn?.[0];
    const coverId = doc.cover_i;

    return {
      title: doc.title,
      author: doc.author_name?.[0],
      description: doc.first_sentence?.[0],
      isbn,
      publisher: doc.publisher?.[0],
      publishedDate: doc.first_publish_year?.toString(),
      coverUrl: coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
        : undefined,
      pageCount: doc.number_of_pages_median,
      language: doc.language?.[0],
    };
  } catch (err) {
    console.warn(`[metadata] Title search error:`, err);
    return null;
  }
}

export async function downloadCover(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const arrayBuffer = await res.arrayBuffer();
    // Reject tiny placeholders (< 1KB is not a real cover)
    if (arrayBuffer.byteLength < 1000) return null;

    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}
