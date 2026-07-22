import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { adviceRouter } from "./advice";
import { aiChatRouter } from "./ai-chat";
import { weeklyDataRouter } from "./weekly-data-api";
import { childAccountRouter, neighborhoodRouter, sharedUpdatesRouter, familyActivitiesRouter, peerGroupsRouter, environmentRouter } from "./community-router";
import { customTasksRouter, familyChatRouter, childSummaryRouter, childAiChatRouter, childAppUsageRouter, parentAiConsultRouter } from "./child-monitoring-router";
import * as db from "./db";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// CO-PARENT NOTIFICATION HELPERS
// ============================================================

/**
 * Notify co-parents when an activity/goal is completed.
 */
async function notifyCoParentsAboutActivity(userId: number, childId: number, goalTitle: string, status: string) {
  try {
    const child = await db.getChildById(childId);
    if (!child) return;
    const user = await db.getUserById(userId);
    const userName = user?.name || "Ouder";
    const childName = child.name || "kind";
    const linkedParents = await db.getLinkedParents(childId);
    const otherParents = linkedParents.filter(p => p.id !== userId);
    for (const parent of otherParents) {
      const lang = await db.getUserLanguage(parent.id);
      await db.sendMessage({
        familyId: 0,
        senderId: userId,
        recipientId: parent.id,
        childId: childId,
        type: "activity_update",
        subject: `${childName}`,
        content: db.tx(lang,
          `${userName} heeft activiteit "${goalTitle}" als voltooid gemarkeerd voor ${childName}.`,
          `${userName} marked activity "${goalTitle}" as completed for ${childName}.`,
          `قام ${userName} بإتمام نشاط "${goalTitle}" لـ ${childName}.`
        ),
      });
      db.sendLocalizedPush(
        parent.id,
        `Activiteit voltooid \u2014 ${childName}`, `Activity completed \u2014 ${childName}`, `\u062a\u0645 \u0625\u0646\u062c\u0627\u0632 \u0646\u0634\u0627\u0637 \u2014 ${childName}`,
        `${userName} heeft "${goalTitle}" afgerond.`, `${userName} completed "${goalTitle}".`, `${userName} \u0623\u0643\u0645\u0644 "${goalTitle}".`,
        { type: "activity_update", senderId: userId, childId }
      ).catch(() => {});
    }
  } catch (e) {
    console.warn("[NotifyCoParent] Activity notification error:", e);
  }
}

/**
 * Notify co-parents when environment data is updated for a child.
 */
async function notifyCoParentsAboutEnvironment(userId: number, childId: number) {
  try {
    const child = await db.getChildById(childId);
    if (!child) return;
    const user = await db.getUserById(userId);
    const userName = user?.name || "Ouder";
    const childName = child.name || "kind";
    const linkedParents = await db.getLinkedParents(childId);
    const otherParents = linkedParents.filter(p => p.id !== userId);
    for (const parent of otherParents) {
      const lang = await db.getUserLanguage(parent.id);
      await db.sendMessage({
        familyId: 0,
        senderId: userId,
        recipientId: parent.id,
        childId: childId,
        type: "environment_update",
        subject: `${childName}`,
        content: db.tx(lang,
          `${userName} heeft de omgevingsanalyse van ${childName} bijgewerkt. Bekijk de nieuwe gegevens.`,
          `${userName} updated the environment analysis for ${childName}. Check the new data.`,
          `قام ${userName} بتحديث تحليل بيئة ${childName}. اطلع على البيانات الجديدة.`
        ),
      });
      db.sendLocalizedPush(
        parent.id,
        `Omgevingsanalyse bijgewerkt \u2014 ${childName}`, `Environment updated \u2014 ${childName}`, `\u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0628\u064a\u0626\u0629 \u2014 ${childName}`,
        `${userName} heeft nieuwe gegevens ingevuld.`, `${userName} filled in new data.`, `${userName} \u0623\u062f\u062e\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u062c\u062f\u064a\u062f\u0629.`,
        { type: "environment_update", senderId: userId, childId }
      ).catch(() => {});
    }
  } catch (e) {
    console.warn("[NotifyCoParent] Environment notification error:", e);
  }
}

/**
 * Notify co-parents when a consultation/observation is added for a shared child.
 */
async function notifyCoParentsAboutConsultation(userId: number, childId: number, category: string, title: string) {
  try {
    const child = await db.getChildById(childId);
    if (!child) return;
    const user = await db.getUserById(userId);
    const userName = user?.name || "Ouder";
    const childName = child.name || "kind";
    const linkedParents = await db.getLinkedParents(childId);
    const otherParents = linkedParents.filter(p => p.id !== userId);
    for (const parent of otherParents) {
      const lang = await db.getUserLanguage(parent.id);
      await db.sendMessage({
        familyId: 0,
        senderId: userId,
        recipientId: parent.id,
        childId: childId,
        type: "consultation_share",
        subject: `${childName} \u2014 ${category}`,
        content: db.tx(lang,
          `${userName} heeft een vraag/observatie gedeeld over ${childName}: "${title}".`,
          `${userName} shared a question/observation about ${childName}: "${title}".`,
          `شارك ${userName} سؤالاً/ملاحظة عن ${childName}: "${title}".`
        ),
      });
      db.sendLocalizedPush(
        parent.id,
        `Nieuwe observatie \u2014 ${childName}`, `New observation \u2014 ${childName}`, `\u0645\u0644\u0627\u062d\u0638\u0629 \u062c\u062f\u064a\u062f\u0629 \u2014 ${childName}`,
        `${userName}: "${title}"`, `${userName}: "${title}"`, `${userName}: "${title}"`,
        { type: "consultation_share", senderId: userId, childId }
      ).catch(() => {});
    }
  } catch (e) {
    console.warn("[NotifyCoParent] Consultation notification error:", e);
  }
}

/**
 * Notify co-parents when a treatment plan is created or updated for a shared child.
 */
async function notifyCoParentsAboutTreatmentPlan(userId: number, childId: number, issueTitle: string, isUpdate: boolean) {
  try {
    const child = await db.getChildById(childId);
    if (!child) return;
    const user = await db.getUserById(userId);
    const userName = user?.name || "Ouder";
    const childName = child.name || "kind";
    const linkedParents = await db.getLinkedParents(childId);
    const otherParents = linkedParents.filter(p => p.id !== userId);
    for (const parent of otherParents) {
      const lang = await db.getUserLanguage(parent.id);
      const actionWord = isUpdate
        ? db.tx(lang, "bijgewerkt", "updated", "\u062d\u062f\u0651\u062b")
        : db.tx(lang, "aangemaakt", "created", "\u0623\u0646\u0634\u0623");
      await db.sendMessage({
        familyId: 0,
        senderId: userId,
        recipientId: parent.id,
        childId: childId,
        type: "treatment_plan_update",
        subject: `${childName}`,
        content: db.tx(lang,
          `${userName} heeft het behandelplan voor ${childName} ${actionWord}: "${issueTitle}".`,
          `${userName} ${actionWord} the treatment plan for ${childName}: "${issueTitle}".`,
          `${userName} ${actionWord} \u062e\u0637\u0629 \u0627\u0644\u0639\u0644\u0627\u062c \u0644\u0640 ${childName}: "${issueTitle}".`
        ),
      });
      db.sendLocalizedPush(
        parent.id,
        `Behandelplan ${actionWord} \u2014 ${childName}`, `Treatment plan ${actionWord} \u2014 ${childName}`, `\u062e\u0637\u0629 \u0639\u0644\u0627\u062c ${actionWord} \u2014 ${childName}`,
        `${userName}: "${issueTitle}"`, `${userName}: "${issueTitle}"`, `${userName}: "${issueTitle}"`,
        { type: "treatment_plan_update", senderId: userId, childId }
      ).catch(() => {});
    }
  } catch (e) {
    console.warn("[NotifyCoParent] Treatment plan notification error:", e);
  }
}

// ============================================================
// FAMILY ROUTER - Multi-user system (#1)
// ============================================================
const familyRouter = router({
  /** Create a new family */
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      return db.createFamily(input.name, ctx.user.id);
    }),

  /** Join a family by invite code */
  join: protectedProcedure
    .input(z.object({ inviteCode: z.string().min(1), role: z.string().default("familielid") }))
    .mutation(async ({ ctx, input }) => {
      const family = await db.getFamilyByInviteCode(input.inviteCode);
      if (!family) throw new Error("Ongeldige uitnodigingscode");
      await db.joinFamily(family.id, ctx.user.id, input.role);
      return { familyId: family.id, name: family.name };
    }),

  /** Get user's families */
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getUserFamilies(ctx.user.id);
  }),

  /** Get family members */
  members: protectedProcedure
    .input(z.object({ familyId: z.number() }))
    .query(async ({ input }) => {
      return db.getFamilyMembers(input.familyId);
    }),

  /** Update member role */
  updateRole: protectedProcedure
    .input(z.object({ memberId: z.number(), role: z.string() }))
    .mutation(async ({ input }) => {
      await db.updateMemberRole(input.memberId, input.role);
      return { success: true };
    }),
});

// ============================================================
// CHILDREN ROUTER - Shared child dossier
// ============================================================
const childrenRouter = router({
  /** Add a child to a family */
  add: protectedProcedure
    .input(z.object({
      familyId: z.number(),
      name: z.string().min(1),
      birthDate: z.string().optional(),
      gender: z.string().optional(),
      profileData: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.addChild({
        familyId: input.familyId,
        name: input.name,
        birthDate: input.birthDate,
        gender: input.gender,
        profileData: input.profileData ? JSON.stringify(input.profileData) : null,
        createdBy: ctx.user.id,
      });
      // Auto-generate public ID for the child if birthDate is provided
      let publicId: string | null = null;
      if (input.birthDate) {
        publicId = await db.generateChildPublicId(id, input.birthDate);
      }
      // Auto-link the creating parent to this child
      await db.linkParentToChild({
        parentId: ctx.user.id,
        childId: id,
        relationship: "parent",
        createdBy: ctx.user.id,
        canEdit: true,
      });
      return { id, publicId };
    }),

  /** Get children for a family */
  list: protectedProcedure
    .input(z.object({ familyId: z.number() }))
    .query(async ({ input }) => {
      return db.getFamilyChildren(input.familyId);
    }),

  /** Get single child */
  get: protectedProcedure
    .input(z.object({ childId: z.number() }))
    .query(async ({ input }) => {
      return db.getChildById(input.childId);
    }),

  /** Update child profile/environment */
  update: protectedProcedure
    .input(z.object({
      childId: z.number(),
      name: z.string().optional(),
      birthDate: z.string().optional(),
      gender: z.string().optional(),
      profileData: z.any().optional(),
      environmentData: z.any().optional(),
      profileCompleted: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { childId, ...data } = input;
      const hadEnvironmentData = !!data.environmentData;
      if (data.profileData) data.profileData = JSON.stringify(data.profileData);
      if (data.environmentData) data.environmentData = JSON.stringify(data.environmentData);
      await db.updateChild(childId, data);
      // Notify co-parents about environment data update
      if (hadEnvironmentData) {
        notifyCoParentsAboutEnvironment(ctx.user.id, childId).catch(() => {});
      }
      return { success: true };
    }),

    /** Delete child */
  delete: protectedProcedure
    .input(z.object({ childId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteChild(input.childId);
      return { success: true };
    }),
  /** Delete child by name+birthDate (used by client when local ID doesn't map to DB ID) */
  deleteByNameBirth: protectedProcedure
    .input(z.object({ name: z.string(), birthDate: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const linkedChildren = await db.getLinkedChildren(ctx.user.id);
      const match = linkedChildren.find(
        (c: any) => c.name === input.name && c.birthDate === input.birthDate
      );
      if (match) {
        await db.deleteChild(match.id);
      }
      return { success: true };
    }),
  /** Add observation */
  addObservation: protectedProcedure
    .input(z.object({
      childId: z.number(),
      category: z.string(),
      title: z.string(),
      description: z.string().optional(),
      severity: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.addObservation({
        childId: input.childId,
        authorId: ctx.user.id,
        category: input.category,
        title: input.title,
        description: input.description,
        severity: input.severity,
        tags: input.tags ? JSON.stringify(input.tags) : null,
      });
      // Notify co-parents about new observation/consultation
      notifyCoParentsAboutConsultation(ctx.user.id, input.childId, input.category, input.title).catch(() => {});
      return { id };
    }),

  /** Get observations for a child */
  observations: protectedProcedure
    .input(z.object({ childId: z.number(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      return db.getChildObservations(input.childId, input.limit);
    }),
});

// ============================================================
// MESSAGES ROUTER - Communication (#2)
// ============================================================
const messagesRouter = router({
  /** Send a message */
  send: protectedProcedure
    .input(z.object({
      familyId: z.number(),
      recipientId: z.number().optional(),
      childId: z.number().optional(),
      type: z.string().default("text"),
      subject: z.string().optional(),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.sendMessage({
        familyId: input.familyId,
        senderId: ctx.user.id,
        recipientId: input.recipientId,
        childId: input.childId,
        type: input.type,
        subject: input.subject,
        content: input.content,
      });
      return { id };
    }),

  /** Get messages for a family */
  list: protectedProcedure
    .input(z.object({ familyId: z.number() }))
    .query(async ({ ctx, input }) => {
      return db.getUserMessages(ctx.user.id, input.familyId);
    }),

  /** Mark message as read */
  markRead: protectedProcedure
    .input(z.object({ messageId: z.number() }))
    .mutation(async ({ input }) => {
      await db.markMessageRead(input.messageId);
      return { success: true };
    }),

  /** Get unread count */
  unreadCount: protectedProcedure
    .input(z.object({ familyId: z.number() }))
    .query(async ({ ctx, input }) => {
      return db.getUnreadCount(ctx.user.id, input.familyId);
    }),

  /** Mark all direct messages from a sender as read */
  markDirectRead: protectedProcedure
    .input(z.object({ senderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.markDirectMessagesRead(ctx.user.id, input.senderId);
      return { success: true };
    }),

  /** Get total unread count across all conversations */
  totalUnread: protectedProcedure.query(async ({ ctx }) => {
    return db.getTotalUnreadCount(ctx.user.id);
  }),
});

// ============================================================
// GOALS ROUTER - Weekly goal tracking
// ============================================================
const goalsRouter = router({
  /** Update goal progress */
  update: protectedProcedure
    .input(z.object({
      familyId: z.number(),
      childId: z.number(),
      weekId: z.string(),
      goalId: z.string(),
      goalTitle: z.string().optional(),
      status: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.upsertGoalProgress({
        familyId: input.familyId,
        childId: input.childId,
        weekId: input.weekId,
        goalId: input.goalId,
        status: input.status,
        notes: input.notes,
        markedBy: ctx.user.id,
      });
      // Notify co-parents about activity update
      if (input.status === "done" || input.status === "completed") {
        notifyCoParentsAboutActivity(ctx.user.id, input.childId, input.goalTitle || input.goalId, input.status).catch(() => {});
      }
      return { success: true };
    }),

  /** Get progress for a week */
  getWeek: protectedProcedure
    .input(z.object({ familyId: z.number(), childId: z.number(), weekId: z.string() }))
    .query(async ({ input }) => {
      return db.getWeekGoalProgress(input.familyId, input.childId, input.weekId);
    }),
});

// ============================================================
// CONTENT ROUTER - CMS (#7)
// ============================================================
const contentRouter = router({
  /** Create content (admin only) */
  create: protectedProcedure
    .input(z.object({
      type: z.string(),
      category: z.string().optional(),
      subCategory: z.string().optional(),
      ageRange: z.string().optional(),
      titleNl: z.string().optional(),
      titleEn: z.string().optional(),
      titleAr: z.string().optional(),
      contentNl: z.string().optional(),
      contentEn: z.string().optional(),
      contentAr: z.string().optional(),
      source: z.string().optional(),
      sourceEn: z.string().optional(),
      sourceAr: z.string().optional(),
      tags: z.array(z.string()).optional(),
      published: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createContent({
        ...input,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        authorId: ctx.user.id,
      });
      // Send push notification to all users when content is published
      if (input.published) {
        const tNl = input.titleNl || input.titleEn || input.titleAr || "Nieuwe content";
        const tEn = input.titleEn || input.titleNl || input.titleAr || "New content";
        const tAr = input.titleAr || input.titleNl || input.titleEn || "محتوى جديد";
        db.broadcastLocalizedPush(
          "Nieuw artikel gepubliceerd", "New article published", "مقال جديد",
          tNl, tEn, tAr,
          { type: "new_content", contentId: id }
        ).catch(() => {});
      }
      return { id };
    }),

  /** List content */
  list: protectedProcedure
    .input(z.object({ type: z.string().optional(), category: z.string().optional(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      return db.getContentList(input.type, input.category, input.limit);
    }),

  /** Get single content item */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getContentById(input.id);
    }),

  /** Update content (admin only) */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      type: z.string().optional(),
      category: z.string().optional(),
      subCategory: z.string().optional(),
      ageRange: z.string().optional(),
      titleNl: z.string().optional(),
      titleEn: z.string().optional(),
      titleAr: z.string().optional(),
      contentNl: z.string().optional(),
      contentEn: z.string().optional(),
      contentAr: z.string().optional(),
      source: z.string().optional(),
      sourceEn: z.string().optional(),
      sourceAr: z.string().optional(),
      tags: z.array(z.string()).optional(),
      published: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      if (data.tags) (data as any).tags = JSON.stringify(data.tags);
      await db.updateContent(id, data);
      // Send push notification when content is newly published
      if (data.published === true) {
        const tNl = (data.titleNl || data.titleEn || data.titleAr || "Nieuwe content") as string;
        const tEn = (data.titleEn || data.titleNl || data.titleAr || "New content") as string;
        const tAr = (data.titleAr || data.titleNl || data.titleEn || "محتوى جديد") as string;
        db.broadcastLocalizedPush(
          "Nieuw artikel gepubliceerd", "New article published", "مقال جديد",
          tNl, tEn, tAr,
          { type: "new_content", contentId: id }
        ).catch(() => {});
      }
      return { success: true };
    }),

  /** Delete content (admin only) */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteContent(input.id);
      return { success: true };
    }),

  /** Get CMS content by app section and language (public) */
  getBySection: publicProcedure
    .input(z.object({
      appSection: z.string(),
      language: z.string().default('nl'),
      contentType: z.string().optional(),
      limit: z.number().optional().default(50),
    }))
    .query(async ({ input }) => {
      return db.getCmsContentBySection(input.appSection, input.language, input.contentType, input.limit);
    }),

  /** Get single CMS content item with all translations (public) */
  getCmsItem: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getCmsContentItemWithTranslations(input.id);
    }),
});

// ============================================================
// NEWSLETTER ROUTER (#5)
// ============================================================
const newsletterRouter = router({
  /** Create newsletter (admin) */
  create: protectedProcedure
    .input(z.object({
      titleNl: z.string().optional(),
      titleEn: z.string().optional(),
      titleAr: z.string().optional(),
      contentNl: z.string().optional(),
      contentEn: z.string().optional(),
      contentAr: z.string().optional(),
      interactiveElements: z.any().optional(),
      audience: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await db.createNewsletter({
        ...input,
        interactiveElements: input.interactiveElements ? JSON.stringify(input.interactiveElements) : null,
      });
      return { id };
    }),

  /** List newsletters */
  list: protectedProcedure.query(async () => {
    return db.getNewsletters();
  }),

  /** Get single newsletter */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getNewsletterById(input.id);
    }),

  /** Update newsletter */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      titleNl: z.string().optional(),
      titleEn: z.string().optional(),
      titleAr: z.string().optional(),
      contentNl: z.string().optional(),
      contentEn: z.string().optional(),
      contentAr: z.string().optional(),
      interactiveElements: z.any().optional(),
      audience: z.string().optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      if (data.interactiveElements) (data as any).interactiveElements = JSON.stringify(data.interactiveElements);
      await db.updateNewsletter(id, data);
      return { success: true };
    }),

  /** Subscribe to newsletter */
  subscribe: publicProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().optional(),
      language: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.subscribeToNewsletter(input);
      return { success: true };
    }),

  /** Get subscribers (admin) */
  subscribers: protectedProcedure.query(async () => {
    return db.getNewsletterSubscribers();
  }),

  /** Record interaction */
  interact: publicProcedure
    .input(z.object({
      newsletterId: z.number(),
      subscriberId: z.number(),
      type: z.string(),
      data: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.recordNewsletterInteraction({
        newsletterId: input.newsletterId,
        subscriberId: input.subscriberId,
        type: input.type,
        data: input.data ? JSON.stringify(input.data) : null,
      });
      return { success: true };
    }),
});

// ============================================================
// ADMIN ROUTER (#6)
// ============================================================
const adminRouter = router({
  /** Get dashboard statistics */
  dashboard: protectedProcedure.query(async () => {
    return db.getDashboardStats();
  }),

  /** Get all users */
  users: protectedProcedure.query(async () => {
    return db.getAllUsers();
  }),

  /** Get all families with details */
  families: protectedProcedure.query(async () => {
    return db.getAllFamiliesDetailed();
  }),

  /** Get all children with details */
  children: protectedProcedure.query(async () => {
    return db.getAllChildrenDetailed();
  }),

  /** Get all specialists */
  specialists: protectedProcedure.query(async () => {
    return db.getAllSpecialists();
  }),

  /** Get all teachers */
  teachers: protectedProcedure.query(async () => {
    return db.getAllTeachers();
  }),

  /** Update user role */
  updateUserRole: protectedProcedure
    .input(z.object({ userId: z.number(), role: z.string() }))
    .mutation(async ({ input }) => {
      await db.updateUserRole(input.userId, input.role);
      return { success: true };
    }),

  /** Delete a family */
  deleteFamily: protectedProcedure
    .input(z.object({ familyId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteFamily(input.familyId);
      return { success: true };
    }),

  /** Delete a child */
  deleteChild: protectedProcedure
    .input(z.object({ childId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteChild(input.childId);
      return { success: true };
    }),

  /** Analytics: registrations over time */
  registrationAnalytics: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input }) => {
      return db.getRegistrationAnalytics(input.days);
    }),

  /** Analytics: active users over time */
  activeUsersAnalytics: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input }) => {
      return db.getActiveUsersAnalytics(input.days);
    }),

  /** Analytics: children by age group */
  childrenByAgeGroup: protectedProcedure.query(async () => {
    return db.getChildrenByAgeGroup();
  }),

  /** Analytics: families by size */
  familiesBySize: protectedProcedure.query(async () => {
    return db.getFamiliesBySize();
  }),

  /** Get stats over time */
  stats: protectedProcedure
    .input(z.object({ type: z.string().optional(), days: z.number().optional() }))
    .query(async ({ input }) => {
      return db.getStats(input.type, input.days);
    }),

  /** Record a stat */
  recordStat: protectedProcedure
    .input(z.object({ type: z.string(), value: z.number(), metadata: z.any().optional() }))
    .mutation(async ({ input }) => {
      await db.recordStat(input.type, input.value, input.metadata);
      return { success: true };
    }),

  /** AI Article Generator - generate article from source content */
  generateArticle: protectedProcedure
    .input(z.object({
      sourceContent: z.string().min(1),
      templateId: z.number().optional(),
      structure: z.object({
        sections: z.array(z.object({
          type: z.string(),
          title: z.string().optional(),
          description: z.string().optional(),
        })),
      }).optional(),
      settings: z.object({
        language: z.enum(["nl", "en", "ar", "all"]).default("all"),
        category: z.string(),
        subCategory: z.string().optional(),
        ageRange: z.string().optional(),
        audience: z.string().optional(),
        tone: z.string().optional(),
        maxWords: z.number().optional(),
        includeHadith: z.boolean().default(true),
        includeQuran: z.boolean().default(true),
        season: z.string().optional(),
      }),
      publishSettings: z.object({
        publishNow: z.boolean().default(false),
        scheduledDate: z.string().optional(),
        targetAudience: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Use the server's built-in LLM to generate the article
      const { invokeLLM } = await import("./_core/llm");
      
      const structurePrompt = input.structure
        ? `\nArticle structure:\n${input.structure.sections.map((s, i) => `${i + 1}. [${s.type}] ${s.title || ""}: ${s.description || ""}`).join("\n")}`
        : `\nArticle structure:\n1. [intro] Introduction with hook\n2. [islamic_context] Islamic foundation (Qur'aan/Hadieth)\n3. [practical] Practical advice for parents\n4. [examples] Real-life examples\n5. [action_steps] Concrete action steps\n6. [dua] Relevant dua/supplication\n7. [conclusion] Summary and encouragement`;

      const seasonContext = input.settings.season ? `\nSeason/period context: ${input.settings.season}` : "";
      const audienceContext = input.settings.audience ? `\nTarget audience: ${input.settings.audience}` : "";
      const toneContext = input.settings.tone ? `\nTone: ${input.settings.tone}` : "";
      const maxWordsContext = input.settings.maxWords ? `\nMax words: ${input.settings.maxWords}` : "\nMax words: 1500";

      const systemPrompt = `You are an expert Islamic parenting content writer. Generate a professional article based on the provided source material.
Category: ${input.settings.category}${input.settings.subCategory ? " / " + input.settings.subCategory : ""}
Age range: ${input.settings.ageRange || "all ages"}${structurePrompt}${seasonContext}${audienceContext}${toneContext}${maxWordsContext}
${input.settings.includeHadith ? "Include relevant authentic hadieth with references." : ""}
${input.settings.includeQuran ? "Include relevant Qur'aan verses with surah/ayah references." : ""}

Respond in JSON format:
{
  "titleNl": "Dutch title",
  "titleEn": "English title",
  "titleAr": "Arabic title",
  "excerptNl": "Dutch excerpt (2 sentences)",
  "excerptEn": "English excerpt",
  "excerptAr": "Arabic excerpt",
  "contentNl": "Full Dutch article in Markdown",
  "contentEn": "Full English article in Markdown",
  "contentAr": "Full Arabic article in Markdown",
  "source": "Primary hadith/quran reference (Dutch)",
  "sourceEn": "Primary reference (English)",
  "sourceAr": "Primary reference (Arabic)",
  "tags": ["tag1", "tag2"],
  "slug": "url-friendly-slug"
}`;

      const userPrompt = `Source material to base the article on:\n\n${input.sourceContent}`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 4000,
      });
      const msgContent = result.choices?.[0]?.message?.content;
      const response = typeof msgContent === "string" ? msgContent : JSON.stringify(msgContent) || "";

      let articleData: any;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        articleData = JSON.parse(jsonMatch?.[0] || response);
      } catch {
        articleData = {
          titleNl: "Gegenereerd artikel",
          titleEn: "Generated article",
          titleAr: "مقال مُنشأ",
          contentNl: response,
          contentEn: response,
          contentAr: response,
          slug: "generated-" + Date.now(),
          tags: [],
        };
      }

      // Save to database
      const articleId = await db.saveGeneratedArticle({
        ...articleData,
        category: input.settings.category,
        subCategory: input.settings.subCategory,
        ageRange: input.settings.ageRange,
        authorId: ctx.user.id,
        published: input.publishSettings?.publishNow ?? false,
      });

      return { id: articleId, ...articleData };
    }),

  /** Save article template */
  saveTemplate: protectedProcedure
    .input(z.object({
      name: z.string(),
      structure: z.object({
        sections: z.array(z.object({
          type: z.string(),
          title: z.string().optional(),
          description: z.string().optional(),
          required: z.boolean().optional(),
        })),
      }),
      defaultSettings: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await db.saveArticleTemplate(input);
      return { id };
    }),

  /** Get article templates */
  templates: protectedProcedure.query(async () => {
    return db.getArticleTemplates();
  }),

  /** Get scheduled articles */
  scheduledArticles: protectedProcedure.query(async () => {
    return db.getScheduledArticles();
  }),

  /** Send broadcast notification to all users (admin/super_admin only) */
  sendBroadcast: adminProcedure
    .input(z.object({
      subject: z.string().min(1),
      message: z.string().min(1),
      target: z.enum(["all", "parents", "admins"]).default("all"),
    }))
    .mutation(async ({ input }) => {
      const result = await db.broadcastPushNotification(
        input.subject,
        input.message,
        { type: "admin_broadcast", target: input.target }
      );
      return { success: true, sent: result.sent, target: input.target };
    }),

  /** Get system audit log (admin/super_admin only) */
  auditLog: adminProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async () => {
      // Return recent system events
      return [];
    }),

  /** Update system settings (admin/super_admin only) */
  updateSettings: adminProcedure
    .input(z.object({
      appName: z.string().optional(),
      defaultLanguage: z.string().optional(),
      registrationMode: z.enum(["open", "invite", "closed"]).optional(),
      notificationTime: z.string().optional(),
      sessionHours: z.number().optional(),
      maxLoginAttempts: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      // In production this would persist settings
      return { success: true, settings: input };
    }),

  /** Get all messages for admin review */
  messages: adminProcedure
    .input(z.object({ limit: z.number().default(100) }))
    .query(async ({ input }) => {
      return db.getRecentMessages(input.limit);
    }),

  /** Delete a user (super_admin only) */
  deleteUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Only super_admin can delete users
      if (ctx.user.role !== "super_admin") {
        throw new Error("Alleen Super Admin kan gebruikers verwijderen");
      }
      await db.deleteUser(input.userId);
      return { success: true };
    }),
});

// ============================================================
// USER PROFILE ROUTER
// ============================================================
const profileRouter = router({
  /** Save user profile to server */
  save: protectedProcedure
    .input(z.object({ profileData: z.any() }))
    .mutation(async ({ ctx, input }) => {
      // Detect what changed for precise notifications
      const oldUser = await db.getUserById(ctx.user.id);
      const oldData = (oldUser?.profileData as any) || {};
      const newData = input.profileData;
      
      await db.updateUserProfile(ctx.user.id, newData);
      // Sync language if present in parentProfile
      const lang = newData?.parentProfile?.language;
      if (lang && (lang === "nl" || lang === "en" || lang === "ar")) {
        await db.updateUserLanguage(ctx.user.id, lang);
      }
      
      // Send precise notification to partner about what changed
      try {
        const partner = await db.getPartnerOfUser(ctx.user.id);
        if (partner) {
          const changes: string[] = [];
          const senderName = ctx.user.name || "Partner";
          const partnerLang = await db.getUserLanguage(partner.id);
          
          // Check environment changes
          const oldEnvs = JSON.stringify(oldData.environments || []);
          const newEnvs = JSON.stringify(newData.environments || []);
          if (oldEnvs !== newEnvs) {
            const changedEnvs = (newData.environments || []).filter((e: any, i: number) => {
              return JSON.stringify(e) !== JSON.stringify((oldData.environments || [])[i]);
            });
            for (const env of changedEnvs) {
              const childName = env.childName || (newData.children || []).find((c: any) => c.id === env.childId)?.name || "";
              if (childName) {
                changes.push(db.tx(partnerLang,
                  `Omgevingsanalyse van ${childName} bijgewerkt`,
                  `Environment analysis of ${childName} updated`,
                  `\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u062a\u062d\u0644\u064a\u0644 \u0628\u064a\u0626\u0629 ${childName}`
                ));
              }
            }
          }
          
          // Check daily checkin changes
          const oldCheckins = (oldData.dailyCheckins || []).length;
          const newCheckins = (newData.dailyCheckins || []).length;
          if (newCheckins > oldCheckins) {
            changes.push(db.tx(partnerLang,
              `${newCheckins - oldCheckins} nieuwe dagelijkse check-in(s) ingevuld`,
              `${newCheckins - oldCheckins} new daily check-in(s) completed`,
              `\u062a\u0645 \u0625\u0643\u0645\u0627\u0644 ${newCheckins - oldCheckins} \u0645\u0631\u0627\u062c\u0639\u0629 \u064a\u0648\u0645\u064a\u0629 \u062c\u062f\u064a\u062f\u0629`
            ));
          }
          
          // Check issues changes (new issues added)
          const oldIssues = (oldData.issues || []).length;
          const newIssues = (newData.issues || []).length;
          if (newIssues > oldIssues) {
            const addedIssues = (newData.issues || []).slice(oldIssues);
            for (const issue of addedIssues) {
              const childName = (newData.children || []).find((c: any) => c.id === issue.childId)?.name || "";
              if (childName) {
                changes.push(db.tx(partnerLang,
                  `Nieuw probleem gemeld bij ${childName}: ${issue.description.substring(0, 50)}`,
                  `New issue reported for ${childName}: ${issue.description.substring(0, 50)}`,
                  `مشكلة جديدة بخصوص ${childName}: ${issue.description.substring(0, 50)}`
                ));
              }
            }
          }
          
          // Check parent profile changes
          const oldProfile = JSON.stringify(oldData.parentProfile || {});
          const newProfile = JSON.stringify(newData.parentProfile || {});
          if (oldProfile !== newProfile && oldProfile !== '{}') {
            changes.push(db.tx(partnerLang,
              `Persoonlijk profiel bijgewerkt`,
              `Personal profile updated`,
              `تم تحديث الملف الشخصي`
            ));
          }
          
          // Send notification if there are meaningful changes
          if (changes.length > 0) {
            await db.sendMessage({
              familyId: 0,
              senderId: ctx.user.id,
              recipientId: partner.id,
              type: "sync_update",
              subject: db.tx(partnerLang, "Gegevens bijgewerkt", "Data updated", "\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a"),
              content: `${senderName}: ${changes.join(" | ")}`,
            });
          }
        }
      } catch (notifyErr) {
        // Non-critical: don't fail the save if notification fails
        console.warn("[profile.save] Precise notification failed:", notifyErr);
      }
      // Auto-sync environments to the shared children table
      const environments = input.profileData?.environments;
      const profileChildren = input.profileData?.children;
      if (Array.isArray(environments) && Array.isArray(profileChildren)) {
        for (const env of environments) {
          if (!env.childId || !env.completed) continue;
          // Find the child in the profile to get name+birthDate
          const matchingChild = profileChildren.find((c: any) => c.id === env.childId);
          if (!matchingChild || !matchingChild.name || !matchingChild.birthDate) continue;
          // Find the shared DB child by name+birthDate
          try {
            const linkedChildren = await db.getLinkedChildren(ctx.user.id);
            const dbChild = linkedChildren.find(
              (c: any) => c.name === matchingChild.name && c.birthDate === matchingChild.birthDate
            );
            if (dbChild) {
              // Save environment data to the shared child record
              await db.updateChild(dbChild.id, { environmentData: env });
            }
          } catch (e) {
            console.warn("[profile.save] Auto-sync environment to shared child failed:", e);
          }
        }
      }

      // Auto-sync children to the database and link to parent
      const children = input.profileData?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          if (child.name && child.birthDate) {
            try {
              // Check if child already exists in DB by matching name+birthDate for this user
              const existingChildren = await db.getLinkedChildren(ctx.user.id);
              const alreadyExists = existingChildren.some(
                (c: any) => c.name === child.name && c.birthDate === child.birthDate
              );
              if (!alreadyExists) {
                // Get user's family (create if needed)
                const userFamilies = await db.getUserFamilies(ctx.user.id);
                let familyId: number;
                if (userFamilies.length > 0) {
                  familyId = userFamilies[0].id;
                } else {
                  const newFamily = await db.createFamily(child.name + "'s family", ctx.user.id);
                  familyId = newFamily.id;
                }
                const childId = await db.addChild({
                  familyId,
                  name: child.name,
                  birthDate: child.birthDate,
                  gender: child.gender || null,
                  profileData: null,
                  createdBy: ctx.user.id,
                });
                // Auto-generate public ID
                await db.generateChildPublicId(childId, child.birthDate);
                // Auto-link parent to child
                await db.linkParentToChild({
                  parentId: ctx.user.id,
                  childId,
                  relationship: "parent",
                  createdBy: ctx.user.id,
                  canEdit: true,
                });
                // Notify partner and auto-link new child to them
                try {
                  const partner = await db.getPartnerOfUser(ctx.user.id);
                  if (partner) {
                    // Auto-link partner to the new child
                    await db.linkParentToChild({
                      parentId: partner.id,
                      childId,
                      relationship: "parent",
                      createdBy: ctx.user.id,
                      canEdit: true,
                    });
                    // Send notification to partner
                    const senderName = ctx.user.name || "Partner";
                    const partnerLang = await db.getUserLanguage(partner.id);
                    const childName = child.name;
                    await db.sendMessage({
                      familyId: 0,
                      senderId: ctx.user.id,
                      recipientId: partner.id,
                      type: "child_added",
                      subject: db.tx(partnerLang, "Nieuw kind toegevoegd", "New child added", "\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 \u0637\u0641\u0644 \u062c\u062f\u064a\u062f"),
                      content: db.tx(partnerLang,
                        `${senderName} heeft ${childName} toegevoegd aan de familie.`,
                        `${senderName} added ${childName} to the family.`,
                        `${senderName} \u0623\u0636\u0627\u0641 ${childName} \u0625\u0644\u0649 \u0627\u0644\u0639\u0627\u0626\u0644\u0629.`
                      ),
                    });
                    db.sendLocalizedPush(
                      partner.id,
                      "Nieuw kind", "New child", "\u0637\u0641\u0644 \u062c\u062f\u064a\u062f",
                      `${senderName} heeft ${childName} toegevoegd`,
                      `${senderName} added ${childName}`,
                      `${senderName} \u0623\u0636\u0627\u0641 ${childName}`,
                      { type: "child_added", childName }
                    ).catch(() => {});
                  }
                } catch (notifyErr) {
                  console.warn("[profile.save] Partner notify failed:", notifyErr);
                }
              }
            } catch (e) {
              console.warn("[profile.save] Auto-sync child failed:", e);
            }
          }
        }
      }
      // Detect and soft-delete children that were removed from the local list
      // This ensures deleted children don't come back after reinstall
      if (Array.isArray(children)) {
        try {
          const linkedChildren = await db.getLinkedChildren(ctx.user.id);
          for (const dbChild of linkedChildren) {
            // Check if this DB child still exists in the local children list
            const stillExists = children.some(
              (c: any) => (c.name === dbChild.name && c.birthDate === dbChild.birthDate)
            );
            if (!stillExists) {
              // Child was removed locally - soft-delete from DB
              await db.deleteChild(dbChild.id);
              console.log(`[profile.save] Soft-deleted child ${dbChild.name} (id=${dbChild.id}) - removed by user`);
            }
          }
        } catch (e) {
          console.warn("[profile.save] Child deletion sync failed:", e);
        }
      }
      return { success: true };
    }),

  /** Get user profile from server */
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.getUserById(ctx.user.id);
    const profileData = user?.profileData as any;
    if (!profileData) return null;
    
    // Auto-populate partner info from partnerships table
    try {
      const partner = await db.getPartnerOfUser(ctx.user.id);
      if (partner) {
        if (!profileData.parentProfile) profileData.parentProfile = {};
        // Get partner's public ID
        const partnerUser = await db.getUserById(partner.id);
        const partnerPublicId = partnerUser?.publicId || "";
        // Always update partner info from the authoritative partnerships table
        profileData.parentProfile.partnerName = partner.name || profileData.parentProfile.partnerName || "";
        profileData.parentProfile.partnerId = partnerPublicId || profileData.parentProfile.partnerId || "";
      }
    } catch (e) {
      console.warn("[profile.get] Failed to populate partner info:", e);
    }

    // Merge server-linked children (from partner acceptance) into the profile children list
    try {
      const linkedChildren = await db.getLinkedChildren(ctx.user.id);
      if (linkedChildren.length > 0) {
        const existingChildren: any[] = profileData.children || [];
        const existingEnvs: any[] = profileData.environments || [];
        // Add linked children that are not already in the local list (by name+birthDate match)
        for (const lc of linkedChildren) {
          const alreadyExists = existingChildren.some(
            (ec: any) => ec.name === lc.name && ec.birthDate === lc.birthDate
          );
          if (!alreadyExists) {
            existingChildren.push({
              id: `server-${lc.id}`,
              name: lc.name,
              birthDate: lc.birthDate || "",
              gender: lc.gender || "jongen",
              environments: [],
            });
          }
          // Merge environment from shared DB child - always include partner's data
          if (lc.environmentData) {
            const localChild = existingChildren.find(
              (ec: any) => ec.name === lc.name && ec.birthDate === lc.birthDate
            );
            if (localChild) {
              const hasPartnerEnv = existingEnvs.some(
                (e: any) => e.childId === localChild.id && e.syncedFromPartner
              );
              if (!hasPartnerEnv) {
                // Add partner's environment with the local child's ID
                existingEnvs.push({
                  ...(lc.environmentData as any),
                  childId: localChild.id,
                  syncedFromPartner: true,
                });
              } else {
                // Update existing partner env with latest data
                const idx = existingEnvs.findIndex(
                  (e: any) => e.childId === localChild.id && e.syncedFromPartner
                );
                if (idx >= 0) {
                  existingEnvs[idx] = {
                    ...(lc.environmentData as any),
                    childId: localChild.id,
                    syncedFromPartner: true,
                  };
                }
              }
            }
          }
        }
        profileData.children = existingChildren;
        profileData.environments = existingEnvs;
      }
    } catch (e) {
      console.warn("[profile.get] Failed to merge linked children:", e);
    }
    
    return profileData;
  }),

  /** Update user's preferred language on the server */
  updateLanguage: protectedProcedure
    .input(z.object({ language: z.enum(["nl", "en", "ar"]) }))
    .mutation(async ({ ctx, input }) => {
      await db.updateUserLanguage(ctx.user.id, input.language);
      return { success: true };
    }),

  /** Update last active */
  heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
    await db.updateUserLastActive(ctx.user.id);
    return { success: true };
  }),

  /** Notify partner about treatment plan creation/update */
  notifyTreatmentPlanUpdate: protectedProcedure
    .input(z.object({
      childName: z.string(),
      childBirthDate: z.string(),
      issueTitle: z.string(),
      isUpdate: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Find the child in DB by name+birthDate for this user
      const linkedChildren = await db.getLinkedChildren(ctx.user.id);
      const dbChild = linkedChildren.find(
        (c: any) => c.name === input.childName && c.birthDate === input.childBirthDate
      );
      if (dbChild) {
        notifyCoParentsAboutTreatmentPlan(ctx.user.id, dbChild.id, input.issueTitle, input.isUpdate).catch(() => {});
      }
      return { success: true };
    }),
});

// ============================================================
// PARENT-CHILD LINKS ROUTER - Blended family support
// ============================================================
const linksRouter = router({
  /** Generate/get user's public ID */
  getMyId: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.getUserById(ctx.user.id);
    return { publicId: user?.publicId ?? null, birthDate: user?.birthDate ?? null };
  }),

  /** Set birth date and generate public ID for current user */
  generateMyId: protectedProcedure
    .input(z.object({ birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .mutation(async ({ ctx, input }) => {
      const publicId = await db.setUserBirthDateAndGenerateId(ctx.user.id, input.birthDate);
      return { publicId };
    }),

  /** Get a child's public ID (auto-generate if missing) */
  getChildId: protectedProcedure
    .input(z.object({ childId: z.number() }))
    .query(async ({ input }) => {
      const child = await db.getChildById(input.childId);
      if (!child) return { publicId: null };
      if (child.publicId) return { publicId: child.publicId };
      // Auto-generate if child has a birthDate
      if (child.birthDate) {
        const publicId = await db.generateChildPublicId(child.id, child.birthDate);
        return { publicId };
      }
      return { publicId: null };
    }),

  /** Generate public ID for a child (requires birthDate) */
  generateChildId: protectedProcedure
    .input(z.object({ childId: z.number(), birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .mutation(async ({ input }) => {
      const publicId = await db.generateChildPublicId(input.childId, input.birthDate);
      return { publicId };
    }),

  /** Set gender and auto-assign vader/moeder function */
  setMyGender: protectedProcedure
    .input(z.object({ gender: z.enum(["man", "vrouw"]) }))
    .mutation(async ({ ctx, input }) => {
      const autoFunc = input.gender === 'man' ? 'vader' : 'moeder';
      // Check if already assigned
      const existing = await db.getUserFunctions(ctx.user.id);
      const alreadyHas = existing.some((f: any) => f.functionRole === autoFunc);
      if (!alreadyHas) {
        await db.addUserFunction(ctx.user.id, autoFunc);
      }
      return { function: autoFunc };
    }),

  /** Link a child to current user by child's public ID */
  linkChildByPublicId: protectedProcedure
    .input(z.object({
      childPublicId: z.string().min(1),
      relationship: z.string().default("parent"),
    }))
    .mutation(async ({ ctx, input }) => {
      const cleanedChildId = input.childPublicId.trim().replace(/\s+/g, "_");
      const child = await db.linkChildByPublicId(cleanedChildId, ctx.user.id, input.relationship);
      if (!child) throw new Error("Kind niet gevonden met dit ID / Child not found with this ID");
      // Notify existing linked parents about the new link
      const existingParents = await db.getLinkedParents(child.id);
      const linkerName = ctx.user.name || "Een ouder";
      for (const parent of existingParents) {
        if (parent.id !== ctx.user.id) {
          // Store in-app notification for the other parent
          const parentLang = await db.getUserLanguage(parent.id);
          await db.sendMessage({
            familyId: 0,
            senderId: ctx.user.id,
            recipientId: parent.id,
            childId: child.id,
            type: "link_request",
            subject: db.tx(parentLang, "Koppelverzoek", "Link request", "طلب ربط"),
            content: db.tx(parentLang,
              `${linkerName} wil zich koppelen aan ${child.name} als ${input.relationship}. Accepteer of weiger dit verzoek.`,
              `${linkerName} wants to link to ${child.name} as ${input.relationship}. Accept or reject this request.`,
              `يريد ${linkerName} الربط بـ ${child.name} كـ ${input.relationship}. اقبل أو ارفض هذا الطلب.`
            ),
          });
          // Send push notification
          db.sendLocalizedPush(
            parent.id,
            "Nieuw koppelverzoek", "New link request", "طلب ربط جديد",
            `${linkerName} wil zich koppelen aan ${child.name}`,
            `${linkerName} wants to link to ${child.name}`,
            `يريد ${linkerName} الربط بـ ${child.name}`,
            { type: "link_request", linkerId: ctx.user.id, childId: child.id }
          ).catch(() => {});
        }
      }
      return { childId: child.id, childName: child.name, notifiedParents: existingParents.filter(p => p.id !== ctx.user.id).length };
    }),

  /** Get all children linked to current user */
  myLinkedChildren: protectedProcedure.query(async ({ ctx }) => {
    return db.getLinkedChildren(ctx.user.id);
  }),

  /** Get all parents linked to a specific child */
  childParents: protectedProcedure
    .input(z.object({ childId: z.number() }))
    .query(async ({ input }) => {
      return db.getLinkedParents(input.childId);
    }),

  /** Confirm a pending parent-child link (by linkId or by senderId for bulk confirm) */
  confirmLink: protectedProcedure
    .input(z.object({ linkId: z.number().optional(), senderId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.senderId) {
        // Bulk confirm: confirm all unconfirmed links created by senderId where parentId = current user
        await db.confirmAllLinksFromSender(input.senderId, ctx.user.id);
      } else if (input.linkId) {
        await db.confirmParentChildLink(input.linkId);
      }
      return { success: true };
    }),

  /** Remove a parent-child link (by linkId or by senderId for bulk reject) */
  removeLink: protectedProcedure
    .input(z.object({ linkId: z.number().optional(), senderId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.senderId) {
        // Bulk reject: remove all unconfirmed links created by senderId where parentId = current user
        await db.removeAllLinksFromSender(input.senderId, ctx.user.id);
      } else if (input.linkId) {
        await db.removeParentChildLink(input.linkId);
      }
      return { success: true };
    }),

  /** Look up a user by their public ID (for communication) */
  lookupUser: protectedProcedure
    .input(z.object({ publicId: z.string().min(1) }))
    .query(async ({ input }) => {
      // Trim whitespace and normalize the input
      const cleanedId = input.publicId.trim().replace(/\s+/g, "_");
      const user = await db.getUserByPublicId(cleanedId);
      if (!user) return null;
      return { id: user.id, name: user.name, publicId: user.publicId, role: user.role };
    }),

  /** Send a direct message to another parent (by user ID, about a shared child) */
  sendDirectMessage: protectedProcedure
    .input(z.object({
      recipientId: z.number(),
      childId: z.number().optional(),
      content: z.string().min(1),
      subject: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Find a shared family or use familyId=0 for direct messages
      const id = await db.sendMessage({
        familyId: 0, // Direct message (not family-scoped)
        senderId: ctx.user.id,
        recipientId: input.recipientId,
        childId: input.childId,
        type: "text",
        subject: input.subject,
        content: input.content,
      });
      // Send push notification to recipient
      const senderName = ctx.user.name || "Co-ouder";
      const preview = input.content.length > 60 ? input.content.substring(0, 60) + "..." : input.content;
      db.sendLocalizedPush(
        input.recipientId,
        `Nieuw bericht van ${senderName}`, `New message from ${senderName}`, `رسالة جديدة من ${senderName}`,
        preview, preview, preview,
        { type: "coparent_message", senderId: ctx.user.id, childId: input.childId }
      ).catch(() => {}); // Fire and forget
      return { id };
    }),

  /** Get direct messages (not family-scoped, between linked parents) */
  directMessages: protectedProcedure
    .input(z.object({ otherParentId: z.number() }))
    .query(async ({ ctx, input }) => {
      return db.getDirectMessages(ctx.user.id, input.otherParentId);
    }),

  /** Get all co-parents (parents who share children with the current user) */
  coParents: protectedProcedure.query(async ({ ctx }) => {
    return db.getCoParents(ctx.user.id);
  }),
  /** Link partner by their public ID (U-format) - shares all children with the other parent */
  linkPartnerByPublicId: protectedProcedure
    .input(z.object({
      partnerPublicId: z.string().min(1),
      relationship: z.string().default("partner"),
    }))
    .mutation(async ({ ctx, input }) => {
      const cleanedPartnerId = input.partnerPublicId.trim().replace(/\s+/g, "_");
      const partner = await db.getUserByPublicId(cleanedPartnerId);
      if (!partner) throw new Error("Gebruiker niet gevonden / User not found / \u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645");
      if (partner.id === ctx.user.id) throw new Error("Kan niet aan uzelf koppelen / Cannot link to yourself / \u0644\u0627 \u064a\u0645\u0643\u0646 \u0627\u0644\u0631\u0628\u0637 \u0628\u0646\u0641\u0633\u0643");
      
      // BIDIRECTIONAL: Link current user's children to partner
      const myChildren = await db.getLinkedChildren(ctx.user.id);
      let linkedToPartner = 0;
      for (const child of myChildren) {
        const existingParents = await db.getLinkedParents(child.id);
        const alreadyLinked = existingParents.some((p: any) => p.id === partner.id);
        if (!alreadyLinked) {
          await db.linkParentToChild({
            parentId: partner.id,
            childId: child.id,
            relationship: input.relationship,
            createdBy: ctx.user.id,
            canEdit: true,
          });
          linkedToPartner++;
        }
      }
      
      // BIDIRECTIONAL: Also link partner's children to current user
      const partnerChildren = await db.getLinkedChildren(partner.id);
      let linkedToMe = 0;
      for (const child of partnerChildren) {
        const existingParents = await db.getLinkedParents(child.id);
        const alreadyLinked = existingParents.some((p: any) => p.id === ctx.user.id);
        if (!alreadyLinked) {
          await db.linkParentToChild({
            parentId: ctx.user.id,
            childId: child.id,
            relationship: input.relationship,
            createdBy: ctx.user.id,
            canEdit: true,
          });
          linkedToMe++;
        }
      }
      
      const totalLinked = linkedToPartner + linkedToMe;
      
      // Persist partnership in DB (survives app reinstall)
      try {
        await db.createPartnership(ctx.user.id, partner.id, ctx.user.id);
      } catch (e) {
        console.warn("[linkPartner] createPartnership failed:", e);
      }
      
      // Auto-update both users' profileData with partner info (so it's immediately visible)
      try {
        // Update current user's profile with partner info
        const myUser = await db.getUserById(ctx.user.id);
        if (myUser?.profileData) {
          const myProfile = myUser.profileData as any;
          if (!myProfile.parentProfile) myProfile.parentProfile = {};
          myProfile.parentProfile.partnerName = partner.name || "";
          myProfile.parentProfile.partnerId = input.partnerPublicId.trim().replace(/\s+/g, "_");
          await db.updateUserProfile(ctx.user.id, myProfile);
        }
        // Update partner's profile with current user's info
        const partnerFullUser = await db.getUserById(partner.id);
        if (partnerFullUser?.profileData) {
          const partnerProfile = partnerFullUser.profileData as any;
          if (!partnerProfile.parentProfile) partnerProfile.parentProfile = {};
          partnerProfile.parentProfile.partnerName = ctx.user.name || "";
          partnerProfile.parentProfile.partnerId = myUser?.publicId || "";
          await db.updateUserProfile(partner.id, partnerProfile);
        }
      } catch (e) {
        console.warn("[linkPartner] Failed to update profileData with partner info:", e);
      }
      
      const senderName = ctx.user.name || "Partner";
      const partnerLang = await db.getUserLanguage(partner.id);
      await db.sendMessage({
        familyId: 0,
        senderId: ctx.user.id,
        recipientId: partner.id,
        type: "link_request",
        subject: db.tx(partnerLang, "Koppelverzoek", "Link request", "\u0637\u0644\u0628 \u0631\u0628\u0637"),
        content: db.tx(partnerLang,
          `${senderName} wil kinderen met u delen (${totalLinked} kind(eren) worden gedeeld).`,
          `${senderName} wants to share children with you (${totalLinked} child(ren) will be shared).`,
          `\u064a\u0631\u064a\u062f ${senderName} \u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0623\u0628\u0646\u0627\u0621 \u0645\u0639\u0643 (${totalLinked} \u0637\u0641\u0644/\u0623\u0637\u0641\u0627\u0644 \u0633\u064a\u062a\u0645 \u0645\u0634\u0627\u0631\u0643\u062a\u0647\u0645).`
        ),
      });
      db.sendLocalizedPush(
        partner.id,
        "Koppelverzoek", "Link request", "\u0637\u0644\u0628 \u0631\u0628\u0637",
        `${senderName} wil kinderen met u delen`, `${senderName} wants to share children with you`, `${senderName} \u064a\u0631\u064a\u062f \u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0623\u0628\u0646\u0627\u0621 \u0645\u0639\u0643`,
        { type: "partner_link", senderId: ctx.user.id }
      ).catch(() => {});
      return { partnerId: partner.id, partnerName: partner.name, linkedChildren: totalLinked };
    }),

  /** Get partner's full profile data for mutual visibility */
  getPartnerProfile: protectedProcedure.query(async ({ ctx }) => {
    const partner = await db.getPartnerOfUser(ctx.user.id);
    if (!partner) return null;
    const profileData = partner.profileData as any;
    return {
      id: partner.id,
      name: partner.name,
      gender: profileData?.parentProfile?.gender || null,
      parentProfile: profileData?.parentProfile || null,
      children: profileData?.children || [],
      environments: profileData?.environments || [],
      issues: profileData?.issues || [],
      actionPlans: profileData?.actionPlans || [],
      dailyCheckins: profileData?.dailyCheckins || [],
      dailyTipCompletions: profileData?.dailyTipCompletions || [],
      lastSyncedAt: profileData?.lastSyncedAt || null,
    };
  }),

  /** Full sync: pull all partner data and merge with local (called explicitly by user) */
  syncWithPartner: protectedProcedure.mutation(async ({ ctx }) => {
    const partner = await db.getPartnerOfUser(ctx.user.id);
    if (!partner) return { success: false, message: "No partner linked" };
    const partnerData = partner.profileData as any;
    const myUser = await db.getUserById(ctx.user.id);
    const myData = myUser?.profileData as any;
    if (!myData || !partnerData) return { success: false, message: "No data to sync" };

    // Merge children: add partner's children that I don't have
    const myChildren: any[] = myData.children || [];
    const partnerChildren: any[] = partnerData.children || [];
    let newChildrenCount = 0;
    for (const pc of partnerChildren) {
      const exists = myChildren.some(
        (mc: any) => (mc.name === pc.name && mc.birthDate === pc.birthDate) || mc.id === pc.id
      );
      if (!exists) {
        myChildren.push({ ...pc, syncedFromPartner: true });
        newChildrenCount++;
      }
    }

    // Merge environments: add partner's environments for shared children
    // Match by child name+birthDate since childIds differ between devices
    const myEnvs: any[] = myData.environments || [];
    const partnerEnvs: any[] = partnerData.environments || [];
    let newEnvsCount = 0;
    for (const pe of partnerEnvs) {
      if (!pe.completed) continue;
      // Find which partner child this environment belongs to
      const partnerChild = partnerChildren.find((pc: any) => pc.id === pe.childId);
      if (!partnerChild) continue;
      // Find the matching local child by name+birthDate
      const myChild = myChildren.find(
        (mc: any) => mc.name === partnerChild.name && mc.birthDate === partnerChild.birthDate
      );
      if (!myChild) continue;
      // Check if we already have a completed environment for this child
      const hasLocalEnv = myEnvs.some(
        (me: any) => me.childId === myChild.id && me.completed
      );
      if (!hasLocalEnv) {
        myEnvs.push({ ...pe, childId: myChild.id, syncedFromPartner: true });
        newEnvsCount++;
      }
    }

    // Merge issues: add partner's issues that I don't have (by ID or description+childId match)
    const myIssues: any[] = myData.issues || [];
    const partnerIssues: any[] = partnerData.issues || [];
    let newIssuesCount = 0;
    for (const pi of partnerIssues) {
      // Find matching local child by name+birthDate
      const partnerChild = partnerChildren.find((pc: any) => pc.id === pi.childId);
      const matchChild = partnerChild ? myChildren.find(
        (mc: any) => mc.name === partnerChild.name && mc.birthDate === partnerChild.birthDate
      ) : null;
      const targetChildId = matchChild ? matchChild.id : pi.childId;
      const exists = myIssues.some(
        (mi: any) => mi.id === pi.id || (mi.description === pi.description && mi.childId === targetChildId)
      );
      if (!exists) {
        myIssues.push({ ...pi, childId: targetChildId, syncedFromPartner: true });
        newIssuesCount++;
      }
    }

    // Merge action plans: add partner's plans that I don't have (by ID)
    const myPlans: any[] = myData.actionPlans || [];
    const partnerPlans: any[] = partnerData.actionPlans || [];
    let newPlansCount = 0;
    for (const pp of partnerPlans) {
      const exists = myPlans.some((mp: any) => mp.id === pp.id);
      if (!exists) {
        myPlans.push({ ...pp, syncedFromPartner: true });
        newPlansCount++;
      }
    }

    // Save merged data
    const mergedData = { ...myData, children: myChildren, environments: myEnvs, issues: myIssues, actionPlans: myPlans };
    await db.updateUserProfile(ctx.user.id, mergedData);

    // Send notification to partner about what was synced
    const partnerLang = await db.getUserLanguage(partner.id);
    const myName = ctx.user.name || "Partner";
    if (newChildrenCount > 0 || newEnvsCount > 0 || newIssuesCount > 0 || newPlansCount > 0) {
      const details: string[] = [];
      if (newChildrenCount > 0) details.push(db.tx(partnerLang,
        `${newChildrenCount} kind(eren) gesynchroniseerd`,
        `${newChildrenCount} child(ren) synced`,
        `${newChildrenCount} طفل/أطفال تمت مزامنتهم`
      ));
      if (newEnvsCount > 0) details.push(db.tx(partnerLang,
        `${newEnvsCount} omgevingsanalyse(s) gesynchroniseerd`,
        `${newEnvsCount} environment analysis synced`,
        `${newEnvsCount} تحليل بيئة تمت مزامنته`
      ));
      if (newIssuesCount > 0) details.push(db.tx(partnerLang,
        `${newIssuesCount} probleem/problemen gesynchroniseerd`,
        `${newIssuesCount} issue(s) synced`,
        `${newIssuesCount} مشكلة/مشكلات تمت مزامنتها`
      ));
      if (newPlansCount > 0) details.push(db.tx(partnerLang,
        `${newPlansCount} actieplan(nen) gesynchroniseerd`,
        `${newPlansCount} action plan(s) synced`,
        `${newPlansCount} خطة/خطط عمل تمت مزامنتها`
      ));
      await db.sendMessage({
        familyId: 0,
        senderId: ctx.user.id,
        recipientId: partner.id,
        type: "sync_update",
        subject: db.tx(partnerLang, "Gegevens gesynchroniseerd", "Data synced", "تمت المزامنة"),
        content: db.tx(partnerLang,
          `${myName} heeft gegevens gesynchroniseerd: ${details.join(", ")}`,
          `${myName} synced data: ${details.join(", ")}`,
          `${myName} قام بمزامنة البيانات: ${details.join("، ")}`
        ),
      });
    }

    return {
      success: true,
      merged: { children: newChildrenCount, environments: newEnvsCount, issues: newIssuesCount, actionPlans: newPlansCount },
      partnerData: {
        parentProfile: partnerData.parentProfile || null,
        dailyCheckins: partnerData.dailyCheckins || [],
        dailyTipCompletions: partnerData.dailyTipCompletions || [],
        environments: partnerData.environments || [],
        actionPlans: partnerData.actionPlans || [],
      },
    };
  }),

  /** Share weekly progress with partner via chat message + push notification */
  shareWeeklyProgress: protectedProcedure
    .input(z.object({
      childName: z.string(),
      weekNumber: z.number(),
      completedGoals: z.number(),
      totalGoals: z.number(),
      progressPercent: z.number(),
      summary: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const partner = await db.getPartnerOfUser(ctx.user.id);
      if (!partner) throw new Error("No linked partner found");
      const senderName = ctx.user.name || "Partner";
      const partnerLang = await db.getUserLanguage(partner.id);
      const content = db.tx(partnerLang,
        `${senderName} deelt de voortgang van ${input.childName} (week ${input.weekNumber}): ${input.completedGoals}/${input.totalGoals} doelen voltooid (${input.progressPercent}%).${input.summary ? "\n" + input.summary : ""}`,
        `${senderName} shares ${input.childName}'s progress (week ${input.weekNumber}): ${input.completedGoals}/${input.totalGoals} goals completed (${input.progressPercent}%).${input.summary ? "\n" + input.summary : ""}`,
        `${senderName} \u064a\u0634\u0627\u0631\u0643 \u062a\u0642\u062f\u0645 ${input.childName} (\u0627\u0644\u0623\u0633\u0628\u0648\u0639 ${input.weekNumber}): ${input.completedGoals}/${input.totalGoals} \u0623\u0647\u062f\u0627\u0641 \u0645\u0643\u062a\u0645\u0644\u0629 (${input.progressPercent}%).${input.summary ? "\n" + input.summary : ""}`
      );
      await db.sendMessage({
        familyId: 0,
        senderId: ctx.user.id,
        recipientId: partner.id,
        type: "progress_share",
        subject: db.tx(partnerLang, "Voortgang gedeeld", "Progress shared", "\u062a\u0645 \u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u062a\u0642\u062f\u0645"),
        content,
      });
      db.sendLocalizedPush(
        partner.id,
        `\u062a\u0642\u062f\u0645 ${input.childName}`, `${input.childName}'s progress`, `Voortgang ${input.childName}`,
        content, content, content,
        { type: "progress_share", childName: input.childName }
      ).catch(() => {});
      return { success: true };
    }),
});

// ============================================================
// SPECIALIST ROUTER - Specialist Portal
// ============================================================
const specialistRouter = router({
  /** Get specialist dashboard stats */
  stats: protectedProcedure.query(async ({ ctx }) => {
    return db.getSpecialistStats(ctx.user.id);
  }),

  /** Get assigned families */
  families: protectedProcedure.query(async ({ ctx }) => {
    return db.getSpecialistFamilies(ctx.user.id);
  }),

  /** Get children in assigned families */
  children: protectedProcedure.query(async ({ ctx }) => {
    return db.getSpecialistChildren(ctx.user.id);
  }),

  /** Get pending assignments */
  pendingAssignments: protectedProcedure.query(async ({ ctx }) => {
    return db.getPendingAssignments(ctx.user.id);
  }),

  /** Accept an assignment */
  acceptAssignment: protectedProcedure
    .input(z.object({ assignmentId: z.number() }))
    .mutation(async ({ input }) => {
      await db.acceptSpecialistAssignment(input.assignmentId);
      return { success: true };
    }),

  /** Create a treatment plan */
  createPlan: protectedProcedure
    .input(z.object({
      familyId: z.number(),
      childId: z.number(),
      title: z.string().min(1),
      issueDescription: z.string().optional(),
      planContent: z.string().optional(),
      priority: z.string().optional(),
      category: z.string().optional(),
      goals: z.array(z.object({ text: z.string(), completed: z.boolean().optional() })).optional(),
      startDate: z.string().optional(),
      targetEndDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createTreatmentPlan({
        ...input,
        specialistId: ctx.user.id,
        goals: input.goals ? JSON.stringify(input.goals) : null,
      });
      return { id };
    }),

  /** Get treatment plans for the specialist */
  plans: protectedProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return db.getSpecialistTreatmentPlans(ctx.user.id, input?.status);
    }),

  /** Get a single treatment plan */
  getPlan: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .query(async ({ input }) => {
      return db.getTreatmentPlanById(input.planId);
    }),

  /** Update a treatment plan */
  updatePlan: protectedProcedure
    .input(z.object({
      planId: z.number(),
      title: z.string().optional(),
      issueDescription: z.string().optional(),
      planContent: z.string().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      category: z.string().optional(),
      goals: z.array(z.object({ text: z.string(), completed: z.boolean().optional() })).optional(),
      targetEndDate: z.string().optional(),
      completedDate: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { planId, ...data } = input;
      if (data.goals) (data as any).goals = JSON.stringify(data.goals);
      await db.updateTreatmentPlan(planId, data);
      return { success: true };
    }),

  /** Get treatment plans for a child (visible to parents too) */
  childPlans: protectedProcedure
    .input(z.object({ childId: z.number() }))
    .query(async ({ input }) => {
      return db.getChildTreatmentPlans(input.childId);
    }),

  /** Get treatment plans for a family */
  familyPlans: protectedProcedure
    .input(z.object({ familyId: z.number() }))
    .query(async ({ input }) => {
      return db.getFamilyTreatmentPlans(input.familyId);
    }),

  /** Add a note to a treatment plan */
  addNote: protectedProcedure
    .input(z.object({
      treatmentPlanId: z.number(),
      type: z.string().default("feedback"),
      content: z.string().min(1),
      visibleToParents: z.boolean().optional(),
      pinned: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.addSpecialistNote({
        treatmentPlanId: input.treatmentPlanId,
        authorId: ctx.user.id,
        type: input.type,
        content: input.content,
        visibleToParents: input.visibleToParents ?? true,
        pinned: input.pinned ?? false,
      });
      return { id };
    }),

  /** Get notes for a treatment plan */
  planNotes: protectedProcedure
    .input(z.object({ treatmentPlanId: z.number(), includePrivate: z.boolean().optional() }))
    .query(async ({ input }) => {
      return db.getTreatmentPlanNotes(input.treatmentPlanId, input.includePrivate ?? false);
    }),

  /** Request specialist assignment (from family) */
  requestAssignment: protectedProcedure
    .input(z.object({
      specialistId: z.number(),
      familyId: z.number(),
      expertise: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createSpecialistAssignment({
        specialistId: input.specialistId,
        familyId: input.familyId,
        expertise: input.expertise,
        assignmentNotes: input.notes,
        assignedBy: ctx.user.id,
      });
      return { id };
    }),

  /** Get/create specialist profile */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return db.getSpecialistProfile(ctx.user.id);
  }),

  /** Update specialist profile (for specialists to set up their profile) */
  updateProfile: protectedProcedure
    .input(z.object({
      displayName: z.string().optional(),
      bio: z.string().optional(),
      expertise: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
      country: z.string().optional(),
      countryIso: z.string().optional(),
      city: z.string().optional(),
      lat: z.string().optional(),
      lon: z.string().optional(),
      phone: z.string().optional(),
      isAvailable: z.boolean().optional(),
      maxFamilies: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data: any = { ...input };
      if (input.expertise) data.expertise = JSON.stringify(input.expertise);
      if (input.languages) data.languages = JSON.stringify(input.languages);
      await db.upsertSpecialistProfile(ctx.user.id, data);
      return { success: true };
    }),

  /** Find nearest specialist (for parents) */
  findNearest: protectedProcedure
    .input(z.object({
      lat: z.number(),
      lon: z.number(),
      city: z.string().optional(),
      country: z.string().optional(),
    }))
    .query(async ({ input }) => {
      // Strategy: first try city, then nearest by coords, then country, then fallback phones
      let specialists: any[] = [];
      
      // 1. Try same city
      if (input.city) {
        specialists = await db.findSpecialistsByCity(input.city);
      }
      
      // 2. If no city match, find nearest by coordinates
      if (specialists.length === 0) {
        specialists = await db.findNearestSpecialist(input.lat, input.lon);
      }
      
      // 3. If still nothing, try country
      if (specialists.length === 0 && input.country) {
        specialists = await db.findSpecialistsByCountry(input.country);
      }
      
      // 4. Fallback: return phone numbers
      const fallbackPhones = await db.getFallbackPhoneNumbers();
      
      return {
        specialists: specialists.slice(0, 5), // Max 5 results
        fallbackPhones: specialists.length === 0 ? fallbackPhones : [],
        matchType: specialists.length > 0 
          ? (specialists[0]?.city?.toLowerCase().includes(input.city?.toLowerCase() || '') ? 'city' : 'nearest')
          : 'fallback',
      };
    }),

  /** Get all available specialists (browse) */
  browse: protectedProcedure.query(async () => {
    return db.getAvailableSpecialists();
  }),

  /** Get family analysis data (for specialist to view parent/child data) */
  familyAnalysis: protectedProcedure.query(async ({ ctx }) => {
    return db.getSpecialistFamilyAnalysis(ctx.user.id);
  }),

  /** Send message to a specialist (from parent) */
  sendMessage: protectedProcedure
    .input(z.object({
      specialistId: z.number(),
      content: z.string().min(1),
      childId: z.number().optional(),
      subject: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.sendMessage({
        familyId: 0, // Direct message
        senderId: ctx.user.id,
        recipientId: input.specialistId,
        childId: input.childId,
        type: "text",
        subject: input.subject,
        content: input.content,
      });
      // Send push notification to recipient
      const senderName = ctx.user.name || "Ouder";
      const preview = input.content.length > 50 ? input.content.substring(0, 50) + "..." : input.content;
      db.sendLocalizedPush(
        input.specialistId,
        `Nieuw bericht van ${senderName}`, `New message from ${senderName}`, `رسالة جديدة من ${senderName}`,
        preview, preview, preview,
        { type: "message", senderId: ctx.user.id }
      ).catch(() => {}); // Fire and forget
      return { id };
    }),

  /** Reply to a parent (specialist sends message) */
  replyToParent: protectedProcedure
    .input(z.object({
      parentId: z.number(),
      content: z.string().min(1),
      childId: z.number().optional(),
      subject: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.sendMessage({
        familyId: 0,
        senderId: ctx.user.id,
        recipientId: input.parentId,
        childId: input.childId,
        type: "text",
        subject: input.subject,
        content: input.content,
      });
      // Send push notification to parent
      const senderProfile = await db.getSpecialistProfile(ctx.user.id);
      const senderName = senderProfile?.displayName || "Specialist";
      const preview = input.content.length > 50 ? input.content.substring(0, 50) + "..." : input.content;
      db.sendLocalizedPush(
        input.parentId,
        `Nieuw bericht van ${senderName}`, `New message from ${senderName}`, `رسالة جديدة من ${senderName}`,
        preview, preview, preview,
        { type: "message", senderId: ctx.user.id }
      ).catch(() => {}); // Fire and forget
      return { id };
    }),

  /** Get messages with a specialist */
  getMessages: protectedProcedure
    .input(z.object({ specialistId: z.number() }))
    .query(async ({ ctx, input }) => {
      return db.getDirectMessages(ctx.user.id, input.specialistId);
    }),

  /** Update online status (specialist heartbeat) */
  heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
    await db.updateSpecialistOnlineStatus(ctx.user.id);
    return { success: true };
  }),

  /** Validate an invitation code (check if valid without using it) */
  validateInvitationCode: protectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(async ({ input }) => {
      const invitation = await db.validateInvitationCode(input.code);
      return { valid: !!invitation, restrictedEmail: invitation?.restrictedEmail ?? null };
    }),

  /** Register as specialist using invitation code */
  registerWithCode: protectedProcedure
    .input(z.object({
      code: z.string().min(1),
      displayName: z.string().min(1),
      bio: z.string().optional(),
      expertise: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
      country: z.string().optional(),
      countryIso: z.string().optional(),
      city: z.string().optional(),
      lat: z.string().optional(),
      lon: z.string().optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate code
      const invitation = await db.validateInvitationCode(input.code);
      if (!invitation) {
        throw new Error("Ongeldige of verlopen uitnodigingscode");
      }
      // Check restricted email
      if (invitation.restrictedEmail && invitation.restrictedEmail !== ctx.user.email) {
        throw new Error("Deze code is beperkt tot een ander e-mailadres");
      }
      // Use the code and promote user to specialist
      await db.useOldInvitationCode(input.code, ctx.user.id);
      // Create specialist profile
      const profileData: any = {
        displayName: input.displayName,
        bio: input.bio,
        country: input.country,
        countryIso: input.countryIso,
        city: input.city,
        lat: input.lat,
        lon: input.lon,
        phone: input.phone,
      };
      if (input.expertise) profileData.expertise = JSON.stringify(input.expertise);
      if (input.languages) profileData.languages = JSON.stringify(input.languages);
      await db.upsertSpecialistProfile(ctx.user.id, profileData);
      return { success: true };
    }),

  /** Generate invitation codes (admin only) */
  generateCodes: protectedProcedure
    .input(z.object({ count: z.number().min(1).max(20).default(5) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new Error("Alleen admins kunnen codes genereren");
      const codes: string[] = [];
      for (let i = 0; i < input.count; i++) {
        const code = await db.generateInvitationCode(ctx.user.id);
        codes.push(code);
      }
      return { codes };
    }),

  /** Register push token */
  registerPushToken: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await db.updateUserPushToken(ctx.user.id, input.token);
      return { success: true };
    }),
});

// ============================================================
// MOSQUES ROUTER - Static dataset + Nominatim fallback
// ============================================================
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Load static mosques dataset at startup
let staticMosques: any[] = [];
try {
  const mosquesPath = path.join(process.cwd(), "assets", "data", "mosques_nl.json");
  if (fs.existsSync(mosquesPath)) {
    staticMosques = JSON.parse(fs.readFileSync(mosquesPath, "utf-8"));
    console.log(`[mosques] Loaded ${staticMosques.length} mosques from static dataset`);
  }
} catch (e) {
  console.warn("[mosques] Failed to load static dataset");
}

const mosquesRouter = router({
  nearby: publicProcedure
    .input(z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      limit: z.number().min(1).max(200).default(100),
      radius_m: z.number().min(1).max(50000).default(20000),
      city: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { lat, lon, limit, radius_m, city } = input;
      
      // Step 1: Check static dataset for nearby mosques (within user-specified radius)
      let staticResults = staticMosques.map(m => ({
        name: m.name || "",
        name_ar: m.name || "",
        name_en: m.name || "",
        type: "mosque",
        city: m.city || "",
        street: "",
        housenumber: "",
        postcode: "",
        country: "NL",
        country_iso: "NL",
        lat: m.lat,
        lon: m.lon,
        phone: "",
        website: "",
        opening_hours: "",
        address: m.address || "",
        distance_m: Math.round(haversineDistance(lat, lon, m.lat, m.lon)),
      })).filter(m => m.distance_m <= radius_m);
      // If city is specified, also filter static results by city name
      if (city) {
        const cityLower = city.toLowerCase();
        staticResults = staticResults.filter(m => (m.city || "").toLowerCase().includes(cityLower));
      }
      
      // Step 2: Search Nominatim for mosques (covers all countries)
      let nominatimResults: typeof staticResults = [];
      try {
        // Convert radius_m to degrees (approx: 1 degree ~ 111km)
        const radiusDeg = Math.max(0.01, radius_m / 111000);
        // If city is provided, use city-based search instead of coordinate-based
        let url: string;
        if (city) {
          // Use q=mosque+city format which returns actual results (amenity+city returns 0)
          url = `https://nominatim.openstreetmap.org/search?q=mosque+${encodeURIComponent(city)}&format=json&limit=50&addressdetails=1&extratags=1`;
        } else {
          url = `https://nominatim.openstreetmap.org/search?amenity=place_of_worship&format=json&limit=100&addressdetails=1&extratags=1&bounded=1&viewbox=${lon-radiusDeg},${lat+radiusDeg},${lon+radiusDeg},${lat-radiusDeg}`;
        }
        const resp = await fetch(url, {
          headers: { "User-Agent": "OpvoedadviesApp/1.0" },
          signal: AbortSignal.timeout(12000),
        });
        if (resp.ok) {
          const data = await resp.json();
          // For city search (q=mosque+city), all results are relevant - skip strict filtering
          // For coordinate search, filter to mosques only
          let filtered = data;
          if (!city) {
            const mosqueKeywords = /mosque|masjid|مسجد|جامع|musalla|مصلى|moskee/i;
            filtered = data.filter((item: any) => {
              const tags = item.extratags || {};
              const religion = tags.religion || "";
              const name = item.display_name || "";
              return religion.toLowerCase().includes("muslim") || 
                     religion.toLowerCase().includes("islam") ||
                     mosqueKeywords.test(name) ||
                     mosqueKeywords.test(tags.denomination || "");
            });
          }
          nominatimResults = filtered.map((item: any) => {
            const itemLat = parseFloat(item.lat);
            const itemLon = parseFloat(item.lon);
            const addr = item.address || {};
            return {
              name: item.display_name?.split(",")[0] || "",
              name_ar: item.display_name?.split(",")[0] || "",
              name_en: item.display_name?.split(",")[0] || "",
              type: "mosque",
              city: addr.city || addr.town || addr.village || "",
              street: addr.road || "",
              housenumber: addr.house_number || "",
              postcode: addr.postcode || "",
              country: addr.country || "",
              country_iso: addr.country_code?.toUpperCase() || "",
              lat: itemLat,
              lon: itemLon,
              phone: "",
              website: "",
              opening_hours: "",
              address: [addr.road, addr.postcode, addr.city || addr.town].filter(Boolean).join(", "),
              distance_m: Math.round(haversineDistance(lat, lon, itemLat, itemLon)),
            };
          });
        }
        
        // If city specified but few results, try additional search terms
        if (city && nominatimResults.length < 10) {
          for (const term of ["moskee", "masjid", "islamic center"]) {
            try {
              const url3 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(term)}+${encodeURIComponent(city)}&format=json&limit=50&addressdetails=1&extratags=1`;
              const resp3 = await fetch(url3, {
                headers: { "User-Agent": "OpvoedadviesApp/1.0" },
                signal: AbortSignal.timeout(8000),
              });
              if (resp3.ok) {
                const data3 = await resp3.json();
                const extra = data3.map((item: any) => {
                  const itemLat = parseFloat(item.lat);
                  const itemLon = parseFloat(item.lon);
                  const addr = item.address || {};
                  return {
                    name: item.display_name?.split(",")[0] || "",
                    name_ar: item.display_name?.split(",")[0] || "",
                    name_en: item.display_name?.split(",")[0] || "",
                    type: "mosque",
                    city: addr.city || addr.town || addr.village || "",
                    street: addr.road || "",
                    housenumber: addr.house_number || "",
                    postcode: addr.postcode || "",
                    country: addr.country || "",
                    country_iso: addr.country_code?.toUpperCase() || "",
                    lat: itemLat,
                    lon: itemLon,
                    phone: "",
                    website: "",
                    opening_hours: "",
                    address: [addr.road, addr.postcode, addr.city || addr.town].filter(Boolean).join(", "),
                    distance_m: Math.round(haversineDistance(lat, lon, itemLat, itemLon)),
                  };
                });
                nominatimResults = [...nominatimResults, ...extra];
              }
            } catch { /* ignore */ }
          }
        }

        // If too few results and no city specified, try wider search
        if (nominatimResults.length < 5 && !city) {
          const widerRadius = Math.max(radiusDeg * 2, 0.2);
          const url2 = `https://nominatim.openstreetmap.org/search?amenity=place_of_worship&format=json&limit=100&addressdetails=1&extratags=1&bounded=1&viewbox=${lon-widerRadius},${lat+widerRadius},${lon+widerRadius},${lat-widerRadius}`;
          const resp2 = await fetch(url2, {
            headers: { "User-Agent": "OpvoedadviesApp/1.0" },
            signal: AbortSignal.timeout(12000),
          });
          if (resp2.ok) {
            const data2 = await resp2.json();
            const mosqueKeywords = /mosque|masjid|مسجد|جامع|musalla|مصلى|moskee/i;
            const filtered2 = data2.filter((item: any) => {
              const tags = item.extratags || {};
              const religion = tags.religion || "";
              const name = item.display_name || "";
              return religion.toLowerCase().includes("muslim") || 
                     religion.toLowerCase().includes("islam") ||
                     mosqueKeywords.test(name) ||
                     mosqueKeywords.test(tags.denomination || "");
            });
            const wider = filtered2.map((item: any) => {
              const itemLat = parseFloat(item.lat);
              const itemLon = parseFloat(item.lon);
              const addr = item.address || {};
              return {
                name: item.display_name?.split(",")[0] || "",
                name_ar: item.display_name?.split(",")[0] || "",
                name_en: item.display_name?.split(",")[0] || "",
                type: "mosque",
                city: addr.city || addr.town || addr.village || "",
                street: addr.road || "",
                housenumber: addr.house_number || "",
                postcode: addr.postcode || "",
                country: addr.country || "",
                country_iso: addr.country_code?.toUpperCase() || "",
                lat: itemLat,
                lon: itemLon,
                phone: "",
                website: "",
                opening_hours: "",
                address: [addr.road, addr.postcode, addr.city || addr.town].filter(Boolean).join(", "),
                distance_m: Math.round(haversineDistance(lat, lon, itemLat, itemLon)),
              };
            });
            nominatimResults = [...nominatimResults, ...wider];
          }
        }
      } catch (e: any) {
        console.warn("[mosques] Nominatim search failed:", e.message);
      }
      
      // Step 3: Merge static + Nominatim results, deduplicate by coordinates
      const allResults = [...staticResults, ...nominatimResults];
      const seen = new Set<string>();
      let deduped = allResults.filter(m => {
        const key = `${m.lat.toFixed(4)}_${m.lon.toFixed(4)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // Apply radius filter (skip if city search since results may be far from GPS)
      if (!city) {
        deduped = deduped.filter(m => m.distance_m <= radius_m);
      }
      // Sort by distance and return
      deduped.sort((a, b) => a.distance_m - b.distance_m);
      return deduped.slice(0, limit);
    }),
});

// ============================================================
// TRANSLATION ROUTER (on-demand Arabic -> NL/EN with DB caching)
// ============================================================
const memoryCache = new Map<string, string>();

const translateRouter = router({
  translateTexts: protectedProcedure
    .input(z.object({
      texts: z.array(z.string()).max(20),
      targetLang: z.enum(["nl", "en"]),
      context: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { texts, targetLang, context, category } = input;
      const results: string[] = new Array(texts.length).fill("");
      const toTranslate: { idx: number; text: string; hash: string }[] = [];

      // Step 1: Check memory cache first
      const hashMap: string[] = [];
      for (let i = 0; i < texts.length; i++) {
        const hash = db.getTextHash(texts[i]);
        hashMap.push(hash);
        const memKey = `${targetLang}:${hash}`;
        const cached = memoryCache.get(memKey);
        if (cached) {
          results[i] = cached;
        }
      }

      // Step 2: For items not in memory cache, check DB cache
      const missingFromMemory: number[] = [];
      for (let i = 0; i < texts.length; i++) {
        if (!results[i]) missingFromMemory.push(i);
      }

      if (missingFromMemory.length > 0) {
        const missingTexts = missingFromMemory.map(i => texts[i]);
        const dbCache = await db.getCachedTranslations(missingTexts, targetLang);
        
        for (const idx of missingFromMemory) {
          const hash = hashMap[idx];
          const dbResult = dbCache.get(hash);
          if (dbResult) {
            results[idx] = dbResult;
            // Also store in memory cache
            memoryCache.set(`${targetLang}:${hash}`, dbResult);
          } else {
            toTranslate.push({ idx, text: texts[idx], hash });
          }
        }
      }

      // Step 3: If all resolved, return
      if (toTranslate.length === 0) return { translations: results };

      // Step 4: Translate remaining via LLM
      try {
        const { invokeLLM } = await import("./_core/llm");
        const langName = targetLang === "nl" ? "Dutch" : "English";
        const contextHint = context ? `Context: ${context}. ` : "";
        const prompt = `${contextHint}Translate the following Arabic texts to ${langName}. Return ONLY a JSON array of translated strings in the same order. Keep Islamic terms transliterated (e.g. Tasfiya, Tazkiya, Tarbiya, Allah, Qur'aan, hadieth).\n\nTexts:\n${JSON.stringify(toTranslate.map(t => t.text))}`;

        const response = await invokeLLM({
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4000,
        });

        const rawContent = response.choices?.[0]?.message?.content;
        const contentStr = typeof rawContent === "string" ? rawContent : "";
        const jsonMatch = contentStr.match(/\[([\s\S]*?)\]/);
        if (jsonMatch) {
          const translated = JSON.parse(jsonMatch[0]);
          const toSave: { sourceText: string; translatedText: string; targetLang: "nl" | "en"; category?: string }[] = [];
          for (let i = 0; i < toTranslate.length && i < translated.length; i++) {
            const item = toTranslate[i];
            results[item.idx] = translated[i];
            // Store in memory cache
            memoryCache.set(`${targetLang}:${item.hash}`, translated[i]);
            // Prepare for DB save
            toSave.push({
              sourceText: item.text,
              translatedText: translated[i],
              targetLang,
              category: category || "general",
            });
          }
          // Save to DB (fire and forget - don't block response)
          db.saveTranslationsToCache(toSave).catch(e => {
            console.warn("[translate] Failed to save to DB cache:", e);
          });
        }
      } catch (e) {
        // On error, return original texts
        for (const item of toTranslate) {
          results[item.idx] = item.text;
        }
      }

      return { translations: results };
    }),
});

// ============================================================
// MAIN APP ROUTER
// ============================================================
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  // Existing routers
  advice: adviceRouter,
  aiChat: aiChatRouter,
  // New feature routers
  profile: profileRouter,
  family: familyRouter,
  children: childrenRouter,
  messages: messagesRouter,
  goals: goalsRouter,
  content: contentRouter,
  newsletter: newsletterRouter,
  admin: adminRouter,
  specialist: specialistRouter,
  links: linksRouter,
  mosques: mosquesRouter,
  weeklyData: weeklyDataRouter,
  translate: translateRouter,
  // Community & child account routers
  childAccount: childAccountRouter,
  neighborhood: neighborhoodRouter,
  sharedUpdates: sharedUpdatesRouter,
  familyActivities: familyActivitiesRouter,
  peerGroups: peerGroupsRouter,
  environment: environmentRouter,
  // Child monitoring system routers
  customTasks: customTasksRouter,
  familyChat: familyChatRouter,
  childSummary: childSummaryRouter,
  childAiChat: childAiChatRouter,
  childAppUsage: childAppUsageRouter,
  parentAiConsult: parentAiConsultRouter,
});

export type AppRouter = typeof appRouter;
