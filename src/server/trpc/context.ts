import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/server/db/prisma";

export async function createContext(opts: FetchCreateContextFnOptions) {
  const cookieHeader = opts.req.headers.get("cookie") ?? "";
  const sessionToken = parseCookie(cookieHeader, "mazda_session");

  let user: Awaited<ReturnType<typeof validateSession>> = null;
  if (sessionToken) {
    user = await validateSession(sessionToken);
  }

  return {
    user,
    prisma,
    req: opts.req,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

function parseCookie(cookieHeader: string, name: string): string | undefined {
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.split("=")[1] : undefined;
}
