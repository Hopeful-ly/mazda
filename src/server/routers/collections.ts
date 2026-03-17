import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc/init";

export const collectionsRouter = router({
  // List user's collections
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.collection.findMany({
      where: { userId: ctx.user.id },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { items: true } },
      },
    });
  }),

  // Get collection with books
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const collection = await ctx.prisma.collection.findUnique({
        where: { id: input.id },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              book: {
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
                  tags: { include: { tag: true } },
                },
              },
            },
          },
        },
      });

      if (!collection || collection.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Collection not found",
        });
      }

      return {
        ...collection,
        items: collection.items.map((item) => ({
          ...item.book,
          userBook: item.book.userBooks[0] ?? null,
          tags: item.book.tags.map((bt) => bt.tag),
          userBooks: undefined,
        })),
      };
    }),

  // Create collection
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const maxOrder = await ctx.prisma.collection.aggregate({
        where: { userId: ctx.user.id },
        _max: { sortOrder: true },
      });

      return ctx.prisma.collection.create({
        data: {
          ...input,
          userId: ctx.user.id,
          sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        },
      });
    }),

  // Update collection
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const collection = await ctx.prisma.collection.findUnique({
        where: { id },
      });
      if (!collection || collection.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Collection not found",
        });
      }
      return ctx.prisma.collection.update({ where: { id }, data });
    }),

  // Delete collection
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.prisma.collection.findUnique({
        where: { id: input.id },
      });
      if (!collection || collection.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Collection not found",
        });
      }
      await ctx.prisma.collection.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // Add book to collection
  addBook: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        bookId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.prisma.collection.findUnique({
        where: { id: input.collectionId },
      });
      if (!collection || collection.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Collection not found",
        });
      }

      const book = await ctx.prisma.book.findUnique({
        where: { id: input.bookId },
        select: { uploadedById: true },
      });

      if (!book) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
      }

      if (book.uploadedById !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to add this book",
        });
      }

      const maxOrder = await ctx.prisma.collectionItem.aggregate({
        where: { collectionId: input.collectionId },
        _max: { sortOrder: true },
      });

      return ctx.prisma.collectionItem.create({
        data: {
          collectionId: input.collectionId,
          bookId: input.bookId,
          sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        },
      });
    }),

  // Remove book from collection
  removeBook: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        bookId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.prisma.collection.findUnique({
        where: { id: input.collectionId },
        select: { userId: true },
      });

      if (!collection || collection.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Collection not found",
        });
      }

      await ctx.prisma.collectionItem.delete({
        where: {
          collectionId_bookId: {
            collectionId: input.collectionId,
            bookId: input.bookId,
          },
        },
      });
      return { success: true };
    }),
});
