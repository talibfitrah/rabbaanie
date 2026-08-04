import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { has2FA } from "../totp";
import type { TrpcContext } from "./context";

export const ADMIN_FACTOR_MAX_AGE_MS = 10 * 60 * 1000;

export function hasFreshAdminFactor(
  verifiedAt: number | null | undefined,
  now = Date.now(),
): boolean {
  return (
    typeof verifiedAt === "number" &&
    verifiedAt <= now &&
    now - verifiedAt <= ADMIN_FACTOR_MAX_AGE_MS
  );
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (
      !ctx.user ||
      !(["admin", "super_admin", "moderator"] as string[]).includes(
        ctx.user.role,
      )
    ) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    const enrolled = await has2FA(ctx.user.id);
    if (!enrolled) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Administrator two-factor enrollment required",
      });
    }

    if (!hasFreshAdminFactor(ctx.user.twoFactorVerifiedAt)) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Two-factor verification required",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
