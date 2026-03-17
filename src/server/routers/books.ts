import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc/init";

export const booksRouter = router({
  // List all books (with filters)
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          format: z.string().optional(),
          status: z.string().optional(),
          tagId: z.string().optional(),
          collectionId: z.string().optional(),
          sortBy: z
            .enum(["title", "author", "createdAt", "progress", "lastReadAt"])
            .default("createdAt"),
          sortOrder: z.enum(["asc", "desc"]).default("desc"),
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(100).default(24),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const {
        search,
        format,
        status,
        tagId,
        collectionId,
        sortBy = "createdAt",
        sortOrder = "desc",
        page = 1,
        limit = 24,
      } = input ?? {};

      const where: Record<string, unknown> = {};

      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { author: { contains: search, mode: "insensitive" } },
        ];
      }

      if (format) {
        where.format = format;
      }

      if (tagId) {
        where.tags = { some: { tagId } };
      }

      if (collectionId) {
        where.collectionItems = { some: { collectionId } };
      }

      // Build orderBy
      let orderBy: Record<string, string> = {};
      if (sortBy === "progress" || sortBy === "lastReadAt") {
        // These need to sort via userBooks relation - we'll handle differently
        orderBy = { createdAt: sortOrder };
      } else {
        orderBy = { [sortBy]: sortOrder };
      }

      const [books, total] = await Promise.all([
        ctx.prisma.book.findMany({
          where,
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            userBooks: {
              where: { userId: ctx.user.id },
              select: {
                status: true,
                progress: true,
                rating: true,
                isFavorite: true,
                lastReadAt: true,
              },
            },
            tags: {
              include: { tag: true },
            },
          },
        }),
        ctx.prisma.book.count({ where }),
      ]);

      // Filter by status if needed (post-query since it's on userBooks)
      let filteredBooks = books;
      if (status) {
        filteredBooks = books.filter((b) => b.userBooks[0]?.status === status);
      }

      return {
        books: filteredBooks.map((book) => ({
          ...book,
          userBook: book.userBooks[0] ?? null,
          tags: book.tags.map((bt) => bt.tag),
          userBooks: undefined,
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    }),

  // Get single book
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const book = await ctx.prisma.book.findUnique({
        where: { id: input.id },
        include: {
          userBooks: {
            where: { userId: ctx.user.id },
            include: {
              bookmarks: { orderBy: { createdAt: "desc" } },
              highlights: { orderBy: { createdAt: "desc" } },
            },
          },
          tags: { include: { tag: true } },
          collectionItems: {
            include: { collection: true },
          },
        },
      });

      if (!book) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
      }

      return {
        ...book,
        userBook: book.userBooks[0] ?? null,
        tags: book.tags.map((bt) => bt.tag),
        collections: book.collectionItems.map((ci) => ci.collection),
        userBooks: undefined,
        collectionItems: undefined,
      };
    }),

  // Update book metadata
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        author: z.string().optional(),
        description: z.string().optional(),
        isbn: z.string().optional(),
        publisher: z.string().optional(),
        language: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.book.update({
        where: { id },
        data,
      });
    }),

  // Delete a book
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const book = await ctx.prisma.book.findUnique({
        where: { id: input.id },
      });
      if (!book) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
      }

      // Delete from database (cascades to userBooks, bookmarks, etc.)
      await ctx.prisma.book.delete({ where: { id: input.id } });

      // TODO: delete file from storage

      return { success: true };
    }),

  // Update user-book relationship (status, rating, favorite)
  updateUserBook: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        status: z
          .enum(["WANT_TO_READ", "READING", "FINISHED", "DROPPED"])
          .optional(),
        rating: z.number().min(1).max(5).nullable().optional(),
        isFavorite: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { bookId, ...data } = input;

      const updateData: Record<string, unknown> = { ...data };

      // Auto-set dates based on status changes
      if (data.status === "READING" && !updateData.startedAt) {
        updateData.startedAt = new Date();
      }
      if (data.status === "FINISHED") {
        updateData.finishedAt = new Date();
      }

      return ctx.prisma.userBook.upsert({
        where: {
          userId_bookId: {
            userId: ctx.user.id,
            bookId,
          },
        },
        create: {
          userId: ctx.user.id,
          bookId,
          ...updateData,
        },
        update: updateData,
      });
    }),

  // Add/remove tags
  setTags: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        tagIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Delete existing tags
      await ctx.prisma.bookTag.deleteMany({
        where: { bookId: input.bookId },
      });

      // Create new tags
      if (input.tagIds.length > 0) {
        await ctx.prisma.bookTag.createMany({
          data: input.tagIds.map((tagId) => ({
            bookId: input.bookId,
            tagId,
          })),
        });
      }

      return { success: true };
    }),

  // Get recent books (for dashboard)
  recent: protectedProcedure.query(async ({ ctx }) => {
    const userBooks = await ctx.prisma.userBook.findMany({
      where: {
        userId: ctx.user.id,
        lastReadAt: { not: null },
      },
      orderBy: { lastReadAt: "desc" },
      take: 8,
      include: {
        book: {
          include: {
            tags: { include: { tag: true } },
          },
        },
      },
    });

    return userBooks.map((ub) => ({
      ...ub.book,
      userBook: {
        status: ub.status,
        progress: ub.progress,
        rating: ub.rating,
        isFavorite: ub.isFavorite,
        lastReadAt: ub.lastReadAt,
      },
      tags: ub.book.tags.map((bt) => bt.tag),
    }));
  }),

  // Dashboard stats
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [totalBooks, reading, finished, totalUserBooks] = await Promise.all([
      ctx.prisma.book.count(),
      ctx.prisma.userBook.count({
        where: { userId: ctx.user.id, status: "READING" },
      }),
      ctx.prisma.userBook.count({
        where: { userId: ctx.user.id, status: "FINISHED" },
      }),
      ctx.prisma.userBook.count({
        where: { userId: ctx.user.id },
      }),
    ]);

    return { totalBooks, reading, finished, totalUserBooks };
  }),
});
