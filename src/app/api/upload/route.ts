import type { BookFormat } from "@prisma/client";
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { getBookFormatFromFilename } from "@/lib/utils";
import { prisma } from "@/server/db/prisma";
import { detectBookSignalsFromFilename } from "@/server/services/book-detection";
import { chooseBestCover } from "@/server/services/cover";
import { extractEpubMetadata } from "@/server/services/epub";
import { collectIsbnCandidates } from "@/server/services/isbn";
import {
  downloadCover,
  fetchMetadataByISBNCandidates,
  fetchMetadataByTitleCandidates,
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

    // Extract metadata with layered fallbacks (filename -> file metadata -> registry)
    const signals = detectBookSignalsFromFilename(file.name);
    let title =
      signals.title ?? (file.name.replace(/\.[^.]+$/, "").trim() || "Untitled");
    let author = signals.author ?? "Unknown";
    let description: string | undefined;
    let isbn: string | undefined;
    let publisher: string | undefined;
    let language = "en";
    let pageCount: number | undefined;
    let extractedCoverBuffer: Buffer | undefined;

    const titleCandidates = new Set<string>(signals.titleCandidates);
    const isbnCandidates = new Set<string>(signals.isbnCandidates);

    if (title) titleCandidates.add(title);

    if (format === "EPUB") {
      try {
        const epubMeta = await extractEpubMetadata(buffer);
        if (epubMeta.title) {
          title = epubMeta.title;
          titleCandidates.add(epubMeta.title);
        }
        if (epubMeta.author) author = epubMeta.author;
        if (epubMeta.description) description = epubMeta.description;
        if (epubMeta.isbnCandidates) {
          for (const candidate of epubMeta.isbnCandidates) {
            isbnCandidates.add(candidate);
          }
        }
        if (epubMeta.isbn) isbnCandidates.add(epubMeta.isbn);
        if (epubMeta.publisher) publisher = epubMeta.publisher;
        if (epubMeta.language) language = epubMeta.language;
        if (epubMeta.coverImage) {
          extractedCoverBuffer = epubMeta.coverImage;
          console.log(
            `[upload] Extracted cover from EPUB: ${extractedCoverBuffer.length} bytes`,
          );
        } else {
          console.log(`[upload] No cover image found in EPUB`);
        }
        console.log(
          `[upload] EPUB metadata: title="${title}", author="${author}", isbnCandidates=${isbnCandidates.size}`,
        );
      } catch (err) {
        console.error(`[upload] EPUB metadata extraction failed:`, err);
      }
    }

    const mergedIsbnCandidates = collectIsbnCandidates(
      isbn,
      ...isbnCandidates,
      title,
      author,
      file.name,
    );

    // Registry lookups with cascading fallback:
    // 1) strong ISBN candidates
    // 2) title candidates with optional author
    console.log(
      `[upload] Looking up metadata: isbnCandidates=${mergedIsbnCandidates.length}, titleCandidates=${titleCandidates.size}`,
    );
    let metadata =
      mergedIsbnCandidates.length > 0
        ? await fetchMetadataByISBNCandidates(mergedIsbnCandidates)
        : null;

    if (!metadata && titleCandidates.size > 0) {
      metadata = await fetchMetadataByTitleCandidates(
        [...titleCandidates],
        author !== "Unknown" ? author : undefined,
      );
    }

    if (metadata) {
      console.log(
        `[upload] Found metadata: coverUrl=${metadata.coverUrl ?? "none"}`,
      );

      if (isWeakTitle(title) && metadata.title) {
        title = metadata.title;
      }

      if ((author === "Unknown" || !author.trim()) && metadata.author) {
        author = metadata.author;
      }

      if (!description && metadata.description) {
        description = metadata.description;
      }
      if (!publisher && metadata.publisher) {
        publisher = metadata.publisher;
      }
      if (metadata.language) {
        language = metadata.language;
      }
      if (!pageCount && metadata.pageCount) {
        pageCount = metadata.pageCount;
      }

      if (metadata.isbn) {
        isbnCandidates.add(metadata.isbn);
      }

      if (metadata.title) {
        titleCandidates.add(metadata.title);
      }
    } else {
      console.log(`[upload] No metadata found from Open Library`);
    }

    let registryCoverBuffer: Buffer | undefined;
    if (metadata?.coverUrl) {
      const downloaded = await downloadCover(metadata.coverUrl);
      if (downloaded) {
        console.log(
          `[upload] Downloaded registry cover: ${downloaded.length} bytes`,
        );
        registryCoverBuffer = downloaded;
      } else {
        console.log(`[upload] Registry cover download failed or too small`);
      }
    }

    const finalIsbnCandidates = collectIsbnCandidates(
      ...mergedIsbnCandidates,
      ...isbnCandidates,
      metadata?.isbn,
    );
    isbn = finalIsbnCandidates[0];

    // Create book record
    const book = await prisma.book.create({
      data: {
        title,
        author,
        description,
        isbn,
        publisher,
        language,
        pageCount,
        format: format as BookFormat,
        fileSize: file.size,
        filePath,
        originalName: file.name,
        uploadedById: user.id,
      },
    });

    // Save cover with scoring (prefer quality over source)
    const bestCover = await chooseBestCover(
      [
        registryCoverBuffer
          ? { label: "registry", buffer: registryCoverBuffer }
          : null,
        extractedCoverBuffer
          ? { label: "epub", buffer: extractedCoverBuffer }
          : null,
      ].filter((candidate): candidate is { label: string; buffer: Buffer } =>
        Boolean(candidate),
      ),
    );

    if (bestCover) {
      try {
        const coverPath = await saveCover(bestCover.buffer, book.id);
        await prisma.book.update({
          where: { id: book.id },
          data: { coverPath },
        });
        console.log(
          `[upload] Saved cover: ${coverPath} (${bestCover.buffer.length} bytes, source: ${bestCover.label})`,
        );
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

function isWeakTitle(title: string): boolean {
  const cleaned = title.toLowerCase().trim();
  if (!cleaned) return true;
  if (cleaned === "untitled") return true;
  return /^book\s*\d*$/i.test(cleaned);
}
