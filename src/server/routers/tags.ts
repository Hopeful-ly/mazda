import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc/init";

export const tagsRouter = router({
  // List all tags
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.tag.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { books: true } },
      },
    });
  }),

  // Create tag
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.tag.create({ data: input });
    }),

  // Update tag
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.tag.update({ where: { id }, data });
    }),

  // Delete tag
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.tag.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
