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
    let extractedCoverBuffer: Buffer | undefined;

    if (format === "EPUB") {
      try {
        const epubMeta = await extractEpubMetadata(buffer);
        if (epubMeta.title) title = epubMeta.title;
        if (epubMeta.author) author = epubMeta.author;
        if (epubMeta.description) description = epubMeta.description;
        if (epubMeta.isbn) isbn = epubMeta.isbn;
        if (epubMeta.publisher) publisher = epubMeta.publisher;
        if (epubMeta.language) language = epubMeta.language;
        if (epubMeta.coverImage) {
          extractedCoverBuffer = epubMeta.coverImage;
          console.log(`[upload] Extracted cover from EPUB: ${extractedCoverBuffer.length} bytes`);
        } else {
          console.log(`[upload] No cover image found in EPUB`);
        }
        console.log(`[upload] EPUB metadata: title="${title}", author="${author}", isbn=${isbn ?? "none"}`);
      } catch (err) {
        console.error(`[upload] EPUB metadata extraction failed:`, err);
      }
    }

    // Prefer registry metadata/cover first, then fall back to extracted cover
    console.log(`[upload] Looking up metadata: isbn=${isbn ?? "none"}, title="${title}", author="${author}"`);
    let metadata = isbn ? await fetchMetadataByISBN(isbn) : null;
    if (!metadata) {
      metadata = await fetchMetadataByTitle(
        title,
        author !== "Unknown" ? author : undefined,
      );
    }

    if (metadata) {
      console.log(`[upload] Found metadata: coverUrl=${metadata.coverUrl ?? "none"}`);
      if (metadata.description) description = metadata.description;
      if (metadata.publisher) publisher = metadata.publisher;
      if (metadata.language) language = metadata.language;
      if (metadata.isbn && !isbn) isbn = metadata.isbn;
    } else {
      console.log(`[upload] No metadata found from Open Library`);
    }

    let registryCoverBuffer: Buffer | undefined;
    if (metadata?.coverUrl) {
      const downloaded = await downloadCover(metadata.coverUrl);
      if (downloaded) {
        console.log(`[upload] Downloaded registry cover: ${downloaded.length} bytes`);
        registryCoverBuffer = downloaded;
      } else {
        console.log(`[upload] Registry cover download failed or too small`);
      }
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
        pageCount: metadata?.pageCount,
        format: format as BookFormat,
        fileSize: file.size,
        filePath,
        originalName: file.name,
        uploadedById: user.id,
      },
    });

    // Save cover (registry first, extraction fallback)
    const selectedCoverBuffer = registryCoverBuffer ?? extractedCoverBuffer;
    if (selectedCoverBuffer) {
      try {
        const coverPath = await saveCover(selectedCoverBuffer, book.id);
        await prisma.book.update({
          where: { id: book.id },
          data: { coverPath },
        });
        console.log(`[upload] Saved cover: ${coverPath} (${selectedCoverBuffer.length} bytes, source: ${registryCoverBuffer ? "registry" : "epub"})`);
      } catch (err) {
        console.error(`[upload] Failed to save cover:`, err);
      }
    } else {
      console.log(`[upload] No cover available from registry or extraction`);
    }

    // Create UserBook relationship
    await prisma.userBook.create({
      data: {
        userId: user.id,
        bookId: book.id,
        status: "WANT_TO_READ",
      },
    });

    // Give admin users visibility to all uploaded books
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", id: { not: user.id } },
      select: { id: true },
    });

    if (admins.length > 0) {
      await prisma.userBook.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          bookId: book.id,
          status: "WANT_TO_READ",
        })),
        skipDuplicates: true,
      });
    }

    // Re-fetch to include any cover update
    const finalBook = await prisma.book.findUnique({ where: { id: book.id } });
    return NextResponse.json({ book: finalBook ?? book });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload book" },
      { status: 500 },
    );
  }
}
