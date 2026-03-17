import { NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "mazda_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    token?: string;
  } | null;
  const token = body?.token?.trim();

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
