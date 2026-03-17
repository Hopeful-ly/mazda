import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc/init";

export const readerRouter = router({
  // Save reading progress (debounced from client)
  saveProgress: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        progress: z.number().min(0).max(100),
        currentCfi: z.string().optional(),
        currentPage: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { bookId, ...progressData } = input;

      const userBook = await ctx.prisma.userBook.upsert({
        where: {
          userId_bookId: {
            userId: ctx.user.id,
            bookId,
          },
        },
        create: {
          userId: ctx.user.id,
          bookId,
          ...progressData,
          status: "READING",
          lastReadAt: new Date(),
          startedAt: new Date(),
        },
        update: {
          ...progressData,
          lastReadAt: new Date(),
          // Auto-set to READING if currently WANT_TO_READ
          ...(progressData.progress > 0 ? {} : {}),
        },
      });

      // If progress just started and status is WANT_TO_READ, update to READING
      if (userBook.status === "WANT_TO_READ" && progressData.progress > 0) {
        await ctx.prisma.userBook.update({
          where: { id: userBook.id },
          data: { status: "READING", startedAt: new Date() },
        });
      }

      return { success: true };
    }),

  // Get reading progress
  getProgress: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userBook = await ctx.prisma.userBook.findUnique({
        where: {
          userId_bookId: {
            userId: ctx.user.id,
            bookId: input.bookId,
          },
        },
        select: {
          progress: true,
          currentCfi: true,
          currentPage: true,
          lastReadAt: true,
        },
      });

      return (
        userBook ?? {
          progress: 0,
          currentCfi: null,
          currentPage: null,
          lastReadAt: null,
        }
      );
    }),

  // Add bookmark
  addBookmark: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        label: z.string().optional(),
        cfi: z.string().optional(),
        page: z.number().optional(),
        position: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { bookId, ...bookmarkData } = input;

      // Ensure UserBook exists
      const userBook = await ctx.prisma.userBook.upsert({
        where: {
          userId_bookId: { userId: ctx.user.id, bookId },
        },
        create: { userId: ctx.user.id, bookId },
        update: {},
      });

      return ctx.prisma.bookmark.create({
        data: {
          userBookId: userBook.id,
          ...bookmarkData,
        },
      });
    }),

  // Remove bookmark
  removeBookmark: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.bookmark.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // List bookmarks for a book
  getBookmarks: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userBook = await ctx.prisma.userBook.findUnique({
        where: {
          userId_bookId: { userId: ctx.user.id, bookId: input.bookId },
        },
      });

      if (!userBook) return [];

      return ctx.prisma.bookmark.findMany({
        where: { userBookId: userBook.id },
        orderBy: { createdAt: "desc" },
      });
    }),

  // Add highlight
  addHighlight: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        text: z.string(),
        note: z.string().optional(),
        color: z.string().optional(),
        cfiRange: z.string().optional(),
        page: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { bookId, ...highlightData } = input;

      const userBook = await ctx.prisma.userBook.upsert({
        where: {
          userId_bookId: { userId: ctx.user.id, bookId },
        },
        create: { userId: ctx.user.id, bookId },
        update: {},
      });

      return ctx.prisma.highlight.create({
        data: {
          userBookId: userBook.id,
          ...highlightData,
        },
      });
    }),

  // Update highlight (edit note/color)
  updateHighlight: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        note: z.string().optional(),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.highlight.update({ where: { id }, data });
    }),

  // Remove highlight
  removeHighlight: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.highlight.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // List highlights for a book
  getHighlights: protectedProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userBook = await ctx.prisma.userBook.findUnique({
        where: {
          userId_bookId: { userId: ctx.user.id, bookId: input.bookId },
        },
      });

      if (!userBook) return [];

      return ctx.prisma.highlight.findMany({
        where: { userBookId: userBook.id },
        orderBy: { createdAt: "desc" },
      });
    }),

  // Update reader preferences
  updatePreferences: protectedProcedure
    .input(
      z.object({
        readerTheme: z.string().optional(),
        readerFontFamily: z.string().optional(),
        readerFontSize: z.number().min(10).max(32).optional(),
        readerLineHeight: z.number().min(1).max(3).optional(),
        readerColumns: z.number().min(1).max(2).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.userPreferences.upsert({
        where: { userId: ctx.user.id },
        create: { userId: ctx.user.id, ...input },
        update: input,
      });
    }),
});
