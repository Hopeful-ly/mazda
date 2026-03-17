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
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    const book = data[`ISBN:${isbn}`];
    if (!book) return null;

    return {
      title: book.title,
      author: book.authors?.[0]?.name,
      description:
        typeof book.notes === "string"
          ? book.notes
          : (book.notes?.value ?? undefined),
      isbn,
      publisher: book.publishers?.[0]?.name,
      publishedDate: book.publish_date,
      coverUrl: book.cover?.large ?? book.cover?.medium,
      pageCount: book.number_of_pages,
      language: undefined,
    };
  } catch {
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
      `https://openlibrary.org/search.json?${query}&limit=1`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    const doc = data.docs?.[0];
    if (!doc) return null;

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
  } catch {
    return null;
  }
}

export async function downloadCover(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}
