import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/server/db/prisma";
import { readCoverFile, saveCover } from "@/server/services/storage";

const MAX_COVER_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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
    select: {
      coverPath: true,
      userBooks: {
        where: { userId: user.id },
        select: { id: true },
      },
    },
  });

  if (!book || book.userBooks.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!book?.coverPath) {
    // Return a placeholder SVG
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
      <rect width="200" height="300" fill="#E5E7EB"/>
      <text x="100" y="150" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif" font-size="14">No Cover</text>
    </svg>`;
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  try {
    const buffer = await readCoverFile(book.coverPath);

    // Detect actual image type from magic bytes
    let contentType = "image/jpeg";
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      contentType = "image/png";
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49) {
      contentType = "image/gif";
    } else if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45
    ) {
      contentType = "image/webp";
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "Cover not found" }, { status: 404 });
  }
}

export async function POST(
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
    select: {
      id: true,
      userBooks: {
        where: { userId: user.id },
        select: { id: true },
      },
    },
  });

  if (!book || book.userBooks.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("cover") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_COVER_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 10MB)" },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid image type. Use JPEG, PNG, WebP, or GIF." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const coverPath = await saveCover(buffer, id);

    await prisma.book.update({
      where: { id },
      data: { coverPath },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cover upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload cover" },
      { status: 500 },
    );
  }
}
