import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/server/db/prisma";
import { readCoverFile } from "@/server/services/storage";

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
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "Cover not found" }, { status: 404 });
  }
}
