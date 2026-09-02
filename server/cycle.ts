import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";

// Regex shape plus a real calendar round-trip — the regex alone accepts
// e.g. "2026-02-30", which the client's date arithmetic (lib/haid.ts
// addDays/diffDays) would then silently roll over to a different date.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "invalid date");
const flowEnum = z.enum(["blood", "spotting", "dry"]);
const colorEnum = z.enum(["black", "red"]);
const DAYS_BACK = 400;

function sinceDate(): string {
  const d = new Date(Date.now() - DAYS_BACK * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Column-then-JSON precedence — copied from the gender resolver body at
 * server/daily-diagnostic.ts:572-580, adapted to resolve an ARBITRARY
 * userId (not just ctx.user) via db.getUserById, because getPartner below
 * must also resolve the PARTNER's gender, not only the caller's. Duplicated
 * rather than reusing routers.ts's own resolveGender — routers.ts imports
 * cycleRouter from this module, so importing back would be a cycle (the
 * same reason daily-diagnostic.ts gives for its own copy).
 */
async function genderOf(userId: number): Promise<"man" | "vrouw" | ""> {
  const user = await db.getUserById(userId);
  const profileData = user?.profileData as any;
  return (user?.gender || profileData?.parentProfile?.gender || "") as "man" | "vrouw" | "";
}

async function assertWoman(userId: number): Promise<void> {
  if ((await genderOf(userId)) !== "vrouw") throw new TRPCError({ code: "FORBIDDEN", message: "cycle data is for women" });
}

/** upsertDay/deleteDay must not write before she has consented (saveSettings({enabled:true})). */
async function assertEnabled(userId: number): Promise<void> {
  const settings = await db.getCycleSettings(userId);
  if (settings?.enabled !== true) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "cycle tracker is not enabled" });
}

async function load(userId: number) {
  const settings = await db.getCycleSettings(userId);
  const enabled = !!settings?.enabled;
  const days = enabled ? await db.listCycleDays(userId, sinceDate()) : [];
  return { enabled, settings, days };
}

const settingsPatch = z.object({
  // Disabling only goes through disable() (deletes her rows) — this can only ever turn it on.
  enabled: z.literal(true).optional(),
  habitLength: z.number().int().min(1).max(60).nullable().optional(),
  cycleLength: z.number().int().min(10).max(120).nullable().optional(),
  pregnantSince: isoDate.nullable().optional(),
  birthDate: isoDate.nullable().optional(),
  miscarriageDate: isoDate.nullable().optional(),
  gestationDays: z.number().int().min(0).max(320).nullable().optional(),
  contraception: z.boolean().optional(),
  ghuslReminder: z.boolean().optional(),
});

export const cycleRouter = router({
  getMine: protectedProcedure.query(async ({ ctx }) => {
    await assertWoman(ctx.user.id);
    return load(ctx.user.id);
  }),

  upsertDay: protectedProcedure
    .input(
      z.object({ date: isoDate, flow: flowEnum, color: colorEnum.nullable().optional(), ghusl: z.boolean().optional(), ifAbsent: z.boolean().optional() })
        .refine((v) => !v.color || v.flow === "blood", { message: "color only applies to flow: blood", path: ["color"] }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWoman(ctx.user.id);
      await assertEnabled(ctx.user.id);
      const { ifAbsent, ...day } = input;
      return db.upsertCycleDay(ctx.user.id, day, ifAbsent);
    }),

  deleteDay: protectedProcedure.input(z.object({ date: isoDate })).mutation(async ({ ctx, input }) => {
    await assertWoman(ctx.user.id);
    await assertEnabled(ctx.user.id);
    await db.deleteCycleDay(ctx.user.id, input.date);
  }),

  saveSettings: protectedProcedure.input(settingsPatch).mutation(async ({ ctx, input }) => {
    await assertWoman(ctx.user.id);
    return db.saveCycleSettings(ctx.user.id, input);
  }),

  disable: protectedProcedure.mutation(async ({ ctx }) => {
    await assertWoman(ctx.user.id);
    await db.disableCycleTracker(ctx.user.id);
  }),

  /**
   * Decision 15: a confirmed ACTIVE husband sees everything; nobody else
   * sees anything — never gated on hasFullPartnerAccess. getPartnersOfUser's
   * PartnerRecord (server/db.ts) keys the partner by `id`, not `userId`.
   */
  getPartner: protectedProcedure.input(z.object({ partnerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const me = ctx.user.id;
    if (input.partnerId === me) throw new TRPCError({ code: "FORBIDDEN", message: "not allowed" });
    if ((await genderOf(me)) !== "man") throw new TRPCError({ code: "FORBIDDEN", message: "not allowed" });
    if ((await genderOf(input.partnerId)) !== "vrouw") throw new TRPCError({ code: "FORBIDDEN", message: "not allowed" });
    const partners = await db.getPartnersOfUser(me);
    const active = partners.some((p) => p.id === input.partnerId && p.partnershipConfirmed);
    if (!active) throw new TRPCError({ code: "FORBIDDEN", message: "not allowed" });
    const data = await load(input.partnerId);
    // Privacy: never leak a not-enabled row's settings, even if one exists
    // from before she disabled (disable() deletes days but a fresh
    // saveSettings could in principle re-add a row with enabled:false).
    return data.enabled ? data : { enabled: false as const, settings: null, days: [] };
  }),
});
