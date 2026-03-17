import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { adminProcedure, router } from "@/server/trpc/init";

export const adminRouter = router({
  // List all users
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            books: true,
            collections: true,
          },
        },
      },
    });
    return users;
  }),

  // Create user (admin only)
  createUser: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        username: z.string().min(3).max(32),
        password: z.string().min(8).max(128),
        role: z.enum(["ADMIN", "USER"]).default("USER"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const hashedPassword = await hashPassword(input.password);

      return ctx.prisma.user.create({
        data: {
          email: input.email,
          username: input.username,
          password: hashedPassword,
          role: input.role,
          preferences: { create: {} },
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          createdAt: true,
        },
      });
    }),

  // Update user role
  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["ADMIN", "USER"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change your own role",
        });
      }

      return ctx.prisma.user.update({
        where: { id: input.userId },
        data: { role: input.role },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
        },
      });
    }),

  // Delete user
  deleteUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete yourself",
        });
      }

      await ctx.prisma.user.delete({ where: { id: input.userId } });
      return { success: true };
    }),

  // Reset user password
  resetPassword: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        newPassword: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const hashedPassword = await hashPassword(input.newPassword);
      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { password: hashedPassword },
      });
      return { success: true };
    }),
});
