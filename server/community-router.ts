/**
 * Community & Child Account Router
 * Handles: child accounts (12+), neighborhood groups, peer groups,
 * shared child updates (divorced parents), family reminders & activities
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";

function childNotFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "Child record not found" });
}

async function requireChildAccess(parentId: number, childAccountId: number) {
  const account = await db.getChildAccountForParent(parentId, childAccountId);
  if (!account) childNotFound();
  return account;
}

// ============================================================
// CHILD ACCOUNT ROUTER
// ============================================================
export const childAccountRouter = router({
  /** Create a child account (parent action) */
  create: protectedProcedure
    .input(z.object({
      childProfileId: z.number().optional(),
      ageGroup: z.enum(["12-14", "15-17", "18+"]),
      gender: z.enum(["male", "female"]),
      language: z.string().default("ar"),
      screenTimeLimit: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      // Generate a 6-digit access code
      const accessCode = String(Math.floor(100000 + Math.random() * 900000));
      const result = await db.createChildAccount({
        userId: 0, // Will be set when child logs in
        parentId: ctx.user.id,
        childProfileId: input.childProfileId || null,
        ageGroup: input.ageGroup,
        accessCode,
        gender: input.gender,
        language: input.language,
        screenTimeLimit: input.screenTimeLimit,
      });
      return { id: result?.id, accessCode };
    }),

  /** List child accounts for current parent */
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getChildAccountsByParent(ctx.user.id);
  }),

  /** Login as child (verify access code / ID) */
  login: protectedProcedure
    .input(z.object({ accessCode: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.getChildAccountByAccessCode(ctx.user.id, input.accessCode);
      if (!account) return { success: false, error: "invalid_code" };
      await db.updateChildAccountLastActive(account.id);
      return { success: true, account };
    }),

  /** Get a single child account details (for parent to show QR/ID) */
  getAccount: protectedProcedure
    .input(z.object({ childAccountId: z.number() }))
    .query(async ({ ctx, input }) => {
      const accounts = await db.getChildAccountsByParent(ctx.user.id);
      return accounts.find((a: any) => a.id === input.childAccountId) || null;
    }),

  /** Get challenges for a child account */
  getChallenges: protectedProcedure
    .input(z.object({ childAccountId: z.number(), date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await requireChildAccess(ctx.user.id, input.childAccountId);
      return db.getChildChallenges(input.childAccountId, input.date);
    }),

  /** Complete a challenge */
  completeChallenge: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const challenge = await db.getChildChallenge(input.challengeId);
      if (!challenge) childNotFound();
      await requireChildAccess(ctx.user.id, challenge.childAccountId);
      await db.completeChildChallenge(input.challengeId);
      return { success: true };
    }),

  /** Get achievements for a child account */
  getAchievements: protectedProcedure
    .input(z.object({ childAccountId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireChildAccess(ctx.user.id, input.childAccountId);
      return db.getChildAchievements(input.childAccountId);
    }),

  /** Log child activity */
  logActivity: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      activityType: z.string(),
      data: z.any().optional(),
      durationSeconds: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireChildAccess(ctx.user.id, input.childAccountId);
      await db.logChildActivity({
        childAccountId: input.childAccountId,
        activityType: input.activityType,
        data: input.data || null,
        durationSeconds: input.durationSeconds || null,
      });
      return { success: true };
    }),

  /** Get activity log (for parent monitoring) */
  getActivityLog: protectedProcedure
    .input(z.object({ childAccountId: z.number(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      await requireChildAccess(ctx.user.id, input.childAccountId);
      return db.getChildActivityLog(input.childAccountId, input.limit);
    }),
});

// ============================================================
// NEIGHBORHOOD ROUTER
// ============================================================
export const neighborhoodRouter = router({
  /** Create a neighborhood group */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(3),
      city: z.string().optional(),
      country: z.string().optional(),
      lat: z.string().optional(),
      lon: z.string().optional(),
      radiusKm: z.number().default(5),
      description: z.string().optional(),
      maxMembers: z.number().default(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const result = await db.createNeighborhoodGroup({
        ...input,
        inviteCode,
        createdBy: ctx.user.id,
      });
      // Auto-add creator as admin
      if (result?.id) {
        await db.addNeighborhoodMember({
          groupId: result.id,
          userId: ctx.user.id,
          role: "admin",
        });
      }
      return { id: result?.id, inviteCode };
    }),

  /** Find nearby groups */
  nearby: protectedProcedure
    .input(z.object({ lat: z.number(), lng: z.number(), radiusKm: z.number().default(5) }))
    .query(async ({ input }) => {
      return db.getNeighborhoodGroupsNearby(input.lat, input.lng, input.radiusKm);
    }),

  /** Join a group by invite code */
  join: protectedProcedure
    .input(z.object({ inviteCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Find group by invite code
      const database = await db.getDb();
      if (!database) return { success: false, error: "no_db" };
      const { neighborhoodGroups } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [group] = await database.select().from(neighborhoodGroups)
        .where(eq(neighborhoodGroups.inviteCode, input.inviteCode));
      if (!group) return { success: false, error: "invalid_code" };
      await db.addNeighborhoodMember({
        groupId: group.id,
        userId: ctx.user.id,
        role: "member",
      });
      return { success: true, groupId: group.id };
    }),

  /** Get members of a group */
  members: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      return db.getNeighborhoodMembers(input.groupId);
    }),

  /** Create an activity in a group */
  createActivity: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      title: z.string(),
      description: z.string().optional(),
      activityType: z.enum(["lesson", "children_activity", "cooperation", "social", "prayer"]),
      scheduledAt: z.string().optional(),
      location: z.string().optional(),
      maxParticipants: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.createNeighborhoodActivity({
        ...input,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        createdBy: ctx.user.id,
      });
      return { id: result?.id };
    }),

  /** Get activities for a group */
  activities: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      return db.getNeighborhoodActivities(input.groupId);
    }),
});

// ============================================================
// SHARED CHILD UPDATES ROUTER (Divorced parents)
// ============================================================
export const sharedUpdatesRouter = router({
  /** Create an update on a shared child */
  create: protectedProcedure
    .input(z.object({
      childId: z.number(),
      updateType: z.enum(["daily_report", "achievement", "concern", "wird", "behavior", "health"]),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.createSharedChildUpdate({
        childId: input.childId,
        authorId: ctx.user.id,
        updateType: input.updateType,
        content: input.content,
      });
      return { id: result?.id };
    }),

  /** Get updates for a child */
  list: protectedProcedure
    .input(z.object({ childId: z.number(), limit: z.number().default(30) }))
    .query(async ({ input }) => {
      return db.getSharedChildUpdates(input.childId, input.limit);
    }),

  /** Mark an update as read */
  markRead: protectedProcedure
    .input(z.object({ updateId: z.number() }))
    .mutation(async ({ input }) => {
      await db.markSharedUpdateRead(input.updateId);
      return { success: true };
    }),
});

// ============================================================
// FAMILY ACTIVITIES & REMINDERS ROUTER
// ============================================================
export const familyActivitiesRouter = router({
  /** Create a family reminder */
  createReminder: protectedProcedure
    .input(z.object({
      familyId: z.number(),
      title: z.string(),
      description: z.string().optional(),
      reminderType: z.enum(["prayer", "activity", "meeting", "other"]),
      scheduledAt: z.string().optional(),
      recurrence: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.createFamilyReminder({
        ...input,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        createdBy: ctx.user.id,
      });
      return { id: result?.id };
    }),

  /** Get reminders for a family */
  reminders: protectedProcedure
    .input(z.object({ familyId: z.number() }))
    .query(async ({ input }) => {
      return db.getFamilyReminders(input.familyId);
    }),

  /** Propose a family activity */
  proposeActivity: protectedProcedure
    .input(z.object({
      familyId: z.number(),
      title: z.string(),
      description: z.string().optional(),
      activityType: z.enum(["outing", "lesson", "game", "worship", "sport"]),
      proposedDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.createFamilyActivity({
        ...input,
        proposedBy: ctx.user.id,
      });
      return { id: result?.id };
    }),

  /** Get family activities */
  activities: protectedProcedure
    .input(z.object({ familyId: z.number() }))
    .query(async ({ input }) => {
      return db.getFamilyActivities(input.familyId);
    }),

  /** Vote on a family activity */
  vote: protectedProcedure
    .input(z.object({
      activityId: z.number(),
      vote: z.enum(["yes", "no", "maybe"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.voteFamilyActivity(input.activityId, ctx.user.id, input.vote);
      return { success: true };
    }),
});

// ============================================================
// PEER GROUPS ROUTER (Children's groups with parent approval)
// ============================================================
export const peerGroupsRouter = router({
  /** Create a peer group (parent action) */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(3),
      ageRange: z.enum(["12-14", "15-17", "18+"]),
      gender: z.enum(["male", "female", "mixed"]),
      parentApproval: z.boolean().default(true),
      maxMembers: z.number().default(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const result = await db.createPeerGroup({
        ...input,
        inviteCode,
        createdBy: ctx.user.id,
      });
      return { id: result?.id, inviteCode };
    }),

  /** Join a peer group (child action, requires parent approval) */
  join: protectedProcedure
    .input(z.object({ inviteCode: z.string(), childAccountId: z.number() }))
    .mutation(async ({ input }) => {
      const group = await db.getPeerGroupByCode(input.inviteCode);
      if (!group) return { success: false, error: "invalid_code" };
      const result = await db.addPeerGroupMember({
        groupId: group.id,
        childAccountId: input.childAccountId,
        approved: !group.parentApproval, // Auto-approve if no parent approval needed
      });
      return { success: true, memberId: result?.id, needsApproval: group.parentApproval };
    }),

  /** Approve a member (parent action) */
  approve: protectedProcedure
    .input(z.object({ memberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.approvePeerGroupMember(input.memberId, ctx.user.id);
      return { success: true };
    }),

  /** Get members of a group */
  members: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      return db.getPeerGroupMembers(input.groupId);
    }),
});

// ============================================================
// ENVIRONMENT ANALYSIS ROUTER
// ============================================================
export const environmentRouter = router({
  /** Get environment analyses for a child */
  get: protectedProcedure
    .input(z.object({ childId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      return db.getEnvironmentAnalyses(ctx.user.id, input.childId);
    }),

  /** Get latest analysis for a child */
  latest: protectedProcedure
    .input(z.object({ childId: z.number() }))
    .query(async ({ ctx, input }) => {
      return db.getLatestEnvironmentAnalysis(ctx.user.id, input.childId);
    }),

  /** Trigger a new analysis (uses LLM) */
  generate: protectedProcedure
    .input(z.object({ childId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const childData = await db.getChildById(input.childId);
      
      // Build analysis based on available data
      const analysisData = {
        strengths: [] as string[],
        weaknesses: [] as string[],
        risks: [] as string[],
        recommendations: [] as string[],
        summary: "تحليل البيئة التربوية",
      };

      // Basic analysis based on child profile
      if (childData) {
        analysisData.strengths.push("وجود اهتمام بالتربية (دليل: استخدام التطبيق)");
        analysisData.recommendations.push("المواظبة على المتابعة اليومية");
        analysisData.recommendations.push("تخصيص وقت يومي للحوار مع الابن/البنت");
      }

      const result = await db.createEnvironmentAnalysis({
        userId: ctx.user.id,
        childId: input.childId,
        analysisData,
        sources: { observations: 0 },
        autoGenerated: true,
      });
      return { id: result?.id, analysisData };
    }),
});
