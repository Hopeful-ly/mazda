import { adminRouter } from "@/server/routers/admin";
import { authRouter } from "@/server/routers/auth";
import { booksRouter } from "@/server/routers/books";
import { collectionsRouter } from "@/server/routers/collections";
import { readerRouter } from "@/server/routers/reader";
import { tagsRouter } from "@/server/routers/tags";
import { router } from "./init";

export const appRouter = router({
  auth: authRouter,
  books: booksRouter,
  collections: collectionsRouter,
  tags: tagsRouter,
  reader: readerRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
