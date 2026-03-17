import type { BookFormat } from "@prisma/client";
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { getBookFormatFromFilename } from "@/lib/utils";
import { prisma } from "@/server/db/prisma";
import { extractEpubMetadata } from "@/server/services/epub";
import {
  downloadCover,
  fetchMetadataByISBN,
  fetchMetadataByTitle,
} from "@/server/services/metadata";
import { saveBook, saveCover } from "@/server/services/storage";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export async function POST(req: Request) {
  // Authenticate
  const cookieHeader = req.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("mazda_session="))
    ?.split("=")[1];

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await validateSession(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 500MB)" },
        { status: 400 },
      );
    }

    const format = getBookFormatFromFilename(file.name);
    if (!format) {
      return NextResponse.json(
        { error: "Unsupported file format" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Save file to storage
    const filePath = await saveBook(buffer, file.name);

    // Extract metadata based on format
    let title = file.name.replace(/\.[^.]+$/, "");
    let author = "Unknown";
    let description: string | undefined;
    let isbn: string | undefined;
    let publisher: string | undefined;
    let language = "en";
    let coverBuffer: Buffer | undefined;

    if (format === "EPUB") {
      const epubMeta = await extractEpubMetadata(buffer);
      if (epubMeta.title) title = epubMeta.title;
      if (epubMeta.author) author = epubMeta.author;
      if (epubMeta.description) description = epubMeta.description;
      if (epubMeta.isbn) isbn = epubMeta.isbn;
      if (epubMeta.publisher) publisher = epubMeta.publisher;
      if (epubMeta.language) language = epubMeta.language;
      if (epubMeta.coverImage) coverBuffer = epubMeta.coverImage;
    }

    // Create book record
    const book = await prisma.book.create({
      data: {
        title,
        author,
        description,
        isbn,
        publisher,
        language,
        format: format as BookFormat,
        fileSize: file.size,
        filePath,
        originalName: file.name,
        uploadedById: user.id,
      },
    });

    // Save cover if extracted
    if (coverBuffer) {
      const coverPath = await saveCover(coverBuffer, book.id);
      await prisma.book.update({
        where: { id: book.id },
        data: { coverPath },
      });
    }

    // Try to fetch additional metadata from Open Library (non-blocking)
    fetchAndUpdateMetadata(book.id, title, author, isbn).catch(() => {
      // Silently fail - metadata enrichment is best-effort
    });

    // Create UserBook relationship
    await prisma.userBook.create({
      data: {
        userId: user.id,
        bookId: book.id,
        status: "WANT_TO_READ",
      },
    });

    return NextResponse.json({ book });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload book" },
      { status: 500 },
    );
  }
}

async function fetchAndUpdateMetadata(
  bookId: string,
  title: string,
  author: string,
  isbn?: string,
) {
  let metadata = isbn ? await fetchMetadataByISBN(isbn) : null;

  if (!metadata) {
    metadata = await fetchMetadataByTitle(
      title,
      author !== "Unknown" ? author : undefined,
    );
  }

  if (!metadata) return;

  const updateData: Record<string, unknown> = {};
  if (metadata.description) updateData.description = metadata.description;
  if (metadata.publisher) updateData.publisher = metadata.publisher;
  if (metadata.pageCount) updateData.pageCount = metadata.pageCount;
  if (metadata.isbn && !isbn) updateData.isbn = metadata.isbn;

  if (Object.keys(updateData).length > 0) {
    await prisma.book.update({
      where: { id: bookId },
      data: updateData,
    });
  }

  // Download and save cover if we don't have one
  if (metadata.coverUrl) {
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { coverPath: true },
    });

    if (!book?.coverPath) {
      const coverBuf = await downloadCover(metadata.coverUrl);
      if (coverBuf) {
        const coverPath = await saveCover(coverBuf, bookId);
        await prisma.book.update({
          where: { id: bookId },
          data: { coverPath },
        });
      }
    }
  }
}
