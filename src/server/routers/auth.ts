import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import {
  protectedProcedure,
  publicProcedure,
  router,
} from "@/server/trpc/init";

export const authRouter = router({
  // Register (first user becomes admin)
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        username: z.string().min(3).max(32),
        password: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if this is the first user (will be admin)
      const userCount = await ctx.prisma.user.count();
      const isFirstUser = userCount === 0;

      if (!isFirstUser) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Registration is disabled. Ask an admin to create your account.",
        });
      }

      const existingEmail = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });
      if (existingEmail) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already in use",
        });
      }

      const existingUsername = await ctx.prisma.user.findUnique({
        where: { username: input.username },
      });
      if (existingUsername) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Username already taken",
        });
      }

      const hashedPassword = await hashPassword(input.password);

      const user = await ctx.prisma.user.create({
        data: {
          email: input.email,
          username: input.username,
          password: hashedPassword,
          role: isFirstUser ? "ADMIN" : "USER",
          preferences: {
            create: {},
          },
        },
      });

      const token = await createSession(user.id);

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
        },
      };
    }),

  // Login
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      const valid = await verifyPassword(input.password, user.password);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      const token = await createSession(user.id);

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
        },
      };
    }),

  // Logout
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const cookieHeader = ctx.req.headers.get("cookie") ?? "";
    const token = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("mazda_session="))
      ?.split("=")[1];

    if (token) {
      await destroySession(token);
    }

    return { success: true };
  }),

  // Get current user
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const prefs = await ctx.prisma.userPreferences.findUnique({
      where: { userId: ctx.user.id },
    });
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      username: ctx.user.username,
      role: ctx.user.role,
      preferences: prefs,
    };
  }),
});
