import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/server/db/prisma";
import { readBookFile } from "@/server/services/storage";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  const book = await prisma.book.findUnique({
    where: { id },
    include: {
      userBooks: {
        where: { userId: user.id },
        select: { id: true },
      },
    },
  });
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (book.userBooks.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const buffer = await readBookFile(book.filePath);
    const mimeTypes: Record<string, string> = {
      EPUB: "application/epub+zip",
      PDF: "application/pdf",
      MOBI: "application/x-mobipocket-ebook",
      CBZ: "application/vnd.comicbook+zip",
      CBR: "application/vnd.comicbook-rar",
      TXT: "text/plain",
      MARKDOWN: "text/markdown",
    };

    const contentType =
      book.format === "EPUB"
        ? "application/epub+zip"
        : (mimeTypes[book.format] ?? "application/octet-stream");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "File not found on disk" },
      { status: 404 },
    );
  }
}
