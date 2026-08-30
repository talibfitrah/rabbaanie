/**
 * ⚠ THIS FILE IS NOT DEPLOYED. It is a stale copy.
 *
 * The running API is a separate tree (rabbaanie-api, /home/murabbie/rabbaanie-api
 * on the VM) and has diverged from this one in both directions. Conclusions
 * drawn from THIS file about live behaviour have been wrong four times in one
 * night — procedures that are publicProcedure here are protectedProcedure there;
 * an `images` field absent here exists there; admin.users returns bare rows here
 * and computed completeness there; broadcast targeting is ignored here and
 * honoured there.
 *
 * Before reporting anything about how the server behaves — a bug, a security
 * finding, a missing field — check the same symbol in rabbaanie-api, or curl
 * api.rabbaanie.com. Reviewing this file alone produces confident false
 * findings, including ones that look severe.
 */
import {
  eq,
  and,
  desc,
  sql,
  isNull,
  isNotNull,
  or,
  like,
  inArray,
  gte,
  lte,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  InsertFamily,
  families,
  InsertFamilyMember,
  familyMembers,
  InsertChild,
  children,
  InsertChildObservation,
  childObservations,
  InsertMessage,
  messages,
  InsertGoalProgress,
  goalProgress,
  InsertContent,
  content,
  InsertNewsletter,
  newsletters,
  InsertNewsletterSubscriber,
  newsletterSubscribers,
  InsertNewsletterInteraction,
  newsletterInteractions,
  InsertAdminStat,
  adminStats,
  InsertAIConversation,
  aiConversations,
  InsertAIMessage,
  aiMessages,
  InsertTreatmentPlan,
  treatmentPlans,
  InsertSpecialistNote,
  specialistNotes,
  InsertSpecialistAssignment,
  specialistAssignments,
  InsertAuthor,
  authors,
  InsertParentChildLink,
  parentChildLinks,
  InsertSpecialistProfile,
  specialistProfiles,
  invitationCodes,
  InsertNetworkContact,
  networkContacts,
  userAuthorizationRoles,
  InsertUserAuthorizationRole,
  userFunctions,
  InsertUserFunction,
  contentCategories,
  contentItems,
  contentTranslations,
  contentFiles,
  functionInvitationCodes,
  spouseAdvice,
  InsertSpouseAdvice,
  dailyDiagnosticCheckins,
  translationCache as translationCacheTable,
  partnerships,
  environmentAnalysis,
  InsertEnvironmentAnalysis,
  childAccounts,
  InsertChildAccount,
  neighborhoodGroups,
  InsertNeighborhoodGroup,
  neighborhoodMembers,
  InsertNeighborhoodMember,
  neighborhoodActivities,
  InsertNeighborhoodActivity,
  childActivityLog,
  InsertChildActivityLog,
  childAchievements,
  InsertChildAchievement,
  childChallenges,
  InsertChildChallenge,
  peerGroups,
  InsertPeerGroup,
  peerGroupMembers,
  InsertPeerGroupMember,
  sharedChildUpdates,
  InsertSharedChildUpdate,
  familyReminders,
  InsertFamilyReminder,
  familyActivities,
  InsertFamilyActivity,
  childDailySummary,
  InsertChildDailySummary,
  customTasks,
  InsertCustomTask,
  familyChatMessages,
  InsertFamilyChatMessage,
  childAiConversations,
  InsertChildAiConversation,
  childAppUsage,
  InsertChildAppUsage,
  parentAiConsultations,
  InsertParentAiConsultation,
  broadcastSchedules,
  InsertBroadcastSchedule,
  broadcastSendLog,
  InsertBroadcastSendLog,
} from "../drizzle/schema";
// Family groups use existing `families` table - no separate familyGroups/familyGroupMembers tables
import { ENV } from "./_core/env";
import { isScheduleDue } from "./broadcast-schedule";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Get direct messages between two users (not family-scoped).
 */
export async function getDirectMessages(userId: number, otherUserId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(
      or(
        and(
          eq(messages.senderId, userId),
          eq(messages.recipientId, otherUserId),
        ),
        and(
          eq(messages.senderId, otherUserId),
          eq(messages.recipientId, userId),
        ),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(100);
}

// ============================================================
// USER OPERATIONS
// ============================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }
    await db
      .insert(users)
      .values(values)
      .onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  // Excludes soft-deleted accounts: every caller is an auth path
  // (sdk.authenticateRequest and the OAuth sign-in gate). Without this, a
  // deleted account keeps authenticating on its existing session token and can
  // sign in again, so deletion would not actually revoke access.
  const result = await db
    .select()
    .from(users)
    .where(and(eq(users.openId, openId), isNull(users.deletedAt)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Look up a user by email. Used by the OAuth gate to tell "no account at all"
 * apart from "account exists but was created with a password on the website" —
 * never to grant a session, because the OAuth userinfo carries no
 * email-verified flag and an unverified match would be an account-takeover.
 */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  // Soft-deleted accounts are excluded here too, so a deleted user gets
  // "no account" from the OAuth gate rather than "use your password".
  const result = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * `markOnboardingComplete` defaults to true (the historical behavior): most
 * callers (profile.save, syncWithPartner) are genuine full-profile saves
 * where "you saved a profile" already implies onboarding is done. Pass
 * false for a narrow remediation write — e.g. setMyGender, reachable long
 * after onboarding from the spouse-profile screen — that must not silently
 * flip a user's onboarding status as a side effect of fixing one field.
 */
export async function updateUserProfile(
  userId: number,
  profileData: unknown,
  opts: { markOnboardingComplete?: boolean } = {},
) {
  const db = await getDb();
  if (!db) return;
  // Extract key fields into dedicated columns for querying
  const data = profileData as any;
  const parentProfile = data?.parentProfile || {};
  const setFields: any = {
    profileData,
    lastActive: new Date(),
  };
  if (opts.markOnboardingComplete ?? true) setFields.onboardingCompleted = true;
  if (parentProfile.gender) setFields.gender = parentProfile.gender;
  if (parentProfile.maritalStatus)
    setFields.maritalStatus = parentProfile.maritalStatus;
  if (parentProfile.maritalStatus) {
    const hasKids =
      ["getrouwd", "gescheiden", "weduwe_weduwnaar"].includes(
        parentProfile.maritalStatus,
      ) && data?.children?.length > 0;
    setFields.hasChildren = hasKids;
  }
  await db.update(users).set(setFields).where(eq(users.id, userId));
}

export async function updateUserLanguage(userId: number, language: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ language, lastActive: new Date() })
    .where(eq(users.id, userId));
}

export async function updateUserLastActive(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ lastActive: new Date() })
    .where(eq(users.id, userId));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  // deleteUser is a soft delete, so without this three of the six callers saw
  // the deleted account: the admin list, exportUsersCSV (which carries name AND
  // email) and GET /admin-api/users. The other three (the broadcast paths) were
  // already covered by matchesAudience's own deletedAt check in
  // broadcast-audience.ts — filtering here means they stop depending on it.
  return db
    .select()
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt));
}

// ============================================================
// FAMILY OPERATIONS
// ============================================================

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createFamily(name: string, createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const inviteCode = generateInviteCode();
  const result = await db
    .insert(families)
    .values({ name, inviteCode, createdBy });
  const familyId = result[0].insertId;
  // Add creator as first member with full permissions
  await db.insert(familyMembers).values({
    familyId,
    userId: createdBy,
    role: "vader",
    accepted: true,
    permissions: JSON.stringify({
      canEditChildren: true,
      canViewAdvice: true,
      canMessage: true,
      canManageGoals: true,
    }),
  });
  return { id: familyId, inviteCode };
}

export async function getFamilyByInviteCode(inviteCode: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(families)
    .where(eq(families.inviteCode, inviteCode))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserFamilies(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.userId, userId),
        eq(familyMembers.accepted, true),
      ),
    );
  if (memberships.length === 0) return [];
  const familyIds = memberships.map((m) => m.familyId);
  const result = await db
    .select()
    .from(families)
    .where(
      sql`${families.id} IN (${sql.join(
        familyIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  return result.map((f) => ({
    ...f,
    membership: memberships.find((m) => m.familyId === f.id),
  }));
}

export async function getFamilyById(familyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [family] = await db
    .select()
    .from(families)
    .where(eq(families.id, familyId))
    .limit(1);
  return family;
}

export async function getFamilyMembership(userId: number, familyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [membership] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.userId, userId),
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.accepted, true),
      ),
    )
    .limit(1);
  return membership;
}

export async function getFamilyMemberById(memberId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [membership] = await db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.id, memberId))
    .limit(1);
  return membership;
}

export async function getFamilyMembers(familyId: number) {
  const db = await getDb();
  if (!db) return [];
  const members = await db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.familyId, familyId));
  const userIds = members.map((m) => m.userId);
  if (userIds.length === 0) return [];
  const userList = await db
    .select()
    .from(users)
    .where(
      sql`${users.id} IN (${sql.join(
        userIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  return members.map((m) => ({
    ...m,
    user: userList.find((u) => u.id === m.userId),
  }));
}

export async function joinFamily(
  familyId: number,
  userId: number,
  role: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(familyMembers).values({
    familyId,
    userId,
    role,
    accepted: true,
    permissions: JSON.stringify({
      canEditChildren: role !== "specialist",
      canViewAdvice: true,
      canMessage: true,
      canManageGoals: role !== "specialist",
    }),
  });
}

export async function updateMemberRole(memberId: number, role: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(familyMembers)
    .set({ role })
    .where(eq(familyMembers.id, memberId));
}

// ============================================================
// CHILDREN OPERATIONS
// ============================================================

export async function addChild(data: InsertChild) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(children).values(data);
  return result[0].insertId;
}

export async function getFamilyChildren(familyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(children)
    .where(and(eq(children.familyId, familyId), isNull(children.deletedAt)))
    .orderBy(children.name);
}

export async function getChildById(childId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(children)
    .where(and(eq(children.id, childId), isNull(children.deletedAt)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateChild(childId: number, data: Partial<InsertChild>) {
  const db = await getDb();
  if (!db) return;
  await db.update(children).set(data).where(eq(children.id, childId));
}

export async function deleteChild(childId: number) {
  const db = await getDb();
  if (!db) return;
  // Soft delete: mark as deleted but preserve data
  await db
    .update(children)
    .set({ deletedAt: new Date() })
    .where(eq(children.id, childId));
}

// ============================================================
// CHILD OBSERVATIONS
// ============================================================

export async function addObservation(data: InsertChildObservation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(childObservations).values(data);
  return result[0].insertId;
}

export async function getChildObservations(childId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(childObservations)
    .where(eq(childObservations.childId, childId))
    .orderBy(desc(childObservations.createdAt))
    .limit(limit);
}

// ============================================================
// MESSAGES
// ============================================================

export async function sendMessage(data: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(messages).values(data);
  return result[0].insertId;
}

export async function getFamilyMessages(familyId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(eq(messages.familyId, familyId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}

export async function getUserMessages(userId: number, familyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.familyId, familyId),
        or(
          eq(messages.recipientId, userId),
          isNull(messages.recipientId),
          eq(messages.senderId, userId),
        ),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(100);
}

export async function markMessageRead(messageId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(messages)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(messages.id, messageId));
}

export async function getMessageById(messageId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  return message;
}

/**
 * Mark all unread messages from a specific sender to the recipient as read.
 * Used for read receipts in direct messaging.
 */
export async function markDirectMessagesRead(
  recipientId: number,
  senderId: number,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(messages)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        or(
          and(
            eq(messages.senderId, senderId),
            eq(messages.recipientId, recipientId),
          ),
          and(
            eq(messages.senderId, senderId),
            eq(messages.familyId, 0),
            eq(messages.recipientId, recipientId),
          ),
        ),
        eq(messages.isRead, false),
      ),
    );
}

/**
 * Get total unread message count for a user (across all families and direct messages).
 */
export async function getTotalUnreadCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(
      and(
        eq(messages.isRead, false),
        or(eq(messages.recipientId, userId), isNull(messages.recipientId)),
        sql`${messages.senderId} != ${userId}`,
      ),
    );
  return result[0]?.count ?? 0;
}

export async function getUnreadCount(userId: number, familyId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(
      and(
        eq(messages.familyId, familyId),
        eq(messages.isRead, false),
        or(eq(messages.recipientId, userId), isNull(messages.recipientId)),
        sql`${messages.senderId} != ${userId}`,
      ),
    );
  return result[0]?.count ?? 0;
}

// ============================================================
// GOAL PROGRESS
// ============================================================

export async function upsertGoalProgress(data: InsertGoalProgress) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(goalProgress)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        status: data.status,
        notes: data.notes,
        markedBy: data.markedBy,
        completedAt: data.status === "completed" ? new Date() : null,
      },
    });
}

export async function getWeekGoalProgress(
  familyId: number,
  childId: number,
  weekId: string,
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(goalProgress)
    .where(
      and(
        eq(goalProgress.familyId, familyId),
        eq(goalProgress.childId, childId),
        eq(goalProgress.weekId, weekId),
      ),
    );
}

// ============================================================
// CONTENT MANAGEMENT
// ============================================================

export async function createContent(data: InsertContent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(content).values(data);
  return result[0].insertId;
}

export async function getContentList(
  type?: string,
  category?: string,
  limit = 50,
) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(content);
  const conditions = [];
  if (type) conditions.push(eq(content.type, type));
  if (category) conditions.push(eq(content.category, category));
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  return query.orderBy(desc(content.updatedAt)).limit(limit);
}

export async function getContentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(content)
    .where(eq(content.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateContent(id: number, data: Partial<InsertContent>) {
  const db = await getDb();
  if (!db) return;
  await db.update(content).set(data).where(eq(content.id, id));
}

export async function deleteContent(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(content).where(eq(content.id, id));
}

// ============================================================
// NEWSLETTERS
// ============================================================

export async function createNewsletter(data: InsertNewsletter) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(newsletters).values(data);
  return result[0].insertId;
}

export async function getNewsletters(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(newsletters)
    .orderBy(desc(newsletters.createdAt))
    .limit(limit);
}

export async function getNewsletterById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(newsletters)
    .where(eq(newsletters.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateNewsletter(
  id: number,
  data: Partial<InsertNewsletter>,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(newsletters).set(data).where(eq(newsletters.id, id));
}

export async function subscribeToNewsletter(data: InsertNewsletterSubscriber) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(newsletterSubscribers).values(data);
}

export async function getNewsletterSubscribers(active = true) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.active, active));
}

export async function recordNewsletterInteraction(
  data: InsertNewsletterInteraction,
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(newsletterInteractions).values(data);
}

// ============================================================
// ADMIN STATISTICS
// ============================================================

export async function recordStat(
  type: string,
  value: number,
  metadata?: unknown,
) {
  const db = await getDb();
  if (!db) return;
  const date = new Date().toISOString().split("T")[0];
  await db.insert(adminStats).values({
    type,
    date,
    value,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

export async function getStats(type?: string, days = 30) {
  const db = await getDb();
  if (!db) return [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const dateStr = startDate.toISOString().split("T")[0];
  const conditions = [sql`${adminStats.date} >= ${dateStr}`];
  if (type) conditions.push(eq(adminStats.type, type));
  return db
    .select()
    .from(adminStats)
    .where(and(...conditions))
    .orderBy(desc(adminStats.date));
}

export async function getDashboardStats() {
  const db = await getDb();
  if (!db)
    return {
      totalUsers: 0,
      totalFamilies: 0,
      totalChildren: 0,
      totalMessages: 0,
      totalConversations: 0,
    };
  // Same deletedAt filter the admin lists use — without it the dashboard
  // contradicts the list it links to ("42 users" over a list showing 41).
  const [userCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(isNull(users.deletedAt));
  const [familyCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(families);
  const [childCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(children)
    .where(isNull(children.deletedAt));
  const [msgCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages);
  const [convCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(parentAiConsultations);
  return {
    totalUsers: userCount?.count ?? 0,
    totalFamilies: familyCount?.count ?? 0,
    totalChildren: childCount?.count ?? 0,
    totalMessages: msgCount?.count ?? 0,
    totalConversations: convCount?.count ?? 0,
  };
}

// ============================================================
// SPECIALIST PORTAL
// ============================================================

/** Get families assigned to a specialist */
export async function getSpecialistFamilies(specialistId: number) {
  const db = await getDb();
  if (!db) return [];
  const assignments = await db
    .select()
    .from(specialistAssignments)
    .where(
      and(
        eq(specialistAssignments.specialistId, specialistId),
        eq(specialistAssignments.status, "active"),
      ),
    );
  if (assignments.length === 0) return [];
  const familyIds = assignments.map((a) => a.familyId);
  const familyList = await db
    .select()
    .from(families)
    .where(
      sql`${families.id} IN (${sql.join(
        familyIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  return assignments.map((a) => ({
    ...a,
    family: familyList.find((f) => f.id === a.familyId),
  }));
}

/** Get all children in families assigned to a specialist */
export async function getSpecialistChildren(specialistId: number) {
  const db = await getDb();
  if (!db) return [];
  const assignments = await db
    .select()
    .from(specialistAssignments)
    .where(
      and(
        eq(specialistAssignments.specialistId, specialistId),
        eq(specialistAssignments.status, "active"),
      ),
    );
  if (assignments.length === 0) return [];
  const familyIds = assignments.map((a) => a.familyId);
  return db
    .select()
    .from(children)
    .where(
      sql`${children.familyId} IN (${sql.join(
        familyIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
}

/** Create a treatment plan */
export async function createTreatmentPlan(data: InsertTreatmentPlan) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(treatmentPlans).values(data);
  return result[0].insertId;
}

/** Get treatment plans for a specialist */
export async function getSpecialistTreatmentPlans(
  specialistId: number,
  status?: string,
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(treatmentPlans.specialistId, specialistId)];
  if (status) conditions.push(eq(treatmentPlans.status, status));
  return db
    .select()
    .from(treatmentPlans)
    .where(and(...conditions))
    .orderBy(desc(treatmentPlans.updatedAt));
}

/** Get treatment plans for a child */
export async function getChildTreatmentPlans(childId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(treatmentPlans)
    .where(eq(treatmentPlans.childId, childId))
    .orderBy(desc(treatmentPlans.updatedAt));
}

/** Get treatment plans for a family */
export async function getFamilyTreatmentPlans(familyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(treatmentPlans)
    .where(eq(treatmentPlans.familyId, familyId))
    .orderBy(desc(treatmentPlans.updatedAt));
}

/** Get a single treatment plan */
export async function getTreatmentPlanById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(treatmentPlans)
    .where(eq(treatmentPlans.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getSpecialistAssignmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [assignment] = await db
    .select()
    .from(specialistAssignments)
    .where(eq(specialistAssignments.id, id))
    .limit(1);
  return assignment;
}

export async function hasActiveSpecialistAssignment(
  specialistId: number,
  familyId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [assignment] = await db
    .select({ id: specialistAssignments.id })
    .from(specialistAssignments)
    .where(
      and(
        eq(specialistAssignments.specialistId, specialistId),
        eq(specialistAssignments.familyId, familyId),
        eq(specialistAssignments.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(assignment);
}

/** Update a treatment plan */
export async function updateTreatmentPlan(
  id: number,
  data: Partial<InsertTreatmentPlan>,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(treatmentPlans).set(data).where(eq(treatmentPlans.id, id));
}

/** Add a specialist note */
export async function addSpecialistNote(data: InsertSpecialistNote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(specialistNotes).values(data);
  return result[0].insertId;
}

/** Get notes for a treatment plan */
export async function getTreatmentPlanNotes(
  treatmentPlanId: number,
  includePrivate = false,
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(specialistNotes.treatmentPlanId, treatmentPlanId)];
  if (!includePrivate)
    conditions.push(eq(specialistNotes.visibleToParents, true));
  return db
    .select()
    .from(specialistNotes)
    .where(and(...conditions))
    .orderBy(desc(specialistNotes.createdAt));
}

/** Create specialist assignment */
export async function createSpecialistAssignment(
  data: InsertSpecialistAssignment,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(specialistAssignments).values(data);
  return result[0].insertId;
}

/** Accept specialist assignment */
export async function acceptSpecialistAssignment(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(specialistAssignments)
    .set({ status: "active", acceptedAt: new Date() })
    .where(eq(specialistAssignments.id, id));
}

/** Get pending assignments for a specialist */
export async function getPendingAssignments(specialistId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(specialistAssignments)
    .where(
      and(
        eq(specialistAssignments.specialistId, specialistId),
        eq(specialistAssignments.status, "pending"),
      ),
    );
}

/** Get specialist overview stats */
export async function getSpecialistStats(specialistId: number) {
  const db = await getDb();
  if (!db)
    return {
      activePlans: 0,
      totalFamilies: 0,
      totalChildren: 0,
      pendingAssignments: 0,
      totalNotes: 0,
    };
  const [planCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(treatmentPlans)
    .where(
      and(
        eq(treatmentPlans.specialistId, specialistId),
        eq(treatmentPlans.status, "active"),
      ),
    );
  const [familyCount] = await db
    .select({ count: sql<number>`count(DISTINCT familyId)` })
    .from(specialistAssignments)
    .where(
      and(
        eq(specialistAssignments.specialistId, specialistId),
        eq(specialistAssignments.status, "active"),
      ),
    );
  const [pendingCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(specialistAssignments)
    .where(
      and(
        eq(specialistAssignments.specialistId, specialistId),
        eq(specialistAssignments.status, "pending"),
      ),
    );
  const [noteCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(specialistNotes)
    .where(eq(specialistNotes.authorId, specialistId));
  return {
    activePlans: planCount?.count ?? 0,
    totalFamilies: familyCount?.count ?? 0,
    totalChildren: 0,
    pendingAssignments: pendingCount?.count ?? 0,
    totalNotes: noteCount?.count ?? 0,
  };
}

// ============================================================
// ADMIN MANAGEMENT - Full CRUD for families, children, specialists, teachers
// ============================================================

/** Get all families with member counts and children counts */
export async function getAllFamiliesDetailed() {
  const db = await getDb();
  if (!db) return [];
  const allFamilies = await db
    .select()
    .from(families)
    .orderBy(desc(families.createdAt));
  // family_members rows survive their user (deleteUser preserves data, same as
  // parentChildLinks), so memberCount/members counted deleted accounts —
  // "3 leden" over a user list showing 2. Filtered against the live users read
  // rather than joined, to keep the row shape the callers below destructure.
  const liveUserIds = new Set(
    (
      await db
        .select({ id: users.id })
        .from(users)
        .where(isNull(users.deletedAt))
    ).map((u) => u.id),
  );
  const allMembers = (await db.select().from(familyMembers)).filter((m) =>
    liveUserIds.has(m.userId),
  );
  // Same soft-delete trap getCoParents was bitten by (it counted removed
  // children toward "shared children"): without this, childrenCount and
  // childrenList keep counting children that were deleted.
  const allChildren = await db
    .select()
    .from(children)
    .where(isNull(children.deletedAt));
  return allFamilies.map((f) => ({
    ...f,
    memberCount: allMembers.filter((m) => m.familyId === f.id).length,
    childrenCount: allChildren.filter((c) => c.familyId === f.id).length,
    members: allMembers.filter((m) => m.familyId === f.id),
    childrenList: allChildren.filter((c) => c.familyId === f.id),
  }));
}

/** Get all children with family info */
export async function getAllChildrenDetailed() {
  const db = await getDb();
  if (!db) return [];
  // deleteChild is a soft delete, so without this the admin children list and
  // exportChildrenCSV keep showing removed children.
  const allChildren = await db
    .select()
    .from(children)
    .where(isNull(children.deletedAt))
    .orderBy(desc(children.createdAt));
  const allFamilies = await db.select().from(families);
  return allChildren.map((c) => ({
    ...c,
    family: allFamilies.find((f) => f.id === c.familyId),
  }));
}

/** Get all specialists (users with specialist role) */
export async function getAllSpecialists() {
  const db = await getDb();
  if (!db) return [];
  const specialists = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "specialist"), isNull(users.deletedAt)));
  const assignments = await db.select().from(specialistAssignments);
  const plans = await db.select().from(treatmentPlans);
  return specialists.map((s) => ({
    ...s,
    assignmentCount: assignments.filter(
      (a) => a.specialistId === s.id && a.status === "active",
    ).length,
    planCount: plans.filter((p) => p.specialistId === s.id).length,
    assignments: assignments.filter((a) => a.specialistId === s.id),
  }));
}

/** Get all teachers (users with teacher role) */
export async function getAllTeachers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(users)
    .where(and(eq(users.role, "teacher"), isNull(users.deletedAt)));
}

/** Get all network contacts, optionally filtered by category */
export async function getNetworkContacts(category?: string) {
  const db = await getDb();
  if (!db) return [];
  if (category) {
    return db
      .select()
      .from(networkContacts)
      .where(eq(networkContacts.category, category as any))
      .orderBy(desc(networkContacts.createdAt));
  }
  return db
    .select()
    .from(networkContacts)
    .orderBy(desc(networkContacts.createdAt));
}

/** Add a network contact */
export async function addNetworkContact(data: InsertNetworkContact) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(networkContacts).values(data);
  return result[0].insertId;
}

/** Update a network contact */
export async function updateNetworkContact(
  id: number,
  data: Partial<InsertNetworkContact>,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(networkContacts).set(data).where(eq(networkContacts.id, id));
}

/** Delete a network contact */
export async function deleteNetworkContact(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(networkContacts).where(eq(networkContacts.id, id));
}

/** Update user role */
export async function updateUserRole(userId: number, role: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({
      role: role as
        | "user"
        | "admin"
        | "super_admin"
        | "moderator"
        | "specialist"
        | "teacher"
        | "kennisdrager"
        | "doctor",
    })
    .where(eq(users.id, userId));
}

// ═══════════════════════════════════════════════════════════════
// AUTHORIZATION ROLES (what a user can do in the system)
// ═══════════════════════════════════════════════════════════════

export async function getUserAuthRoles(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userAuthorizationRoles)
    .where(eq(userAuthorizationRoles.userId, userId));
}

export async function addUserAuthRole(
  userId: number,
  role: string,
  assignedBy?: number,
) {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select()
    .from(userAuthorizationRoles)
    .where(
      and(
        eq(userAuthorizationRoles.userId, userId),
        eq(userAuthorizationRoles.role, role as any),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;
  await db
    .insert(userAuthorizationRoles)
    .values({ userId, role: role as any, assignedBy });
}

export async function removeUserAuthRole(userId: number, role: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(userAuthorizationRoles)
    .where(
      and(
        eq(userAuthorizationRoles.userId, userId),
        eq(userAuthorizationRoles.role, role as any),
      ),
    );
}

export async function getAllUserAuthRoles() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userAuthorizationRoles);
}

// ═══════════════════════════════════════════════════════════════
// USER FUNCTIONS (what a user does in practice)
// ═══════════════════════════════════════════════════════════════

export async function getUserFunctions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userFunctions)
    .where(eq(userFunctions.userId, userId));
}

export async function addUserFunction(
  userId: number,
  functionRole: string,
  specialization?: string,
  city?: string,
  assignedBy?: number,
) {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select()
    .from(userFunctions)
    .where(
      and(
        eq(userFunctions.userId, userId),
        eq(userFunctions.functionRole, functionRole as any),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(userFunctions).values({
    userId,
    functionRole: functionRole as any,
    specialization,
    city,
    assignedBy,
  });
}

export async function removeUserFunction(userId: number, functionRole: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(userFunctions)
    .where(
      and(
        eq(userFunctions.userId, userId),
        eq(userFunctions.functionRole, functionRole as any),
      ),
    );
}

export async function getAllUserFunctions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userFunctions);
}

export async function userHasAuthRole(
  userId: number,
  role: string,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select()
    .from(userAuthorizationRoles)
    .where(
      and(
        eq(userAuthorizationRoles.userId, userId),
        eq(userAuthorizationRoles.role, role as any),
      ),
    )
    .limit(1);
  return result.length > 0;
}

export async function userIsAdmin(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const roles = await db
    .select()
    .from(userAuthorizationRoles)
    .where(eq(userAuthorizationRoles.userId, userId));
  return roles.some((r) =>
    ["super_admin", "admin", "moderator"].includes(r.role),
  );
}

/** Delete a family and all related data */
export async function deleteFamily(familyId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(familyMembers).where(eq(familyMembers.familyId, familyId));
  await db.delete(children).where(eq(children.familyId, familyId));
  await db.delete(messages).where(eq(messages.familyId, familyId));
  await db.delete(families).where(eq(families.id, familyId));
}

/** Get analytics: user registrations over time */
export async function getRegistrationAnalytics(days: number = 30) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 86400000);
  const results = await db
    .select({
      date: sql<string>`DATE(${users.createdAt})`,
      count: sql<number>`count(*)`,
    })
    .from(users)
    // Deliberate: this chart reads "signups still on the platform", not
    // "signups ever". A past day's bar therefore drops when one of those users
    // later deletes their account. Chosen for consistency with the erasure rule
    // the rest of this file follows — a deleted account appears in no admin
    // surface — over preserving the historical count.
    .where(and(sql`${users.createdAt} >= ${since}`, isNull(users.deletedAt)))
    .groupBy(sql`DATE(${users.createdAt})`)
    .orderBy(sql`DATE(${users.createdAt})`);
  return results;
}

/** Get analytics: active users per day */
export async function getActiveUsersAnalytics(days: number = 30) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 86400000);
  const results = await db
    .select({
      date: sql<string>`DATE(${users.lastActive})`,
      count: sql<number>`count(*)`,
    })
    .from(users)
    .where(and(sql`${users.lastActive} >= ${since}`, isNull(users.deletedAt)))
    .groupBy(sql`DATE(${users.lastActive})`)
    .orderBy(sql`DATE(${users.lastActive})`);
  return results;
}

/** Get analytics: children by age group */
export async function getChildrenByAgeGroup() {
  const db = await getDb();
  if (!db) return [];
  // Same filter as getDashboardStats.totalChildren — AnalyticsTab renders both
  // on one screen, so an unfiltered chart contradicts the tile above it.
  const allChildren = await db
    .select()
    .from(children)
    .where(isNull(children.deletedAt));
  const ageGroups: Record<string, number> = {
    "0-2": 0,
    "3-5": 0,
    "5-7": 0,
    "7-10": 0,
    "10-12": 0,
    "12-16": 0,
    "16+": 0,
  };
  allChildren.forEach((c) => {
    if (!c.birthDate) return;
    const age =
      (Date.now() - new Date(c.birthDate).getTime()) / (365.25 * 86400000);
    if (age < 2) ageGroups["0-2"]++;
    else if (age < 5) ageGroups["3-5"]++;
    else if (age < 7) ageGroups["5-7"]++;
    else if (age < 10) ageGroups["7-10"]++;
    else if (age < 12) ageGroups["10-12"]++;
    else if (age < 16) ageGroups["12-16"]++;
    else ageGroups["16+"]++;
  });
  return Object.entries(ageGroups).map(([group, count]) => ({ group, count }));
}

/** Get analytics: families by size */
export async function getFamiliesBySize() {
  const db = await getDb();
  if (!db) return [];
  const allFamilies = await db.select().from(families);
  const allChildren = await db
    .select()
    .from(children)
    .where(isNull(children.deletedAt));
  const sizes: Record<string, number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5+": 0,
  };
  allFamilies.forEach((f) => {
    const count = allChildren.filter((c) => c.familyId === f.id).length;
    if (count >= 5) sizes["5+"]++;
    else sizes[String(count || 1)]++;
  });
  return Object.entries(sizes).map(([size, count]) => ({ size, count }));
}

// ============================================================
// AI ARTICLE GENERATOR
// ============================================================

/** Save an article generation template */
export async function saveArticleTemplate(template: {
  name: string;
  structure: any;
  defaultSettings?: any;
}) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(content).values({
    type: "article_template",
    category: "template",
    titleNl: template.name,
    contentNl: JSON.stringify(template.structure),
    tags: template.defaultSettings,
    published: false,
  });
  return result.insertId;
}

/** Get all article templates */
export async function getArticleTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(content).where(eq(content.type, "article_template"));
}

/** Save a generated article */
export async function saveGeneratedArticle(article: {
  titleNl: string;
  titleEn?: string;
  titleAr?: string;
  contentNl: string;
  contentEn?: string;
  contentAr?: string;
  excerptNl?: string;
  excerptEn?: string;
  excerptAr?: string;
  category: string;
  subCategory?: string;
  ageRange?: string;
  source?: string;
  sourceEn?: string;
  sourceAr?: string;
  tags?: any;
  authorId?: number;
  slug: string;
  published?: boolean;
  scheduledAt?: Date;
}) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(content).values({
    type: "article",
    ...article,
    published: article.published ?? false,
  });
  return result.insertId;
}

/** Get scheduled articles */
export async function getScheduledArticles() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(content)
    .where(and(eq(content.type, "article"), eq(content.published, false)))
    .orderBy(desc(content.createdAt));
}

/** Publish scheduled articles that are due */
export async function publishDueArticles() {
  const db = await getDb();
  if (!db) return 0;
  const now = new Date();
  const result = await db
    .update(content)
    .set({ published: true })
    .where(
      and(
        eq(content.type, "article"),
        eq(content.published, false),
        sql`${content.sortOrder} > 0 AND ${content.createdAt} <= ${now}`,
      ),
    );
  return 0;
}

// ============================================================
// PUBLIC WEBSITE HELPERS
// ============================================================

export async function getPublishedArticles(category?: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(content.type, "article"), eq(content.published, true)];
  if (category) conditions.push(eq(content.category, category));
  return db
    .select()
    .from(content)
    .where(and(...conditions))
    .orderBy(desc(content.updatedAt))
    .limit(limit);
}

export async function getArticleBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(content)
    .where(and(eq(content.slug, slug), eq(content.type, "article")))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function searchArticles(query: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const searchTerm = `%${query}%`;
  return db
    .select()
    .from(content)
    .where(
      and(
        eq(content.type, "article"),
        eq(content.published, true),
        or(
          like(content.titleNl, searchTerm),
          like(content.titleEn, searchTerm),
          like(content.titleAr, searchTerm),
          like(content.contentNl, searchTerm),
          like(content.contentEn, searchTerm),
          like(content.contentAr, searchTerm),
        ),
      ),
    )
    .orderBy(desc(content.updatedAt))
    .limit(limit);
}

export async function getAllAuthors() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(authors).orderBy(desc(authors.articleCount));
}

export async function getAuthorBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(authors)
    .where(eq(authors.slug, slug))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getArticlesByAuthor(authorId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(content)
    .where(
      and(
        eq(content.type, "article"),
        eq(content.published, true),
        eq(content.authorId, authorId),
      ),
    )
    .orderBy(desc(content.updatedAt))
    .limit(limit);
}

// ============================================================
// PUBLIC ID SYSTEM & PARENT-CHILD LINKS
// ============================================================

/**
 * Get the 2-letter Dutch day abbreviation for a given date.
 * MA=Maandag, DI=Dinsdag, WO=Woensdag, DO=Donderdag, VR=Vrijdag, ZA=Zaterdag, ZO=Zondag
 */
function getDayLetters(dateStr: string): string {
  const days = ["ZO", "MA", "DI", "WO", "DO", "VR", "ZA"];
  const d = new Date(dateStr);
  return days[d.getDay()];
}

/**
 * Generate a unique public ID for a user.
 * Format: YYYYMMDD_XX_NNN where YYYYMMDD is birth date, XX is 2-letter day abbreviation, NNN is sequence number.
 * Example: 19850315_MA_001
 */
export async function generateUserPublicId(
  userId: number,
  birthDate: string,
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const datePart = birthDate.replace(/-/g, "");
  const dayLetters = getDayLetters(birthDate);
  const seqPart = String(userId).padStart(3, "0");
  const publicId = `${datePart}_${dayLetters}_${seqPart}`;
  await db
    .update(users)
    .set({ publicId, birthDate })
    .where(eq(users.id, userId));
  return publicId;
}

/**
 * Generate a unique public ID for a child.
 * Format: YYYYMMDD_XX_NNN where YYYYMMDD is birth date, XX is 2-letter day abbreviation, NNN is sequence number.
 * Example: 20180622_VR_012
 */
export async function generateChildPublicId(
  childId: number,
  birthDate: string,
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const datePart = birthDate.replace(/-/g, "");
  const dayLetters = getDayLetters(birthDate);
  const seqPart = String(childId).padStart(3, "0");
  const publicId = `${datePart}_${dayLetters}_${seqPart}`;
  await db.update(children).set({ publicId }).where(eq(children.id, childId));
  return publicId;
}

/**
 * Set user's birth date and generate their public ID.
 */
export async function setUserBirthDateAndGenerateId(
  userId: number,
  birthDate: string,
): Promise<string> {
  return generateUserPublicId(userId, birthDate);
}

/**
 * Get user by their public ID.
 * Performs case-insensitive search. If exact match fails, tries:
 * 1. Case-insensitive LIKE match
 * 2. Match by birthdate + userId (ignoring the day abbreviation in the middle)
 */
export async function getUserByPublicId(publicId: string) {
  const db = await getDb();
  if (!db) return undefined;
  // First try exact match. Every branch below carries isNull(users.deletedAt):
  // soft-delete preserves publicId, and this resolver feeds lookupUser (QR +
  // add-person) and linkPartnerByPublicId, so without it a scanned/typed deleted
  // account still resolves and can be linked as a live partner. Neither caller
  // is an authorization gate (that is getLinkedParents, left unfiltered), so
  // filtering here only stops resolving/linking to dead accounts.
  let result = await db
    .select()
    .from(users)
    .where(and(eq(users.publicId, publicId), isNull(users.deletedAt)))
    .limit(1);
  if (result.length > 0) return result[0];
  // Try case-insensitive match (UPPER comparison)
  const upper = publicId.toUpperCase();
  result = await db
    .select()
    .from(users)
    .where(and(sql`UPPER(${users.publicId}) = ${upper}`, isNull(users.deletedAt)))
    .limit(1);
  if (result.length > 0) return result[0];
  // Try matching by birthdate and userId parts only (skip the day abbreviation)
  // Format: YYYYMMDD_XX_NNN - extract first part and last part
  const parts = publicId.split("_");
  if (parts.length === 3) {
    const datePart = parts[0];
    const seqPart = parts[2];
    // Search: publicId starts with datePart and ends with seqPart
    result = await db
      .select()
      .from(users)
      .where(
        and(
          sql`${users.publicId} LIKE ${datePart + "_%_" + seqPart}`,
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    if (result.length > 0) return result[0];
  }
  // Also try if user entered without underscores or with different separators
  const cleaned = publicId.replace(/[-\s]/g, "_").toUpperCase();
  if (cleaned !== upper) {
    result = await db
      .select()
      .from(users)
      .where(and(sql`UPPER(${users.publicId}) = ${cleaned}`, isNull(users.deletedAt)))
      .limit(1);
    if (result.length > 0) return result[0];
  }
  return undefined;
}

/**
 * Get child by their public ID.
 * Performs case-insensitive search with fallback matching.
 */
export async function getChildByPublicId(publicId: string) {
  const db = await getDb();
  if (!db) return undefined;
  // Exact match first
  let result = await db
    .select()
    .from(children)
    .where(eq(children.publicId, publicId))
    .limit(1);
  if (result.length > 0) return result[0];
  // Case-insensitive match
  const upper = publicId.toUpperCase();
  result = await db
    .select()
    .from(children)
    .where(sql`UPPER(${children.publicId}) = ${upper}`)
    .limit(1);
  if (result.length > 0) return result[0];
  // Match by birthdate + childId (skip day abbreviation)
  const parts = publicId.split("_");
  if (parts.length === 3) {
    const datePart = parts[0];
    const seqPart = parts[2];
    result = await db
      .select()
      .from(children)
      .where(sql`${children.publicId} LIKE ${datePart + "_%_" + seqPart}`)
      .limit(1);
    if (result.length > 0) return result[0];
  }
  return undefined;
}

/**
 * Link a parent to a child (create parent-child link).
 * This allows multiple parents to be linked to the same child.
 */
export async function linkParentToChild(data: {
  parentId: number;
  childId: number;
  relationship: string;
  createdBy: number;
  canEdit?: boolean;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if link already exists
  const existing = await db
    .select()
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, data.parentId),
        eq(parentChildLinks.childId, data.childId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return existing[0].id; // Already linked
  }
  const [result] = await db.insert(parentChildLinks).values({
    parentId: data.parentId,
    childId: data.childId,
    relationship: data.relationship,
    canEdit: data.canEdit ?? true,
    confirmed: true, // Always confirm since partner linking is bidirectional and immediate
    createdBy: data.createdBy,
  });
  return result.insertId;
}

/**
 * Get all children linked to a parent (via parent_child_links).
 */
export async function getLinkedChildren(parentId: number) {
  const db = await getDb();
  if (!db) return [];
  const links = await db
    .select()
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, parentId),
        eq(parentChildLinks.confirmed, true),
      ),
    );
  if (links.length === 0) return [];
  const childIds = links.map((l) => l.childId);
  const childList = await db
    .select()
    .from(children)
    .where(
      sql`${children.id} IN (${sql.join(
        childIds.map((id) => sql`${id}`),
        sql`, `,
      )}) AND ${children.deletedAt} IS NULL`,
    );
  return childList.map((c) => ({
    ...c,
    link: links.find((l) => l.childId === c.id),
  }));
}

/**
 * Get all parents linked to a child.
 */
export async function getLinkedParents(childId: number) {
  const db = await getDb();
  if (!db) return [];
  const links = await db
    .select()
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.childId, childId),
        eq(parentChildLinks.confirmed, true),
      ),
    );
  if (links.length === 0) return [];
  const parentIds = links.map((l) => l.parentId);
  const parentList = await db
    .select()
    .from(users)
    .where(
      sql`${users.id} IN (${sql.join(
        parentIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  return parentList.map((p) => ({
    id: p.id,
    name: p.name,
    publicId: p.publicId,
    role: p.role,
    link: links.find((l) => l.parentId === p.id),
  }));
}

export async function getConfirmedParentChildLink(
  parentId: number,
  childId: number,
) {
  const db = await getDb();
  if (!db) return undefined;
  const [link] = await db
    .select()
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, parentId),
        eq(parentChildLinks.childId, childId),
        eq(parentChildLinks.confirmed, true),
      ),
    )
    .limit(1);
  return link;
}

export async function getParentChildLinkById(linkId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [link] = await db
    .select()
    .from(parentChildLinks)
    .where(eq(parentChildLinks.id, linkId))
    .limit(1);
  return link;
}

export async function getPendingLinksFromSender(senderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.createdBy, senderId),
        eq(parentChildLinks.confirmed, false),
      ),
    );
}

/**
 * Confirm a parent-child link (when the other parent accepts).
 */
export async function confirmParentChildLink(linkId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(parentChildLinks)
    .set({ confirmed: true })
    .where(eq(parentChildLinks.id, linkId));
}

/**
 * Confirm all unconfirmed links created by a sender for a specific parent.
 * Used when accepting a partner link request (bulk confirm all children).
 */
export async function confirmAllLinksFromSender(
  senderId: number,
  confirmingUserId: number,
) {
  const db = await getDb();
  if (!db) return;
  // Confirm links where sender linked themselves to confirming user's children
  await db
    .update(parentChildLinks)
    .set({ confirmed: true })
    .where(
      and(
        eq(parentChildLinks.parentId, senderId),
        eq(parentChildLinks.createdBy, senderId),
        eq(parentChildLinks.confirmed, false),
      ),
    );
  // Also confirm links where sender linked confirming user to sender's children (bidirectional)
  await db
    .update(parentChildLinks)
    .set({ confirmed: true })
    .where(
      and(
        eq(parentChildLinks.parentId, confirmingUserId),
        eq(parentChildLinks.createdBy, senderId),
        eq(parentChildLinks.confirmed, false),
      ),
    );
}

/**
 * Remove all unconfirmed links created by a sender for a specific parent (reject).
 */
export async function removeAllLinksFromSender(
  senderId: number,
  rejectingUserId: number,
) {
  const db = await getDb();
  if (!db) return;
  // Remove links where sender linked themselves to rejecting user's children
  await db
    .delete(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, senderId),
        eq(parentChildLinks.createdBy, senderId),
        eq(parentChildLinks.confirmed, false),
      ),
    );
  // Also remove links where sender linked rejecting user to sender's children (bidirectional)
  await db
    .delete(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, rejectingUserId),
        eq(parentChildLinks.createdBy, senderId),
        eq(parentChildLinks.confirmed, false),
      ),
    );
}

/**
 * Remove a parent-child link.
 */
export async function removeParentChildLink(linkId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(parentChildLinks).where(eq(parentChildLinks.id, linkId));
}

/**
 * Link child to parent by child's public ID (for sharing children between parents).
 * Returns the child if found, or null.
 */
export async function linkChildByPublicId(
  childPublicId: string,
  parentId: number,
  relationship: string,
) {
  const db = await getDb();
  if (!db) return null;
  const child = await getChildByPublicId(childPublicId);
  if (!child) return null;
  // Check if this child already has other parents linked
  const existingParents = await getLinkedParents(child.id);
  const hasOtherParents = existingParents.some((p) => p.id !== parentId);
  // If other parents exist, this link needs confirmation from them
  // We use a special wrapper to control confirmed status
  const linkDb = await getDb();
  if (!linkDb) return null;
  const existingLink = await linkDb
    .select()
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, parentId),
        eq(parentChildLinks.childId, child.id),
      ),
    )
    .limit(1);
  if (existingLink.length === 0) {
    await linkDb.insert(parentChildLinks).values({
      parentId,
      childId: child.id,
      relationship,
      canEdit: true,
      confirmed: !hasOtherParents, // Only auto-confirm if no other parents exist
      createdBy: parentId,
    });
  }
  return child;
}

/**
 * Get all co-parents (other parents who share at least one child with this user).
 * Returns a list of co-parents with their shared children.
 */
export async function getCoParents(userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Collect all co-parent IDs from two sources:
  // 1. partnerships table (persists across reinstalls)
  // 2. parentChildLinks table (shared children)
  const coParentMap = new Map<
    number,
    { relationship: string; sharedChildIds: number[] }
  >();

  // Source 1: partnerships table (always persists)
  try {
    const partnershipRows = await db
      .select()
      .from(partnerships)
      .where(
        and(
          or(
            eq(partnerships.userId1, userId),
            eq(partnerships.userId2, userId),
          ),
          eq(partnerships.status, "active"),
          eq(partnerships.confirmed, true),
        ),
      );
    for (const p of partnershipRows) {
      const partnerId = p.userId1 === userId ? p.userId2 : p.userId1;
      coParentMap.set(partnerId, {
        relationship: "partner",
        sharedChildIds: [],
      });
    }
  } catch (e) {
    console.warn(
      "[getCoParents] partnerships query failed (table may not exist yet):",
      e,
    );
  }

  // Source 2: parentChildLinks (shared children)
  const myLinks = await db
    .select()
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, userId),
        eq(parentChildLinks.confirmed, true),
      ),
    );
  const myChildIds = myLinks.map((l) => l.childId);

  if (myChildIds.length > 0) {
    const otherLinks = await db
      .select()
      .from(parentChildLinks)
      .where(
        sql`${parentChildLinks.childId} IN (${sql.join(
          myChildIds.map((id) => sql`${id}`),
          sql`, `,
        )}) AND ${parentChildLinks.parentId} != ${userId} AND ${parentChildLinks.confirmed} = true`,
      );

    for (const link of otherLinks) {
      const existing = coParentMap.get(link.parentId);
      if (existing) {
        existing.sharedChildIds.push(link.childId);
        if (link.relationship) existing.relationship = link.relationship;
      } else {
        coParentMap.set(link.parentId, {
          relationship: link.relationship || "parent",
          sharedChildIds: [link.childId],
        });
      }
    }
  }

  if (coParentMap.size === 0) return [];

  // Get parent details
  const otherParentIds = Array.from(coParentMap.keys());
  const parentList = await db
    .select()
    .from(users)
    .where(
      // deletedAt guard, same as this function's own children query below:
      // soft-delete preserves name/publicId, so without it a co-parent who
      // deleted their account is still surfaced by name/publicId in the
      // recipient's co-parent list. Safe to filter here — the sole caller
      // (linksRouter.coParents) is a self-scoped display query, not an
      // authorization gate (that role belongs to getLinkedParents, which is
      // deliberately left unfiltered; see the note on getFallbackPhoneNumbers).
      sql`${users.id} IN (${sql.join(
        otherParentIds.map((id) => sql`${id}`),
        sql`, `,
      )}) AND ${users.deletedAt} IS NULL`,
    );

  // Get child details for shared children
  const allSharedChildIds = Array.from(
    new Set(Array.from(coParentMap.values()).flatMap((v) => v.sharedChildIds)),
  );
  let childList: any[] = [];
  if (allSharedChildIds.length > 0) {
    childList = await db
      .select()
      .from(children)
      .where(
        // Item 4 (2005) fix: deleteChild is a soft delete (children.deletedAt
        // set, parentChildLinks rows for that child left untouched — see
        // deleteChild's own "preserve data" comment) and this query used to
        // have no deletedAt filter at all, unlike its sibling
        // getLinkedChildren (same file), which already excludes deleted rows
        // from its own children-table query. A removed child's
        // parentChildLinks rows kept matching myLinks/otherLinks above
        // forever, so its name/publicId kept surfacing here — inflating
        // "shared children" with children that no longer exist in the
        // family (reported live: 13 shown vs 9 real).
        sql`${children.id} IN (${sql.join(
          allSharedChildIds.map((id) => sql`${id}`),
          sql`, `,
        )}) AND ${children.deletedAt} IS NULL`,
      );
  }

  // Build co-parent list
  return parentList.map((parent) => {
    const info = coParentMap.get(parent.id)!;
    const sharedChildren = childList.filter((c) =>
      info.sharedChildIds.includes(c.id),
    );
    const profileData =
      typeof parent.profileData === "string"
        ? JSON.parse(parent.profileData as string)
        : parent.profileData || {};
    const gender =
      (profileData as any)?.parentProfile?.gender ||
      (profileData as any)?.gender ||
      null;
    return {
      id: parent.id,
      name: parent.name,
      publicId: parent.publicId,
      role: parent.role,
      gender,
      relationship: info.relationship,
      sharedChildren: sharedChildren.map((c) => ({
        id: c.id,
        name: c.name,
        publicId: c.publicId,
      })),
    };
  });
}

// ============================================================
// SPECIALIST PROFILES
// ============================================================

/** Create or update a specialist profile */
export async function upsertSpecialistProfile(
  userId: number,
  data: Partial<InsertSpecialistProfile>,
) {
  const db = await getDb();
  if (!db) return null;
  const existing = await db
    .select()
    .from(specialistProfiles)
    .where(eq(specialistProfiles.userId, userId));
  if (existing.length > 0) {
    await db
      .update(specialistProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(specialistProfiles.userId, userId));
    return existing[0].id;
  } else {
    const result = await db
      .insert(specialistProfiles)
      .values({ ...data, userId } as InsertSpecialistProfile);
    return (result as any)[0]?.insertId ?? null;
  }
}

/** Get a specialist profile by user ID */
export async function getSpecialistProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(specialistProfiles)
    .where(eq(specialistProfiles.userId, userId));
  return rows[0] ?? null;
}

/** Get all available specialists with their profiles */
type SpecialistDeps = { getUserFunctions?: typeof getUserFunctions };

/** Shared by all 4 specialist-listing functions below: looks up a profile's
 * user record and function roles, and shapes the combined result. Returns
 * null when the profile's user row is missing (mirrors each call site's
 * pre-existing "skip if no user row" behavior). Takes an injectable
 * getUserFunctions so callers can unit test the enrichment shape without a
 * live DB. */
export async function attachSpecialistUser(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  profile: any,
  deps: SpecialistDeps = {},
) {
  const getFunctions = deps.getUserFunctions ?? getUserFunctions;
  const userRows = await db
    .select()
    .from(users)
    // The root all four discovery paths share (getAvailableSpecialists,
    // findNearestSpecialist, findSpecialistsByCity, findSpecialistsByCountry).
    // This returns name AND email to parents, so without the guard a
    // specialist who deleted their account keeps being handed out — a wider
    // leak than the fallback path, which is only reached when these come back
    // empty. Guarded here rather than per-caller for that reason.
    .where(and(eq(users.id, profile.userId), isNull(users.deletedAt)));
  if (userRows.length === 0) return null;
  const functions = await getFunctions(profile.userId);
  return {
    ...profile,
    user: {
      id: userRows[0].id,
      name: userRows[0].name,
      email: userRows[0].email,
    },
    functionRoles: functions.map((f: any) => f.functionRole),
  };
}

export async function getAvailableSpecialists(deps: SpecialistDeps = {}) {
  const db = await getDb();
  if (!db) return [];
  const profiles = await db
    .select()
    .from(specialistProfiles)
    .where(eq(specialistProfiles.isAvailable, true));
  const result = [];
  for (const profile of profiles) {
    const enriched = await attachSpecialistUser(db, profile, deps);
    if (enriched) result.push(enriched);
  }
  return result;
}

/** Find nearest specialist by coordinates */
export async function findNearestSpecialist(
  lat: number,
  lon: number,
  excludeIds: number[] = [],
  deps: SpecialistDeps = {},
) {
  const db = await getDb();
  if (!db) return [];
  const profiles = await db
    .select()
    .from(specialistProfiles)
    .where(eq(specialistProfiles.isAvailable, true));

  // Calculate distances and sort
  const withDistance = profiles
    .filter((p) => p.lat && p.lon && !excludeIds.includes(p.userId))
    .map((p) => {
      const pLat = parseFloat(p.lat!);
      const pLon = parseFloat(p.lon!);
      // Haversine distance approximation in km
      const dLat = ((pLat - lat) * Math.PI) / 180;
      const dLon = ((pLon - lon) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((pLat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = 6371 * c; // km
      return { ...p, distance };
    })
    .sort((a, b) => a.distance - b.distance);

  const result = [];
  for (const profile of withDistance) {
    const enriched = await attachSpecialistUser(db, profile, deps);
    if (enriched) result.push(enriched);
  }
  return result;
}

/** Find specialists by city */
export async function findSpecialistsByCity(city: string, deps: SpecialistDeps = {}) {
  const db = await getDb();
  if (!db) return [];
  const profiles = await db
    .select()
    .from(specialistProfiles)
    .where(
      and(
        eq(specialistProfiles.isAvailable, true),
        like(specialistProfiles.city, `%${city}%`),
      ),
    );
  const result = [];
  for (const profile of profiles) {
    const enriched = await attachSpecialistUser(db, profile, deps);
    if (enriched) result.push(enriched);
  }
  return result;
}

/** Find specialists by country */
export async function findSpecialistsByCountry(country: string, deps: SpecialistDeps = {}) {
  const db = await getDb();
  if (!db) return [];
  const profiles = await db
    .select()
    .from(specialistProfiles)
    .where(
      and(
        eq(specialistProfiles.isAvailable, true),
        like(specialistProfiles.country, `%${country}%`),
      ),
    );
  const result = [];
  for (const profile of profiles) {
    const enriched = await attachSpecialistUser(db, profile, deps);
    if (enriched) result.push(enriched);
  }
  return result;
}

/** Get fallback phone numbers (all specialists with phone numbers) */
export async function getFallbackPhoneNumbers() {
  const db = await getDb();
  if (!db) return [];
  const profiles = await db
    .select()
    .from(specialistProfiles)
    .where(
      and(
        eq(specialistProfiles.isAvailable, true),
        sql`${specialistProfiles.phone} IS NOT NULL AND ${specialistProfiles.phone} != ''`,
      ),
    );
  const result = [];
  for (const profile of profiles) {
    const userRows = await db
      .select()
      .from(users)
      // Without this, a specialist who deleted their account is still handed
      // to families by name and phone on the fallback contact path.
      // NOT the only user-facing one: getLinkedParents, getCoParents,
      // getFamilyMembers and getUserByPublicId all still resolve soft-deleted
      // users. Left open on purpose — getLinkedParents doubles as an
      // authorization check (routers.ts:92/139/188/237), so filtering it can
      // change which children a LIVE caller reaches, and that needs its own
      // change with access tests rather than a filter appended here.
      .where(and(eq(users.id, profile.userId), isNull(users.deletedAt)));
    if (userRows.length > 0) {
      result.push({
        name: profile.displayName || userRows[0].name,
        phone: profile.phone,
        city: profile.city,
        country: profile.country,
        expertise: profile.expertise,
      });
    }
  }
  return result;
}

/** Update specialist online status */
export async function updateSpecialistOnlineStatus(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(specialistProfiles)
    .set({ lastOnline: new Date() })
    .where(eq(specialistProfiles.userId, userId));
}

/** Get specialist's assigned families with their data (for analysis view) */
export async function getSpecialistFamilyAnalysis(specialistId: number) {
  const db = await getDb();
  if (!db) return [];

  const assignments = await db
    .select()
    .from(specialistAssignments)
    .where(
      and(
        eq(specialistAssignments.specialistId, specialistId),
        eq(specialistAssignments.status, "active"),
      ),
    );

  const result = [];
  for (const assignment of assignments) {
    // Get family info
    const familyRows = await db
      .select()
      .from(families)
      .where(eq(families.id, assignment.familyId));
    if (familyRows.length === 0) continue;

    // Get family members
    const members = await db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.familyId, assignment.familyId));

    // Get children — deletedAt guard for the same reason the admin lists carry
    // one: deleteChild is soft, so a removed child stayed in the analysis a
    // specialist reads.
    const familyChildren = await db
      .select()
      .from(children)
      .where(
        and(
          eq(children.familyId, assignment.familyId),
          isNull(children.deletedAt),
        ),
      );

    // Get parent user profiles
    const parentProfiles = [];
    for (const member of members) {
      const userRows = await db
        .select()
        .from(users)
        // Without this a deleted parent's name, profileData and lastActive are
        // still handed to the assigned specialist.
        .where(and(eq(users.id, member.userId), isNull(users.deletedAt)));
      if (userRows.length > 0) {
        parentProfiles.push({
          id: userRows[0].id,
          name: userRows[0].name,
          role: member.role,
          profileData: userRows[0].profileData,
          lastActive: userRows[0].lastActive,
        });
      }
    }

    // Get observations for children
    const allObservations = [];
    for (const child of familyChildren) {
      const obs = await db
        .select()
        .from(childObservations)
        .where(eq(childObservations.childId, child.id));
      allObservations.push(
        ...obs.map((o) => ({ ...o, childName: child.name })),
      );
    }

    result.push({
      family: familyRows[0],
      assignment,
      parents: parentProfiles,
      children: familyChildren,
      observations: allObservations
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 20),
    });
  }

  return result;
}

// ============================================================
// PUSH TOKEN MANAGEMENT
// ============================================================

export async function updateUserPushToken(
  userId: number,
  pushToken: string | null,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ pushToken } as any)
    .where(eq(users.id, userId));
}

export async function getUserPushToken(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ pushToken: sql<string>`pushToken` })
    .from(users)
    // The targeted half of the same guard broadcastLocalizedPush carries: a
    // row soft-deleted before deleteUser began clearing pushToken still has
    // one, and every targeted send resolves its token through here.
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  return result.length > 0 ? result[0].pushToken : null;
}

// ============================================================
// INVITATION CODE MANAGEMENT
// ============================================================

export async function validateInvitationCode(code: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(invitationCodes)
    .where(
      and(eq(invitationCodes.code, code), eq(invitationCodes.isUsed, false)),
    )
    .limit(1);
  if (result.length === 0) return null;
  const invitation = result[0];
  // Check expiry
  if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date())
    return null;
  return invitation;
}

// Old invitation code system (uses invitationCodes table + role promotion)
export async function useOldInvitationCode(code: string, userId: number) {
  const db = await getDb();
  if (!db) return false;
  await db
    .update(invitationCodes)
    .set({
      isUsed: true,
      usedBy: userId,
      usedAt: new Date(),
    })
    .where(eq(invitationCodes.code, code));
  return true;
}

export async function generateInvitationCode(
  createdBy?: number,
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const code = `TARB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  await db.insert(invitationCodes).values({
    code,
    createdBy: createdBy ?? null,
  });
  return code;
}

// ============================================================
// PUSH NOTIFICATION SENDING (via Expo Push Service)
// ============================================================

/**
 * Get user's preferred language (defaults to 'nl').
 */
export async function getUserLanguage(
  userId: number,
): Promise<"nl" | "en" | "ar"> {
  const db = await getDb();
  if (!db) return "nl";
  const result = await db
    .select({ language: users.language })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const lang = result.length > 0 ? result[0].language : "nl";
  return lang === "en" || lang === "ar" ? lang : "nl";
}

/**
 * Helper to pick text by language: { nl, en, ar }
 */
export function tx(lang: string, nl: string, en: string, ar: string): string {
  if (lang === "ar") return ar;
  if (lang === "en") return en;
  return nl;
}

/**
 * Send a localized push notification - looks up the recipient's language
 * and picks the correct text from the provided translations.
 */
export async function sendLocalizedPush(
  recipientUserId: number,
  titleNl: string,
  titleEn: string,
  titleAr: string,
  bodyNl: string,
  bodyEn: string,
  bodyAr: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  const lang = await getUserLanguage(recipientUserId);
  const title = tx(lang, titleNl, titleEn, titleAr);
  const body = tx(lang, bodyNl, bodyEn, bodyAr);
  return sendPushNotification(recipientUserId, title, body, data);
}

// Expo/FCM/APNs reject push payloads over ~4KB total (title + body + data,
// JSON-serialized); a long body (e.g. a shared progress summary) would
// silently fail to send otherwise. Budget by UTF-8 BYTES, not character
// count: this app's push bodies are frequently Arabic (~2 bytes/char) with
// many newlines (2 bytes once JSON-escaped as "\n"), so a character-count cap
// alone can still serialize past the provider limit. Cuts on Unicode
// code-point boundaries (not UTF-16 code units), so a cut doesn't land
// mid-surrogate-pair and corrupt an emoji (plain .slice() can).
// ponytail: doesn't handle multi-codepoint grapheme clusters (e.g. ZWJ emoji);
// upgrade to Intl.Segmenter if a mangled compound emoji is ever reported.
// Exported (not inlined) so tests exercise this exact function, not a copy.
export function truncateToByteBudget(body: string, limitBytes: number): string {
  if (Buffer.byteLength(body, "utf8") <= limitBytes) return body;
  const chars = Array.from(body);
  let bytes = 0;
  let cut = chars.length;
  for (let i = 0; i < chars.length; i++) {
    bytes += Buffer.byteLength(chars[i], "utf8");
    if (bytes > limitBytes) { cut = i; break; }
  }
  return `${chars.slice(0, cut).join("")}…`;
}

const PUSH_BODY_BYTE_LIMIT = 1200;

export async function sendPushNotification(
  recipientUserId: number,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  const pushToken = await getUserPushToken(recipientUserId);
  if (!pushToken) return false;

  // Cap only the notification preview — the full text still reaches the DB message / share.
  // Title is capped too (some callers embed unbounded strings, e.g. a child's name).
  const safeTitle = truncateToByteBudget(title, PUSH_BODY_BYTE_LIMIT);
  const safeBody = truncateToByteBudget(body, PUSH_BODY_BYTE_LIMIT);

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: pushToken,
        title: safeTitle,
        body: safeBody,
        data: data ?? {},
        sound: "default",
        priority: "high",
      }),
    });

    if (!response.ok) {
      console.warn(
        `[Push] Failed to send to user ${recipientUserId}: ${response.status}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Push] Error sending notification:", error);
    return false;
  }
}

// ============================================================
// ADMIN: Additional DB functions
// ============================================================

/** Get recent messages for admin review */
export async function getRecentMessages(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select()
    .from(messages)
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return result;
}

/** Delete a user by ID (super_admin only) */
export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Soft delete: mark as deleted but preserve data.
  // pushToken is cleared rather than preserved: nothing that picks push
  // recipients filters deletedAt — broadcastLocalizedPush selects purely on
  // `pushToken IS NOT NULL`, getUserPushToken by id alone — so a deleted
  // account kept receiving every broadcast. Cleared here, at the one place
  // every push path routes through, rather than in each recipient query.
  await db
    .update(users)
    .set({ deletedAt: new Date(), pushToken: null })
    .where(eq(users.id, userId));
}

// ============================================================
// CMS FUNCTIONS
// ============================================================

export async function getAllContentCategories() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contentCategories)
    .orderBy(contentCategories.sortOrder);
}

export async function getContentCategoriesBySection(section: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contentCategories)
    .where(eq(contentCategories.appSection, section as any))
    .orderBy(contentCategories.sortOrder);
}

export async function createContentCategory(data: {
  slug: string;
  nameNl: string;
  nameEn: string;
  nameAr: string;
  appSection: string;
  ageGroup?: string;
  sortOrder?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contentCategories).values(data as any);
  return result[0].insertId;
}

export async function getAllContentItems(opts?: {
  status?: string;
  categoryId?: number;
  contentType?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(contentItems);
  const conditions: any[] = [];
  if (opts?.status)
    conditions.push(eq(contentItems.status, opts.status as any));
  if (opts?.categoryId)
    conditions.push(eq(contentItems.categoryId, opts.categoryId));
  if (opts?.contentType)
    conditions.push(eq(contentItems.contentType, opts.contentType as any));
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  return (query as any).orderBy(contentItems.createdAt);
}

export async function getContentItemById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, id));
  return rows[0] || null;
}

export async function createContentItem(data: {
  categoryId?: number;
  contentType: string;
  status?: string;
  originalLanguage?: string;
  tags?: string;
  authorId?: number;
  mediaUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contentItems).values(data as any);
  return result[0].insertId;
}

export async function updateContentItem(
  id: number,
  data: Partial<{
    categoryId: number;
    contentType: string;
    status: string;
    tags: string;
    mediaUrl: string;
    publishedAt: Date;
  }>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(contentItems)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(contentItems.id, id));
}

export async function deleteContentItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(contentTranslations)
    .where(eq(contentTranslations.contentId, id));
  await db.delete(contentFiles).where(eq(contentFiles.contentId, id));
  await db.delete(contentItems).where(eq(contentItems.id, id));
}

export async function getContentTranslations(contentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contentTranslations)
    .where(eq(contentTranslations.contentId, contentId));
}

export async function upsertContentTranslation(
  contentId: number,
  language: string,
  data: {
    title: string;
    summary?: string;
    body?: string;
    isAutoTranslated?: boolean;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(contentTranslations)
    .where(
      and(
        eq(contentTranslations.contentId, contentId),
        eq(contentTranslations.language, language as any),
      ),
    );
  if (existing.length > 0) {
    await db
      .update(contentTranslations)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(
        and(
          eq(contentTranslations.contentId, contentId),
          eq(contentTranslations.language, language as any),
        ),
      );
  } else {
    await db
      .insert(contentTranslations)
      .values({ contentId, language, ...data } as any);
  }
}

export async function getContentFiles(contentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contentFiles)
    .where(eq(contentFiles.contentId, contentId));
}

export async function addContentFile(data: {
  contentId: number;
  fileName: string;
  fileType: string;
  filePath: string;
  fileSize?: number;
  language?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contentFiles).values(data as any);
  return result[0].insertId;
}

export async function deleteContentFile(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(contentFiles).where(eq(contentFiles.id, id));
}

// Published content for the mobile app
export async function getPublishedContent(opts?: {
  section?: string;
  categoryId?: number;
  language?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const items = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.status, "published"))
    .orderBy(contentItems.sortOrder);

  // Filter by category section if needed
  let filteredItems = items;
  if (opts?.categoryId) {
    filteredItems = items.filter((i: any) => i.categoryId === opts.categoryId);
  }

  // Get translations for each item
  const results: any[] = [];
  for (const item of filteredItems) {
    const translations = await db
      .select()
      .from(contentTranslations)
      .where(eq(contentTranslations.contentId, item.id));
    const lang = opts?.language || "nl";
    const translation =
      translations.find((t: any) => t.language === lang) || translations[0];
    if (translation) {
      results.push({ ...item, translation });
    }
  }
  return results;
}

export async function getPublishedContentBySection(
  section: string,
  language: string = "nl",
) {
  const db = await getDb();
  if (!db) return [];
  const categories = await db
    .select()
    .from(contentCategories)
    .where(eq(contentCategories.appSection, section as any));
  const catIds = categories.map((c: any) => c.id);
  if (catIds.length === 0) return [];

  const items = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.status, "published")));
  const filtered = items.filter((i: any) => catIds.includes(i.categoryId));

  const results: any[] = [];
  for (const item of filtered) {
    const translations = await db
      .select()
      .from(contentTranslations)
      .where(eq(contentTranslations.contentId, item.id));
    const translation =
      translations.find((t: any) => t.language === language) ||
      translations.find((t: any) => t.language === "nl") ||
      translations[0];
    const category = categories.find((c: any) => c.id === item.categoryId);
    if (translation) {
      results.push({ ...item, translation, category });
    }
  }
  return results;
}

// ============================================================
// CMS PUBLIC API FUNCTIONS
// ============================================================

export async function getCmsContentBySection(
  appSection: string,
  language: string = "nl",
  contentType?: string,
  limit: number = 50,
) {
  const db = await getDb();
  if (!db) return [];
  const categories = await db
    .select()
    .from(contentCategories)
    .where(eq(contentCategories.appSection, appSection as any));
  const catIds = categories.map((c: any) => c.id);
  if (catIds.length === 0) return [];

  const items = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.status, "published"));
  let filtered = items.filter((i: any) => catIds.includes(i.categoryId));
  if (contentType)
    filtered = filtered.filter((i: any) => i.contentType === contentType);
  filtered = filtered.slice(0, limit);

  const results: any[] = [];
  for (const item of filtered) {
    const translations = await db
      .select()
      .from(contentTranslations)
      .where(eq(contentTranslations.contentId, item.id));
    const translation =
      translations.find((t: any) => t.language === language) ||
      translations.find((t: any) => t.language === "nl") ||
      translations[0];
    const category = categories.find((c: any) => c.id === item.categoryId);
    if (translation) {
      results.push({
        id: item.id,
        contentType: item.contentType,
        mediaUrl: item.mediaUrl,
        tags: item.tags,
        title: translation.title,
        summary: translation.summary,
        body: translation.body,
        language: translation.language,
        category: category
          ? {
              id: category.id,
              nameNl: category.nameNl,
              nameEn: category.nameEn,
              nameAr: category.nameAr,
            }
          : null,
        createdAt: item.createdAt,
      });
    }
  }
  return results;
}

export async function getCmsContentItemWithTranslations(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, id));
  if (rows.length === 0) return null;
  const item = rows[0];
  const translations = await db
    .select()
    .from(contentTranslations)
    .where(eq(contentTranslations.contentId, id));
  const files = await db
    .select()
    .from(contentFiles)
    .where(eq(contentFiles.contentId, id));
  const category = item.categoryId
    ? (
        await db
          .select()
          .from(contentCategories)
          .where(eq(contentCategories.id, item.categoryId))
      )[0]
    : null;
  return { ...item, translations, files, category };
}

// ============================================================
// INVITATION CODES
// ============================================================

export async function getAllInvitationCodes() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(functionInvitationCodes)
    .orderBy(functionInvitationCodes.createdAt);
}

export async function createInvitationCode(data: {
  code: string;
  functionRole: string;
  restrictedEmail?: string;
  maxUses?: number;
  createdBy?: number;
  expiresAt?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(functionInvitationCodes).values(data as any);
  return result[0].insertId;
}

export async function useInvitationCode(
  code: string,
  userId: number,
): Promise<{ success: boolean; functionRole?: string; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const rows = await db
    .select()
    .from(functionInvitationCodes)
    .where(eq(functionInvitationCodes.code, code));
  if (rows.length === 0) return { success: false, error: "Code niet gevonden" };

  const invite = rows[0];
  if (!invite.isActive)
    return { success: false, error: "Code is niet meer actief" };
  if (invite.maxUses && invite.usedCount >= invite.maxUses)
    return { success: false, error: "Code is al maximaal gebruikt" };
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date())
    return { success: false, error: "Code is verlopen" };

  // Assign the function
  await addUserFunction(userId, invite.functionRole);

  // Increment usage
  await db
    .update(functionInvitationCodes)
    .set({ usedCount: invite.usedCount + 1 } as any)
    .where(eq(functionInvitationCodes.id, invite.id));

  return { success: true, functionRole: invite.functionRole };
}

export async function deactivateInvitationCode(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(functionInvitationCodes)
    .set({ isActive: false } as any)
    .where(eq(functionInvitationCodes.id, id));
}

// ============================================================
// BROADCAST PUSH NOTIFICATIONS
// ============================================================

/** Send push notification to all users with a push token (single language - legacy) */
export async function broadcastPushNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  userIds?: number[],
): Promise<{ sent: number; failed: number }> {
  return broadcastLocalizedPush(title, title, title, body, body, body, data, userIds);
}

/** Send localized push notification to all users - each user gets their preferred language.
 *  When userIds is given, only those users are messaged (the admin broadcast audience filter);
 *  omitted, every user with a push token is messaged, unchanged from before. */
export async function broadcastLocalizedPush(
  titleNl: string,
  titleEn: string,
  titleAr: string,
  bodyNl: string,
  bodyEn: string,
  bodyAr: string,
  data?: Record<string, unknown>,
  userIds?: number[],
): Promise<{ sent: number; failed: number }> {
  const db = await getDb();
  if (!db) return { sent: 0, failed: 0 };
  // An audience filter that matched nobody must send to nobody, not silently
  // fall back to everyone — only undefined (no filter given at all) does that.
  if (userIds && userIds.length === 0) return { sent: 0, failed: 0 };

  // Get all users with push tokens AND their language
  const usersWithTokens = await db
    .select({
      id: users.id,
      pushToken: sql<string>`pushToken`,
      language: users.language,
    })
    .from(users)
    .where(
      // isNull(deletedAt) as well as the token check: deleteUser clears
      // pushToken, but only from the moment it ships. Accounts deleted before
      // that still hold a token, and this is the read path they arrive on, so
      // the guard cannot depend on delete-time hygiene alone.
      userIds
        ? and(
            sql`pushToken IS NOT NULL AND pushToken != ''`,
            isNull(users.deletedAt),
            inArray(users.id, userIds),
          )
        : and(sql`pushToken IS NOT NULL AND pushToken != ''`, isNull(users.deletedAt)),
    );

  let sent = 0;
  let failed = 0;

  // Send in batches of 100 (Expo push API limit)
  const batchSize = 100;
  for (let i = 0; i < usersWithTokens.length; i += batchSize) {
    const batch = usersWithTokens.slice(i, i + batchSize);
    const messages = batch.map((u) => {
      const lang = u.language || "nl";
      return {
        to: u.pushToken,
        // Same payload-size cap as sendPushNotification (this path builds its own
        // Expo call instead of routing through it, so it needs the guard too).
        title: truncateToByteBudget(tx(lang, titleNl, titleEn, titleAr), PUSH_BODY_BYTE_LIMIT),
        body: truncateToByteBudget(tx(lang, bodyNl, bodyEn, bodyAr), PUSH_BODY_BYTE_LIMIT),
        data: data ?? {},
        sound: "default" as const,
        priority: "high" as const,
      };
    });

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (response.ok) {
        sent += batch.length;
      } else {
        failed += batch.length;
        console.warn(`[Push Broadcast] Batch failed: ${response.status}`);
      }
    } catch (error) {
      failed += batch.length;
      console.warn("[Push Broadcast] Error:", error);
    }
  }

  return { sent, failed };
}

// ============================================================
// BROADCAST SCHEDULES - recurring automated admin broadcasts (owner-managed
// cadence per category — see server/broadcast-schedule.ts for the due-check
// and scripts/send-recurring-broadcasts.ts for the cron runner that calls
// getDueBroadcastSchedules/markBroadcastScheduleSent below).
// ============================================================

export async function listBroadcastSchedules() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(broadcastSchedules).orderBy(desc(broadcastSchedules.createdAt));
}

export async function createBroadcastSchedule(data: {
  category: string;
  daysOfWeek: string;
  sendHour: number;
  active: boolean;
  createdBy?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(broadcastSchedules).values(data as InsertBroadcastSchedule);
}

/** Returns whether the row exists (so the router can tell a genuine update
 *  from an id that no longer exists), checked with a SELECT rather than
 *  affectedRows() on the UPDATE itself: mysql2's affectedRows for UPDATE
 *  counts rows actually CHANGED, not matched — re-sending a patch equal to
 *  the row's current value (e.g. toggling active twice) would read 0 and
 *  report a false "not found" even though the row exists. Postgres's
 *  rowCount counts matched rows, so the two dialects would also disagree.
 *  A SELECT's row count has no such ambiguity on either driver. */
export async function updateBroadcastSchedule(data: {
  id: number;
  daysOfWeek?: string;
  sendHour?: number;
  active?: boolean;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const { id, ...patch } = data;
  const existing = await db.select({ id: broadcastSchedules.id }).from(broadcastSchedules).where(eq(broadcastSchedules.id, id)).limit(1);
  if (existing.length === 0) return false;
  await db.update(broadcastSchedules).set(patch).where(eq(broadcastSchedules.id, id));
  return true;
}

export async function deleteBroadcastSchedule(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.delete(broadcastSchedules).where(eq(broadcastSchedules.id, id));
  return affectedRows(result) > 0;
}

/** Filters in JS with the same isScheduleDue() the tests pin, rather than a
 *  SQL date-diff WHERE clause — one predicate answers "is it due" on both
 *  mysql2 and Postgres, with no dialect-specific date function. The table
 *  holds admin-configured schedules (a handful of rows), not per-user data,
 *  so an unfiltered SELECT here is cheap. */
export async function getDueBroadcastSchedules(now: Date) {
  const schedules = await listBroadcastSchedules();
  return schedules.filter((s) => isScheduleDue(s, now));
}

export async function markBroadcastScheduleSent(id: number, now: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(broadcastSchedules).set({ lastSentAt: now }).where(eq(broadcastSchedules.id, id));
}

/** Records one completed send (recurring cron or, in principle, a manual
 *  send) for the admin-facing "تقارير الإرسال" report. scheduleId is
 *  nullable so a caller with no schedule row (there isn't one today, but
 *  this keeps the log usable if manual sends are ever logged too) can still
 *  log. */
export async function logBroadcastSend(data: {
  scheduleId: number | null;
  category: string;
  recipientCount: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(broadcastSendLog).values(data as InsertBroadcastSendLog);
}

export async function listBroadcastSendLog(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(broadcastSendLog).orderBy(desc(broadcastSendLog.sentAt)).limit(limit);
}

// ============================================================
// SPOUSE ADVICE FUNCTIONS
// ============================================================

export async function createSpouseAdvice(data: InsertSpouseAdvice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(spouseAdvice).values(data);
  return result[0].insertId;
}

export async function getSpouseAdviceForUser(recipientId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(spouseAdvice)
    .where(eq(spouseAdvice.recipientId, recipientId))
    .orderBy(desc(spouseAdvice.createdAt))
    .limit(limit);
}

export async function markSpouseAdviceRead(adviceId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(spouseAdvice)
    .set({ isRead: true })
    .where(eq(spouseAdvice.id, adviceId));
}

export async function markSpouseAdviceHelpful(
  adviceId: number,
  helpful: boolean,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(spouseAdvice)
    .set({ isHelpful: helpful })
    .where(eq(spouseAdvice.id, adviceId));
}

// ============================================================
// DAILY DIAGNOSTIC CHECKINS - self-reported, replaces guessed spouse advice
// ============================================================

/** The one row for this user today, if it already exists (cache — avoids re-generating). */
export async function getDiagnosticCheckinForToday(userId: number, date: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(dailyDiagnosticCheckins)
    .where(and(eq(dailyDiagnosticCheckins.userId, userId), eq(dailyDiagnosticCheckins.date, date)))
    .limit(1);
  return rows[0] || null;
}

/**
 * Claims today's row BEFORE the paid generation call runs, so a losing
 * concurrent request (or a request that arrives while the DB is down) fails
 * HERE — fast, free — instead of also spending an LLM call whose result then
 * has nowhere to be saved. Returns the claimed (placeholder) row on success;
 * null if someone else already claimed/finished this user's day, or if the
 * DB is unavailable (in either case, the caller must not call the LLM: with
 * nowhere to cache the result, calling it would just double-spend or leak
 * spend into an outage with no record of it).
 */
// This repo's own DB is MySQL (mysql2 reports a unique violation as
// ER_DUP_ENTRY) but the logic here is written to be hand-ported to the VM's
// production Postgres (which reports the same condition as SQLSTATE 23505,
// via the `pg` driver's `error.code`) — see CLAUDE.md on the repo/VM
// divergence. Checking both keeps that port correct without anyone having to
// remember to swap the code.
const DUPLICATE_KEY_CODES = new Set<string | undefined>(["ER_DUP_ENTRY", "23505"]);

/**
 * drizzle-orm wraps every driver error in DrizzleQueryError (mysql-core and
 * pg-core session layers both do `catch (e) { throw new DrizzleQueryError(...,
 * e) }`), and that wrapper never copies `.code` onto itself — only `.cause`
 * (the original mysql2/pg error, which DOES have `.code`) — verified directly
 * against node_modules/drizzle-orm/errors.js. Checking err.code alone always
 * reads undefined for a real driver error; this is what actually matches.
 */
export function driverErrorCode(err: any): string | undefined {
  return err?.code ?? err?.cause?.code;
}

/**
 * How many rows an UPDATE actually touched, used by claimDiagnosticCheckin's
 * siblings below (fillDiagnosticCheckin, saveDiagnosticAnswers) to detect a
 * conditional write that matched nothing. Reads both driver shapes rather
 * than leaving the port to a
 * comment: mysql2 gives `[ResultSetHeader]` with `affectedRows`, while
 * `drizzle-orm/node-postgres` gives pg's `QueryResult` (`{ rowCount, rows }`)
 * for an `.update()` without `.returning()`. Reading only the mysql2 shape on
 * the Postgres server makes every call read 0, so all three writes look like
 * they lost a race they never raced — every answer submission reports
 * failure and no stale claim is ever reclaimed.
 */
// mysql2 returns [ResultSetHeader] carrying affectedRows; node-postgres
// returns a Result carrying rowCount. This file is hand-ported to a Postgres
// server, and there the mysql2-only shape silently reads 0 — which every
// caller interprets as "my conditional write matched nothing", so answer
// submissions all report failure and no stale claim is ever reclaimed.
// Reading both shapes here costs one line and removes that porting trap.
export function affectedRows(result: any): number {
  return result?.[0]?.affectedRows ?? result?.rowCount ?? result?.affectedRows ?? 0;
}

/**
 * PORTING HAZARD (same class as affectedRows() above, worse in one way):
 * mysql2 gives [ResultSetHeader] (or the header directly, if the caller
 * destructured `[result]` at the await) carrying `insertId`. node-postgres
 * has NO equivalent field on a plain INSERT — unlike affectedRows()'s
 * `rowCount`, which postgres always populates, a new row's id there is
 * ONLY available via a `.returning()` clause, which this file's
 * mysql2-typed insert() builder doesn't support. So this reader can only
 * guard the mysql2 side (both ways a caller might read the result); a real
 * port to Postgres needs `.returning({ id: ... })` added at the call site,
 * not just a smarter reader here. Returns undefined (not 0) when neither
 * shape matches, so a caller can tell "no id" from "id is legitimately 0".
 */
export function insertId(result: any): number | undefined {
  return result?.[0]?.insertId ?? result?.insertId ?? undefined;
}

export async function claimDiagnosticCheckin(userId: number, date: string) {
  const db = await getDb();
  if (!db) return null;
  try {
    await db.insert(dailyDiagnosticCheckins).values({ userId, date, questions: [], answers: null, source: "pending" });
  } catch (err: any) {
    if (!DUPLICATE_KEY_CODES.has(driverErrorCode(err))) throw err;
    return null;
  }
  return getDiagnosticCheckinForToday(userId, date);
}

/**
 * Fills in a row claimed by claimDiagnosticCheckin with the curated
 * question set. Conditioned on the row still being "pending" — guards
 * against two requests racing to create the SAME user+day at once (one
 * wins claimDiagnosticCheckin's insert; the other re-reads and reuses that
 * same pending row instead of inserting a second one — see getOrCreateToday
 * in daily-diagnostic.ts); without this guard whichever write lands last
 * would silently overwrite the other's already-returned-to-a-client
 * questions. Returns whether THIS call actually wrote; the caller must
 * re-read and use the persisted row when it didn't (see getOrCreateToday in
 * daily-diagnostic.ts). Throws rather than silently no-opping when the DB is
 * unavailable — a caller that awaits this and reports success back to the
 * user must know a write was attempted at all.
 */
export async function fillDiagnosticCheckin(id: number, questions: unknown, source: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result: any = await db
    .update(dailyDiagnosticCheckins)
    .set({ questions: questions as any, source })
    .where(and(eq(dailyDiagnosticCheckins.id, id), eq(dailyDiagnosticCheckins.source, "pending")));
  return affectedRows(result) > 0;
}

/**
 * Records the day's answers — but only if nobody already has (conditioned on
 * `answers IS NULL`), so two concurrent submitAnswers calls for the same day
 * can't both pass the "not yet answered" check and have the second silently
 * clobber the first. Returns whether THIS call actually wrote; the router
 * must reject as already-answered when it didn't. Throws (rather than
 * silently no-opping) when the DB is unavailable — otherwise the router
 * would report a save that never happened.
 */
export async function saveDiagnosticAnswers(id: number, answers: unknown): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result: any = await db
    .update(dailyDiagnosticCheckins)
    .set({ answers: answers as any, answeredAt: new Date() })
    .where(and(eq(dailyDiagnosticCheckins.id, id), isNull(dailyDiagnosticCheckins.answers)));
  return affectedRows(result) > 0;
}

/**
 * Answered check-ins for a user from the last `days` CALENDAR days (not just
 * "the last N answered rows, however old" — a user who last answered months
 * ago must not have that stale day presented as a "this week" signal). Most
 * recent first. Only ever used server-side to build the OTHER spouse's
 * advice — never returned raw to any client (see daily-diagnostic.ts
 * summarizeSignals).
 */
export async function getRecentDiagnosticSignals(userId: number, days: number) {
  const db = await getDb();
  if (!db) return [];
  // Calendar-day arithmetic (UTC midnight, minus N-1 calendar days) — the
  // same "day" concept daily-diagnostic.ts's getToday uses for its own
  // `date` key (new Date().toISOString().slice(0,10)), not a raw N*24h
  // millisecond window, which drifts against calendar days depending on
  // time-of-day. `gte` is inclusive of the cutoff day itself, so subtracting
  // N-1 (not N) is what makes `days: 7` mean today-plus-the-previous-6 — 7
  // distinct calendar days total, not 8.
  const cutoffDate = new Date();
  cutoffDate.setUTCHours(0, 0, 0, 0);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - (days - 1));
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  // Only answers (summarizeSignals reads nothing else) — skip pulling the
  // generated `questions` blob across the wire on every getSpouseAdvice call.
  const rows = await db
    .select({ answers: dailyDiagnosticCheckins.answers })
    .from(dailyDiagnosticCheckins)
    .where(
      and(
        eq(dailyDiagnosticCheckins.userId, userId),
        isNotNull(dailyDiagnosticCheckins.answeredAt),
        gte(dailyDiagnosticCheckins.date, cutoff),
      ),
    )
    .orderBy(desc(dailyDiagnosticCheckins.date));
  return rows;
}

/**
 * Full-row counterpart to getRecentDiagnosticSignals above — same table,
 * same calendar-day window, same "answered only" filter, but selects
 * `date`/`questions`/`answers` instead of `answers` alone (item 1: the
 * husband-ungated / wife-with-grant direction may now read the partner's
 * actual answer text, not just category+tone). This function does no
 * ACCESS gating itself — it is a plain read exactly like
 * getRecentDiagnosticSignals; the caller (links.getPartnerDailyDiagnostic,
 * server/routers.ts; getSpouseAdvice, server/advice.ts) is responsible for
 * calling it ONLY once hasFullPartnerAccess has already been checked.
 *
 * It DOES restrict to source="curated" (adversarial-review finding), unlike
 * getRecentDiagnosticSignals: this is the one function that carries the raw
 * answer `label`, and a historical row from before the curated question
 * bank existed can have source "generated"/"fallback" — old, LLM-authored
 * questions AND option labels (this module's own file header documents real
 * bugs from that system: wrong-gender phrasing, a forbidden topic).
 * submitAnswers only proves a submitted label matched SOME option already
 * stored on that row; it says nothing about whether that stored option was
 * itself curated. getRecentDiagnosticSignals needs no such filter — its
 * category+tone output is bounded to a fixed, runtime-validated enum
 * (isDiagnosticAnswer) regardless of source, so there is nothing
 * source-dependent for it to leak.
 */
export async function getRecentDiagnosticRows(userId: number, days: number) {
  const db = await getDb();
  if (!db) return [];
  const cutoffDate = new Date();
  cutoffDate.setUTCHours(0, 0, 0, 0);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - (days - 1));
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const rows = await db
    .select({
      date: dailyDiagnosticCheckins.date,
      questions: dailyDiagnosticCheckins.questions,
      answers: dailyDiagnosticCheckins.answers,
    })
    .from(dailyDiagnosticCheckins)
    .where(
      and(
        eq(dailyDiagnosticCheckins.userId, userId),
        isNotNull(dailyDiagnosticCheckins.answeredAt),
        gte(dailyDiagnosticCheckins.date, cutoff),
        eq(dailyDiagnosticCheckins.source, "curated"),
      ),
    )
    .orderBy(desc(dailyDiagnosticCheckins.date));
  return rows;
}

/**
 * Read-only confirmed-partner check — no writes, unlike getPartnerOfUser
 * below, whose legacy shared-children fallback can INSERT a new
 * partnerships row (via createPartnership) just from being called. That's
 * fine for a mutation, but daily-diagnostic.ts's getToday is a tRPC
 * `.query` — merely opening the daily check-in must never create a
 * partnership the user never agreed to (round-8 P2 fix).
 *
 * Mirrors getPartnerOfUser's own first branch only (the partnerships
 * table, status='active' AND confirmed=true, partner not soft-deleted) —
 * never the auto-creating fallback. As a side effect this also means
 * "hasPartner" here can never be true for a still-pending invite, unlike
 * the old `!!(await getPartnerOfUser(...))` check it replaces (that only
 * tested truthiness, not partnershipConfirmed). Fails closed (false) when
 * the DB is unavailable, same as every other lookup in this file.
 */
export async function hasConfirmedPartner(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const partnershipRows = await db
    .select()
    .from(partnerships)
    .where(
      and(
        or(eq(partnerships.userId1, userId), eq(partnerships.userId2, userId)),
        eq(partnerships.status, "active"),
        eq(partnerships.confirmed, true),
      ),
    )
    .limit(1);
  if (partnershipRows.length === 0) return false;
  const p = partnershipRows[0];
  const partnerId = p.userId1 === userId ? p.userId2 : p.userId1;
  const partner = await db
    .select()
    .from(users)
    .where(and(eq(users.id, partnerId), isNull(users.deletedAt)))
    .limit(1);
  return partner.length > 0;
}

/** All user IDs with a confirmed, active partnership, either side of it.
 *  Bulk form of hasConfirmedPartner — one query instead of one per user —
 *  for broadcast-audience.ts's notLinkedSpouse filter (see
 *  attachLinkedSpouse there). Same WHERE as hasConfirmedPartner's first
 *  branch: status="active" AND confirmed=true. */
export async function getLinkedSpouseUserIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ userId1: partnerships.userId1, userId2: partnerships.userId2 })
    .from(partnerships)
    .where(and(eq(partnerships.status, "active"), eq(partnerships.confirmed, true)));
  if (rows.length === 0) return [];
  // Parity with hasConfirmedPartner: a user whose partner deleted their
  // account is NOT counted as linked, so the "link your spouse" broadcast
  // still reaches them. Include a user only if THEIR partner is not deleted.
  const involved = Array.from(new Set(rows.flatMap((r) => [r.userId1, r.userId2])));
  const deletedRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, involved), isNotNull(users.deletedAt)));
  const deleted = new Set(deletedRows.map((u) => u.id));
  const ids = new Set<number>();
  for (const r of rows) {
    if (!deleted.has(r.userId2)) ids.add(r.userId1);
    if (!deleted.has(r.userId1)) ids.add(r.userId2);
  }
  return Array.from(ids);
}

/** Shared shape returned per-partner by getPartnersOfUser/getPartnerOfUser. */
type PartnerRecord = {
  id: number;
  name: string | null;
  /** The users.gender COLUMN — see hasFullPartnerAccess's callers in
   * routers.ts, which fall back to this when profileData.parentProfile.gender
   * (the JSON copy) is missing on a legacy row. */
  gender: string | null;
  profileData: any;
  partnershipId: number;
  /** Whether that partnershipId row is actually status='active' AND
   * confirmed=true — the shared-children legacy fallback below can return a
   * partner whose partnership is still a pending, unconfirmed invite.
   * requestPartnerProfileAccess/grantPartnerProfileAccess/revokePartner-
   * ProfileAccess all require active+confirmed, so callers must gate any
   * affordance that leads to those mutations on this flag. */
  partnershipConfirmed: boolean;
  profileAccessRequestedAt: Date | null;
  profileAccessGrantedAt: Date | null;
  /** Husband's decline of a pending request (Fix 1) — see PartnerRecord's
   * sibling fields above and revokePartnerProfileAccess's own doc comment. */
  profileAccessDeclinedAt: Date | null;
};

/**
 * Every partner (spouse) of a user. Plural because the owner's ruling
 * allows a man multiple confirmed wives — a woman can still only ever have
 * one entry here, enforced where partnerships are created/confirmed (see
 * createPartnership/confirmPartnershipRequest's own comments), not by this
 * read. getPartnerOfUser below is a thin wrapper around this (partners[0] ??
 * null), so every existing single-partner call site is unaffected: a user
 * with 0 or 1 confirmed partnerships gets the exact same result from either
 * function.
 */
export async function getPartnersOfUser(userId: number): Promise<PartnerRecord[]> {
  const db = await getDb();
  if (!db) return [];

  // 1. First check partnerships table (persists across reinstalls) — EVERY
  // active, confirmed row this user is a party to, not just one.
  //
  // ORDER BY id ASC (oldest confirmed partnership first): without this the
  // query was unordered, so two identical calls could return a man's wives
  // in a different order — the root cause behind several "acted on the
  // wrong wife" review findings (round-9/round-10) in callers that only
  // ever look at getPartnerOfUser's first entry. `id` rather than
  // `createdAt`: createdAt is a MySQL TIMESTAMP with no fractional-seconds
  // precision configured, so two partnerships confirmed in the same second
  // would tie; the autoincrement id can't. Plain ORDER BY, not RETURNING —
  // portable to the hand-ported Postgres production copy.
  const partnershipRows = await db
    .select()
    .from(partnerships)
    .where(
      and(
        or(eq(partnerships.userId1, userId), eq(partnerships.userId2, userId)),
        eq(partnerships.status, "active"),
        eq(partnerships.confirmed, true),
      ),
    )
    .orderBy(partnerships.id);

  if (partnershipRows.length > 0) {
    const result: PartnerRecord[] = [];
    for (const p of partnershipRows) {
      const partnerId = p.userId1 === userId ? p.userId2 : p.userId1;
      const partner = await db
        .select()
        .from(users)
        .where(and(eq(users.id, partnerId), isNull(users.deletedAt)))
        .limit(1);
      if (partner.length > 0) {
        result.push({
          id: partner[0].id,
          name: partner[0].name,
          gender: partner[0].gender,
          profileData: partner[0].profileData,
          partnershipId: p.id,
          // Guaranteed by the WHERE clause above (status='active' AND
          // confirmed=true) — derived from the row itself rather than
          // hardcoded true so it self-corrects if that filter ever changes.
          partnershipConfirmed: p.status === "active" && p.confirmed === true,
          profileAccessRequestedAt: p.profileAccessRequestedAt ?? null,
          profileAccessGrantedAt: p.profileAccessGrantedAt ?? null,
          profileAccessDeclinedAt: p.profileAccessDeclinedAt ?? null,
        });
      }
    }
    // Only short-circuit when this branch actually produced someone. If every
    // partner row pointed at a soft-deleted user the list is empty, and
    // returning it here would skip the shared-children fallback that used to
    // run in exactly that case — losing a live co-parent because an unrelated
    // partner's account was deleted.
    if (result.length > 0) return result;
  }

  // 2. Fallback: detect via shared children (legacy). Structurally can only
  // ever surface ONE co-parent (the loop below returns on the first match),
  // so this branch never needs array treatment the way branch 1 now does.
  const myLinks = await db
    .select()
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, userId),
        eq(parentChildLinks.confirmed, true),
      ),
    );
  if (myLinks.length === 0) return [];
  const myChildIds = myLinks.map((l) => l.childId);
  for (const childId of myChildIds) {
    const otherLinks = await db
      .select()
      .from(parentChildLinks)
      .where(
        and(
          eq(parentChildLinks.childId, childId),
          eq(parentChildLinks.confirmed, true),
        ),
      );
    const partnerId = otherLinks.find((l) => l.parentId !== userId)?.parentId;
    if (partnerId) {
      const partner = await db
        .select()
        .from(users)
        .where(and(eq(users.id, partnerId), isNull(users.deletedAt)))
        .limit(1);
      if (partner.length > 0) {
        // An explicit dissolution must survive a READ. createPartnership's
        // own existing-row check only looks for pending/active, so a
        // dissolved row is invisible to it and this fallback would insert a
        // fresh active+confirmed one — and because listPartners refetches on
        // mount, dissolving a partnership with shared children was undone the
        // moment either screen reloaded. Checked here rather than inside
        // createPartnership because a DELIBERATE re-invite must still be able
        // to create a partnership after a separation; only this automatic,
        // read-triggered path has to respect the dissolution.
        const priorDissolved = await db
          .select({ id: partnerships.id })
          .from(partnerships)
          .where(
            and(
              or(
                and(eq(partnerships.userId1, userId), eq(partnerships.userId2, partnerId)),
                and(eq(partnerships.userId1, partnerId), eq(partnerships.userId2, userId)),
              ),
              eq(partnerships.status, "dissolved"),
            ),
          )
          .limit(1);
        if (priorDissolved.length > 0) continue;
        // NO WRITE. This is a query — listPartners and getPartnerProfile are
        // both called with refetchOnMount:"always" — and it used to INSERT a
        // partnership here for persistence.
        //
        // First it inserted a CONFIRMED one, which let a read manufacture the
        // very consent hasFullPartnerAccess checks. That was changed to
        // pending, which closed the direct leak but left a subtler door: the
        // pending row is byte-identical to a deliberate invite, so
        // getPendingPartnershipFromSender finds it, and when the co-parent
        // later taps accept on an unrelated pending CHILD link from the same
        // person, confirmLink silently confirms the marriage too — cross-
        // linking every child with canEdit and, if the genders line up,
        // handing over full profile access. Consent obtained through a door
        // the other party thought was about a child.
        //
        // The row bought nothing to offset that: every mutation that takes a
        // partnershipId (request/grant/revokePartnerProfileAccess,
        // dissolvePartnership) requires status='active', which a pending row
        // never satisfies. So the co-parent is still surfaced here — name,
        // gender, profile — but with no partnership row and no partnershipId
        // any mutation can act on, until the two of them link deliberately
        // through linkPartnerByPublicId. partnershipId 0 is that "there is no
        // partnership": it matches no row, so every mutation fails closed.
        return [{
          id: partner[0].id,
          name: partner[0].name,
          gender: partner[0].gender,
          profileData: partner[0].profileData,
          partnershipId: 0,
          partnershipConfirmed: false,
          profileAccessRequestedAt: null,
          profileAccessGrantedAt: null,
          profileAccessDeclinedAt: null,
        }];
      }
    }
  }
  return [];
}

/**
 * The sole/primary partner of a user — first entry of getPartnersOfUser,
 * which now orders oldest confirmed partnership first (see its own ORDER BY
 * comment). A user with 0 or 1 confirmed partnerships gets bit-for-bit the
 * same result this function always returned. A man with 2+ confirmed wives
 * now deterministically gets his OLDEST confirmed wife on every call — never
 * "whichever the query happens to return" (that non-determinism was the
 * actual bug; fixed once, in getPartnersOfUser, for every caller below).
 *
 * Determinism alone does not make a polygynous man's result CORRECT for
 * every caller, only stable — so this is still only called from sites where
 * that has been deliberately checked to be safe:
 * - profileRouter.get: legacy singular `parentProfile.partnerName`/`partnerId`
 *   display fields predating polygyny; own comment there.
 * - requestPartnerProfileAccess: gated wife-only before this is ever
 *   reached, and a woman has at most one confirmed husband (data-layer rule
 *   — womanAlreadyHasConfirmedHusband, checked at both places a partnership
 *   is confirmed) — unambiguous for every caller who can reach it.
 * - getPartnerProfile: the reference pattern (optional `partnerId`, falls
 *   back to this only when omitted) — a deliberate read-only exception that
 *   does not fail closed on ambiguity; see its own comment for why.
 *
 * syncWithPartner/shareWeeklyProgress/getSpouseAdvice no longer call this at
 * all: they take an explicit `partnerId` and resolve it against
 * getPartnersOfUser directly, failing closed when ambiguous. Callers that
 * must see every partner also use getPartnersOfUser directly
 * (links.listPartners).
 */
export async function getPartnerOfUser(userId: number): Promise<PartnerRecord | null> {
  const partners = await getPartnersOfUser(userId);
  return partners[0] ?? null;
}

/**
 * Item 3 — owner's ruling: a man may have multiple wives; a woman at most
 * one husband at a time. True when `userId` is on record as female
 * (users.gender COLUMN — this file's own convention, see PartnerRecord's
 * `gender` doc comment above; a legacy row whose gender lives ONLY in the
 * JSON parentProfile copy is not caught here, same ceiling this file's
 * other gender reads already have) AND already has a DIFFERENT active,
 * confirmed partnership on record. Checked at both places a partnership can
 * become active+confirmed: createPartnership's confirmed=true insert branch
 * below, and confirmPartnershipRequest's UPDATE further down.
 *
 * ponytail: a pre-check (two selects) then a guarded write, matching this
 * file's existing idiom (see revokePartnerProfileAccess/createPartnership's
 * own existing-row check) rather than one correlated-subquery WHERE — this
 * leaves a narrow TOCTOU window if the same woman is confirmed into two
 * partnerships in the same instant. Upgrade path: a DB-level partial unique
 * index, if that race ever proves reachable in practice (this app has no
 * realistic concurrent-marriage-confirmation load today).
 */
async function womanAlreadyHasConfirmedHusband(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  // Column OR the JSON copy, matching what every authorization this protects
  // resolves through (routers.ts resolveGender). Reading the column alone let a
  // pre-migration-0012 row — users.gender NULL, profileData.parentProfile.gender
  // "vrouw" — pass as non-female and hold two confirmed husbands, while the
  // access gate simultaneously treated her as a woman. The write path has to use
  // the same resolution the read path does, or the invariant is only enforced
  // for whoever happens to have the newer column populated.
  const [user] = await db
    .select({ gender: users.gender, profileData: users.profileData })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const resolved =
    user?.gender || (user?.profileData as any)?.parentProfile?.gender || "";
  if (resolved !== "vrouw") return false;
  const [existing] = await db
    .select({ id: partnerships.id })
    .from(partnerships)
    .where(
      and(
        or(eq(partnerships.userId1, userId), eq(partnerships.userId2, userId)),
        eq(partnerships.status, "active"),
        eq(partnerships.confirmed, true),
      ),
    )
    .limit(1);
  return !!existing;
}

/** Create a partnership record (idempotent) */
export async function createPartnership(
  userId1: number,
  userId2: number,
  initiatedBy: number,
  confirmed = false,
) {
  const db = await getDb();
  if (!db) return null;
  // Check if already exists
  const existing = await db
    .select()
    .from(partnerships)
    .where(
      and(
        or(
          and(
            eq(partnerships.userId1, userId1),
            eq(partnerships.userId2, userId2),
          ),
          and(
            eq(partnerships.userId1, userId2),
            eq(partnerships.userId2, userId1),
          ),
        ),
        sql`${partnerships.status} IN ('pending', 'active')`,
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    // Never promote an existing row to active/confirmed here, even when the
    // caller passed confirmed=true. The only two callers of this function
    // are linkPartnerByPublicId (always confirmed=false — creates a genuine,
    // live invite the recipient must act on) and getPartnerOfUser's shared-
    // children legacy fallback (confirmed=FALSE since the consent fix — it
    // used to pass true, which let a read manufacture the very consent
    // hasFullPartnerAccess checks). That fallback is not
    // guaranteed to run only when no partnerships row exists for this pair —
    // getPartnerOfUser's own lookup also falls through to it when a matching
    // active+confirmed row DOES exist but its partner user is soft-deleted
    // (that lookup filters on isNull(users.deletedAt)). Either way, every
    // write to `partnerships` elsewhere in this file keeps status and
    // confirmed in lockstep (pending+unconfirmed, active+confirmed, or
    // dissolved), so any row landed on here that isn't already
    // active+confirmed is still always a real pending invite awaiting the
    // recipient's own confirmPartnershipRequest call — never a leftover this
    // same auto-create path can safely finish on its own. Auto-confirming it
    // from the INVITER's side (e.g. by them merely calling getPartnerProfile
    // / getSpouseAdvice / syncWithPartner, which route through here) would
    // accept the invite on the recipient's behalf, contradicting the "no
    // data is shared until you confirm" message they were sent.
    return existing[0];
  }
  // Item 3: only the confirmed=true branch can land an ALREADY-active
  // partnership — the ordinary confirmed=false invite (linkPartnerByPublicId)
  // poses no risk here and is never blocked by this.
  if (
    confirmed &&
    // Currently unreachable: the only caller left passes confirmed:false
    // (linkPartnerByPublicId), since the shared-children fallback stopped
    // writing. Kept deliberately rather than deleted as dead code — it is a
    // backstop on an invariant, and the cost is one unexecuted branch, while
    // removing it would let a future confirmed:true caller activate a second
    // husband with nothing to stop it. confirmPartnershipRequest carries the
    // same check for the path that IS live.
    ((await womanAlreadyHasConfirmedHusband(userId1)) ||
      (await womanAlreadyHasConfirmedHusband(userId2)))
  ) {
    return null;
  }
  // Create new
  const [result] = await db
    .insert(partnerships)
    .values({
      userId1,
      userId2,
      initiatedBy,
      confirmed,
      status: confirmed ? "active" : "pending",
    });
  // PORTING HAZARD (round-10 P2): insertId(result) only ever recovers
  // mysql2's [ResultSetHeader] shape (see its own doc comment) — production
  // is a hand-ported Postgres server, where a plain INSERT carries no id
  // without `.returning()`, which this mysql2-typed insert() builder can't
  // call. Left as insertId()-only, every production call here silently
  // returned { id: undefined }, which getPartnersOfUser's caller then had to
  // fail closed on (round-8 P3) — a correct backstop, but on Postgres it
  // fired on EVERY first-ever detection of a shared-children co-parent, so
  // that legacy fallback never actually worked in production. Fixed by
  // re-selecting the row via its natural key (userId1/userId2, unordered)
  // instead of trusting the insert result: the "already exists" check above
  // already proved no pending/active row existed for this pair before this
  // insert, so this SELECT can only find the row just written, on either
  // driver. mysql2 is unaffected (insertId already resolves it, no extra
  // query); Postgres now gets a real, usable id instead of losing the link.
  let id = insertId(result);
  if (typeof id !== "number") {
    const [row] = await db
      .select({ id: partnerships.id })
      .from(partnerships)
      .where(
        and(
          or(
            and(eq(partnerships.userId1, userId1), eq(partnerships.userId2, userId2)),
            and(eq(partnerships.userId1, userId2), eq(partnerships.userId2, userId1)),
          ),
          eq(partnerships.status, confirmed ? "active" : "pending"),
        ),
      )
      .limit(1);
    id = row?.id;
  }
  return {
    id,
    userId1,
    userId2,
    status: confirmed ? "active" : "pending",
    initiatedBy,
    confirmed,
  };
}

export async function getPartnershipById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [partnership] = await db
    .select()
    .from(partnerships)
    .where(eq(partnerships.id, id))
    .limit(1);
  return partnership;
}

export async function getPendingPartnershipFromSender(
  senderId: number,
  recipientId: number,
) {
  const db = await getDb();
  if (!db) return undefined;
  const [partnership] = await db
    .select()
    .from(partnerships)
    .where(
      and(
        eq(partnerships.initiatedBy, senderId),
        or(
          and(
            eq(partnerships.userId1, senderId),
            eq(partnerships.userId2, recipientId),
          ),
          and(
            eq(partnerships.userId1, recipientId),
            eq(partnerships.userId2, senderId),
          ),
        ),
        eq(partnerships.status, "pending"),
        eq(partnerships.confirmed, false),
      ),
    )
    .limit(1);
  return partnership;
}

/** Every pending partner-link request awaiting THIS user's confirmation: rows a
 * different party initiated (initiatedBy != me) that are still pending, with the
 * sender's identity for display. This is the surface the recipient had none of —
 * getCoParents deliberately excludes unconfirmed rows and directMessages is gated
 * on a confirmed co-parent, so without this a request could be sent (and push a
 * notification) yet never be reachable to accept. Accept via confirmLink, reject
 * via removeLink (both keyed by senderId). Two-step sender fetch to match
 * getCoParents' idiom (no joins). */
export async function getIncomingLinkRequests(recipientId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(partnerships)
    .where(
      and(
        or(
          eq(partnerships.userId1, recipientId),
          eq(partnerships.userId2, recipientId),
        ),
        sql`${partnerships.initiatedBy} != ${recipientId}`,
        eq(partnerships.status, "pending"),
        eq(partnerships.confirmed, false),
      ),
    );
  if (rows.length === 0) return [];
  const senderIds = Array.from(new Set(rows.map((r) => r.initiatedBy)));
  const senders = await db
    .select()
    .from(users)
    .where(
      // deletedAt guard, same as every other user-identity hand-out in this
      // file: soft-delete stamps deletedAt but preserves name/publicId, so a
      // sender who deleted their account after requesting would otherwise have
      // their real identity surfaced to the recipient here. A filtered-out
      // sender is then absent from byId below and the request is dropped, not
      // shown — see the flatMap.
      sql`${users.id} IN (${sql.join(
        senderIds.map((id) => sql`${id}`),
        sql`, `,
      )}) AND ${users.deletedAt} IS NULL`,
    );
  const byId = new Map(senders.map((s) => [s.id, s]));
  // Only surface a request whose sender is a live user. A soft-deleted sender is
  // filtered out by the deletedAt guard above; a genuinely orphaned sender row
  // is absent too. Either way there is no acceptable partner behind the request,
  // and offering an Accept button for it would let the recipient confirm a
  // partnership with a deleted/nonexistent account — which nothing can later
  // dissolve (getPartnersOfUser hides deleted partners, so no partnershipId ever
  // reaches the client) and which permanently trips the one-woman-one-husband
  // constraint. So drop the phantom rather than show it.
  return rows.flatMap((r) => {
    const s = byId.get(r.initiatedBy);
    if (!s) return [];
    return [
      {
        partnershipId: r.id,
        senderId: r.initiatedBy,
        senderName: s.name ?? null,
        senderPublicId: s.publicId ?? null,
        createdAt: r.createdAt,
      },
    ];
  });
}

export async function confirmPartnershipRequest(
  partnershipId: number,
  recipientId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  // Item 3 — this is the real-world chokepoint for the one-husband
  // constraint: every ordinary marriage link goes invite
  // (linkPartnerByPublicId, always confirmed=false) then confirm (here).
  // Must check BOTH parties, not just recipientId — either side of the pair
  // could be the wife, and confirmation is mutual regardless of who
  // initiated. See womanAlreadyHasConfirmedHusband's own doc comment for
  // what "checked" means here (raw gender column, pre-check-then-write).
  const partnership = await getPartnershipById(partnershipId);
  if (!partnership) return false;
  const otherId =
    partnership.userId1 === recipientId ? partnership.userId2 : partnership.userId1;
  if (
    (await womanAlreadyHasConfirmedHusband(recipientId)) ||
    (await womanAlreadyHasConfirmedHusband(otherId))
  ) {
    return false;
  }
  const result = await db
    .update(partnerships)
    .set({ status: "active", confirmed: true })
    .where(
      and(
        eq(partnerships.id, partnershipId),
        or(
          eq(partnerships.userId1, recipientId),
          eq(partnerships.userId2, recipientId),
        ),
        sql`${partnerships.initiatedBy} != ${recipientId}`,
        eq(partnerships.status, "pending"),
        eq(partnerships.confirmed, false),
      ),
    );
  // affectedRows(), not a raw mysql2-shaped read: this file is MySQL-flavoured
  // but production is a hand-ported Postgres server, where an .update() without
  // .returning() yields { rowCount, rows } and `result[0].affectedRows` is
  // always undefined — see affectedRows()'s own porting-hazard comment. That
  // used to fail SILENTLY (a false return just skipped the child-sharing
  // block); confirmLink now turns a false into a thrown CONFLICT, so the same
  // misread would tell every confirming user they already have a partner. The
  // helper reads both driver shapes.
  return affectedRows(result) === 1;
}

export async function rejectPartnershipRequest(
  partnershipId: number,
  recipientId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .update(partnerships)
    .set({ status: "dissolved", dissolvedAt: new Date() })
    .where(
      and(
        eq(partnerships.id, partnershipId),
        or(
          eq(partnerships.userId1, recipientId),
          eq(partnerships.userId2, recipientId),
        ),
        sql`${partnerships.initiatedBy} != ${recipientId}`,
        eq(partnerships.status, "pending"),
      ),
    );
  // affectedRows(), for the same porting reason its sibling
  // confirmPartnershipRequest was just switched: this file is MySQL-flavoured
  // but production is a hand-ported Postgres server, where an .update() with no
  // .returning() yields { rowCount, rows } and result[0].affectedRows is always
  // undefined. Left raw, every rejection there would report failure while
  // having actually dissolved the row.
  return affectedRows(result) === 1;
}

/**
 * Wife requests permission to read her husband's profile. Idempotent —
 * re-stamps the request time. Gender ("wife only") is resolved from
 * profileData.parentProfile.gender by the caller (linksRouter), not here;
 * this WHERE clause guards only that requesterId is a genuine party of an
 * active, confirmed partnership — same shape as confirmPartnershipRequest.
 */
export async function requestPartnerProfileAccess(
  partnershipId: number,
  requesterId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .update(partnerships)
    .set({ profileAccessRequestedAt: new Date() })
    .where(
      and(
        eq(partnerships.id, partnershipId),
        or(
          eq(partnerships.userId1, requesterId),
          eq(partnerships.userId2, requesterId),
        ),
        eq(partnerships.status, "active"),
        eq(partnerships.confirmed, true),
        // Conditional on both timestamps still being unset (round-7 P3
        // fix): the router's own idempotency check (routers.ts) reads
        // partner state fetched BEFORE this call, so two near-simultaneous
        // requests can both pass that check and both reach here. Without
        // this, both writes would succeed and both notify the husband.
        // With it, only the first writer's WHERE clause matches — the
        // second gets affectedRows=0, and routers.ts re-fetches to tell
        // "someone else's request already landed" (idempotent success)
        // apart from a genuine FORBIDDEN.
        isNull(partnerships.profileAccessRequestedAt),
        isNull(partnerships.profileAccessGrantedAt),
      ),
    );
  return affectedRows(result) === 1;
}

/** Husband grants his wife access to his profile. See requestPartnerProfileAccess re: gender. */
export async function grantPartnerProfileAccess(
  partnershipId: number,
  granterId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .update(partnerships)
    .set({ profileAccessGrantedAt: new Date() })
    .where(
      and(
        eq(partnerships.id, partnershipId),
        or(
          eq(partnerships.userId1, granterId),
          eq(partnerships.userId2, granterId),
        ),
        eq(partnerships.status, "active"),
        eq(partnerships.confirmed, true),
      ),
    );
  return affectedRows(result) === 1;
}

/**
 * Husband revokes access (or declines a request he never granted — the app
 * wires both actions to this same mutation, with no input of its own to say
 * which — see the Fix 1 branch below). Works at any time. Also clears the
 * request timestamp: leaving it set stranded the wife at
 * requestPending=true forever with no way to ask again.
 *
 * Fix 1: revoking an active grant and declining a pending request used to
 * both just null profileAccessGrantedAt/profileAccessRequestedAt — leaving
 * an identical row to "never asked", so the wife was re-shown fresh ask-copy
 * after being declined, and nothing bounded the husband being re-notified
 * (decline -> request -> decline...). Branches on the row's OWN prior state
 * (there is no caller-supplied intent to read) to leave distinguishable
 * state: a decline (no grant existed) stamps profileAccessDeclinedAt; an
 * actual revoke (a grant existed) clears it instead — a revoke is a
 * different event, and clearing it here also drops any decline stamp left
 * over from an earlier ask-decline-ask-grant cycle, so a later revoke never
 * shows a stale "he declined" from before he ultimately said yes.
 */
export async function revokePartnerProfileAccess(
  partnershipId: number,
  granterId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  // Authorize with a plain existence check rather than deciding success
  // from the UPDATE's own affectedRows: unlike grantPartnerProfileAccess
  // (always stamps a fresh Date, so it always reads as "changed") or
  // requestPartnerProfileAccess (WHERE-gated on the columns still being
  // unset), this SET can legitimately match values already in place —
  // declining a request that was never granted, or re-revoking an
  // already-revoked grant, is an idempotent no-op this mutation is meant to
  // handle (see its own doc comment above), not a race to reject. mysql2's
  // default affected-rows semantics count only rows actually CHANGED (see
  // affectedRows()'s own porting-hazard comment), so that no-op would read
  // as affectedRows=0 — indistinguishable, at that point, from "no such
  // authorized row" — and get reported as FORBIDDEN instead of success.
  //
  // Also selects profileAccessGrantedAt (Fix 1): the ownership check needs
  // to read the row anyway, so branching on its own prior state costs no
  // extra query.
  const owned = await db
    .select({
      id: partnerships.id,
      profileAccessGrantedAt: partnerships.profileAccessGrantedAt,
      profileAccessRequestedAt: partnerships.profileAccessRequestedAt,
      profileAccessDeclinedAt: partnerships.profileAccessDeclinedAt,
    })
    .from(partnerships)
    .where(
      and(
        eq(partnerships.id, partnershipId),
        or(
          eq(partnerships.userId1, granterId),
          eq(partnerships.userId2, granterId),
        ),
        eq(partnerships.status, "active"),
        eq(partnerships.confirmed, true),
      ),
    )
    .limit(1);
  if (owned.length === 0) return false;
  const wasGranted = owned[0].profileAccessGrantedAt != null;
  const wasRequested = owned[0].profileAccessRequestedAt != null;
  // Only a genuine decline of a still-pending request stamps declinedAt.
  // Revoking a grant clears it; calling this with nothing pending must not
  // fabricate a decline — preserve whatever was already there.
  const newDeclinedAt = wasGranted
    ? null
    : wasRequested
      ? new Date()
      : owned[0].profileAccessDeclinedAt;
  await db
    .update(partnerships)
    .set({
      profileAccessGrantedAt: null,
      profileAccessRequestedAt: null,
      profileAccessDeclinedAt: newDeclinedAt,
    })
    .where(eq(partnerships.id, partnershipId));
  return true;
}

/**
 * Clears profileAccessGrantedAt AND profileAccessRequestedAt on every
 * partnership this user is a party to. Called from profileRouter.save
 * (routers.ts) whenever a user's gender actually changes — this is what
 * makes gender safe to change again after round-6 made it permanently
 * immutable: self-granting via a temporary gender flip now gains an
 * attacker nothing, because flipping back destroys the very grant it just
 * created. Unconditional across ALL of the user's partnership rows (not
 * just an active/confirmed one) and over both nullable columns even if
 * only one was set — clearing an already-null column is a harmless no-op,
 * and this must never leave a stale grant standing after a gender change.
 */
export async function revokeProfileAccessGrantsForUser(
  userId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(partnerships)
    .set({ profileAccessGrantedAt: null, profileAccessRequestedAt: null })
    .where(
      or(eq(partnerships.userId1, userId), eq(partnerships.userId2, userId)),
    );
}

export async function areConfirmedCoParents(
  userId: number,
  otherUserId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db || userId === otherUserId) return false;
  const [partnership] = await db
    .select({ id: partnerships.id })
    .from(partnerships)
    .where(
      and(
        or(
          and(
            eq(partnerships.userId1, userId),
            eq(partnerships.userId2, otherUserId),
          ),
          and(
            eq(partnerships.userId1, otherUserId),
            eq(partnerships.userId2, userId),
          ),
        ),
        eq(partnerships.status, "active"),
        eq(partnerships.confirmed, true),
      ),
    )
    .limit(1);
  if (partnership) return true;
  const mine = await db
    .select({ childId: parentChildLinks.childId })
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, userId),
        eq(parentChildLinks.confirmed, true),
      ),
    );
  for (const link of mine) {
    if (await getConfirmedParentChildLink(otherUserId, link.childId)) {
      return true;
    }
  }
  return false;
}

export async function isAvailableSpecialist(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [profile] = await db
    .select({ id: specialistProfiles.id })
    .from(specialistProfiles)
    .where(
      and(
        eq(specialistProfiles.userId, userId),
        eq(specialistProfiles.isAvailable, true),
      ),
    )
    .limit(1);
  return Boolean(profile);
}

export async function hasActiveSpecialistParentRelationship(
  specialistId: number,
  parentId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const assignments = await db
    .select({ familyId: specialistAssignments.familyId })
    .from(specialistAssignments)
    .where(
      and(
        eq(specialistAssignments.specialistId, specialistId),
        eq(specialistAssignments.status, "active"),
      ),
    );
  for (const assignment of assignments) {
    if (await getFamilyMembership(parentId, assignment.familyId)) return true;
  }
  return false;
}

/**
 * Item 2 — dissolve ONE specific partnership, not every partnership of a
 * user (a man with 2+ wives must be able to separate from one without
 * touching the others; the owner's ruling also requires either spouse to
 * choose WHICH partner they separated from). Authorized to a party of that
 * partnership in the SQL WHERE clause, matching this file's existing idiom
 * (see confirmPartnershipRequest/grantPartnerProfileAccess above). Had no
 * callers under its old (userId)-only signature (grep confirmed), so this
 * is a signature change with zero existing blast radius.
 *
 * No extra revocation step needed on top of the status flip: every read in
 * this file (getPartnersOfUser, hasConfirmedPartner, ...) already filters
 * on status='active', so a dissolved row simply stops being returned —
 * access ends as a side effect of that filter, not something this function
 * has to do itself.
 */
export async function dissolvePartnership(
  partnershipId: number,
  userId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .update(partnerships)
    .set({ status: "dissolved", dissolvedAt: new Date() })
    .where(
      and(
        eq(partnerships.id, partnershipId),
        or(eq(partnerships.userId1, userId), eq(partnerships.userId2, userId)),
        eq(partnerships.status, "active"),
      ),
    );
  return affectedRows(result) === 1;
}

/**
 * Get interaction data for spouse advice generation:
 * - Goal progress (weekly interactions with children's advice)
 * - AI conversations (consultant questions)
 * - Messages between spouses
 */
export async function getSpouseInteractionData(
  userId: number,
  partnerId: number,
) {
  const db = await getDb();
  if (!db)
    return {
      goals: [],
      conversations: [],
      messages: [],
      profileData: null,
      childrenData: [],
    };
  // Get recent goal progress for this user
  const goals = await db
    .select()
    .from(goalProgress)
    .where(eq(goalProgress.markedBy, userId))
    .orderBy(desc(goalProgress.createdAt))
    .limit(30);
  // Get recent AI conversations (consultant)
  const conversations = await db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.userId, userId))
    .orderBy(desc(aiConversations.createdAt))
    .limit(10);
  // Get messages between the two
  const msgs = await db
    .select()
    .from(messages)
    .where(
      or(
        and(eq(messages.senderId, userId), eq(messages.recipientId, partnerId)),
        and(eq(messages.senderId, partnerId), eq(messages.recipientId, userId)),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(20);
  // Get user's full profileData (includes dailyCheckins, dailyTipCompletions, environments)
  const userRow = await db
    .select({ profileData: users.profileData })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const profileData = userRow[0]?.profileData || null;
  // Get children data with environment analysis (shared children)
  const userFamilyRows = await db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(eq(familyMembers.userId, userId));
  const familyIds = userFamilyRows.map((r) => r.familyId);
  let childrenData: any[] = [];
  if (familyIds.length > 0) {
    for (const fId of familyIds) {
      const kids = await db
        .select()
        .from(children)
        .where(and(eq(children.familyId, fId), isNull(children.deletedAt)));
      childrenData.push(...kids);
    }
  }
  return { goals, conversations, messages: msgs, profileData, childrenData };
}

// ============================================================
// TRANSLATION CACHE - DB-backed persistent translation cache
// ============================================================

/**
 * Simple hash function for source text (using first 64 chars of a basic hash).
 * Uses a simple djb2-based approach converted to hex.
 */
function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) & 0xffffffff;
  }
  // Convert to hex and pad to ensure consistent length
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  // Add length-based component for uniqueness
  const lenHash = ((text.length * 31) & 0xffffffff) >>> 0;
  return (
    hex +
    lenHash.toString(16).padStart(8, "0") +
    text
      .substring(0, 48)
      .replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "")
      .substring(0, 48)
  );
}

/**
 * Get cached translations from DB for given texts and target language.
 * Returns a map of sourceHash -> translatedText for found entries.
 */
export async function getCachedTranslations(
  texts: string[],
  targetLang: "nl" | "en",
): Promise<Map<string, string>> {
  const db = await getDb();
  const result = new Map<string, string>();
  if (!db || texts.length === 0) return result;

  const hashes = texts.map((t) => hashText(t));

  for (const hash of hashes) {
    const rows = await db
      .select()
      .from(translationCacheTable)
      .where(
        and(
          eq(translationCacheTable.sourceHash, hash),
          eq(translationCacheTable.targetLang, targetLang),
        ),
      )
      .limit(1);
    if (rows.length > 0) {
      result.set(hash, rows[0].translatedText);
      // Increment hit count (fire and forget)
      db.update(translationCacheTable)
        .set({ hitCount: sql`${translationCacheTable.hitCount} + 1` })
        .where(eq(translationCacheTable.id, rows[0].id))
        .catch(() => {});
    }
  }
  return result;
}

/**
 * Save translations to DB cache for future use by all users.
 */
export async function saveTranslationsToCache(
  entries: {
    sourceText: string;
    translatedText: string;
    targetLang: "nl" | "en";
    category?: string;
  }[],
): Promise<void> {
  const db = await getDb();
  if (!db || entries.length === 0) return;

  for (const entry of entries) {
    const hash = hashText(entry.sourceText);
    // Check if already exists
    const existing = await db
      .select({ id: translationCacheTable.id })
      .from(translationCacheTable)
      .where(
        and(
          eq(translationCacheTable.sourceHash, hash),
          eq(translationCacheTable.targetLang, entry.targetLang),
        ),
      )
      .limit(1);
    if (existing.length === 0) {
      await db.insert(translationCacheTable).values({
        sourceHash: hash,
        targetLang: entry.targetLang,
        sourceText: entry.sourceText,
        translatedText: entry.translatedText,
        category: entry.category || "general",
        hitCount: 0,
      });
    }
  }
}

/**
 * Get the hash for a text (exported for use in router).
 */
export function getTextHash(text: string): string {
  return hashText(text);
}

// ============================================================
// ENVIRONMENT ANALYSIS - Auto-generated reports
// ============================================================

export async function createEnvironmentAnalysis(
  data: InsertEnvironmentAnalysis,
) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(environmentAnalysis)
    .values(data)
    .$returningId();
  return result;
}

export async function getEnvironmentAnalyses(userId: number, childId?: number) {
  const database = await getDb();
  if (!database) return [];
  const conditions = [eq(environmentAnalysis.userId, userId)];
  if (childId) conditions.push(eq(environmentAnalysis.childId, childId));
  return database
    .select()
    .from(environmentAnalysis)
    .where(and(...conditions))
    .orderBy(desc(environmentAnalysis.analyzedAt));
}

export async function getLatestEnvironmentAnalysis(
  userId: number,
  childId: number,
) {
  const database = await getDb();
  if (!database) return null;
  const results = await database
    .select()
    .from(environmentAnalysis)
    .where(
      and(
        eq(environmentAnalysis.userId, userId),
        eq(environmentAnalysis.childId, childId),
      ),
    )
    .orderBy(desc(environmentAnalysis.analyzedAt))
    .limit(1);
  return results[0] || null;
}

// ============================================================
// CHILD ACCOUNTS - Login for children 12+
// ============================================================

export async function createChildAccount(data: InsertChildAccount) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(childAccounts)
    .values(data)
    .$returningId();
  return result;
}

export async function getChildAccountByAccessCode(
  parentId: number,
  accessCode: string,
) {
  const database = await getDb();
  if (!database) return null;
  const results = await database
    .select()
    .from(childAccounts)
    .where(
      and(
        eq(childAccounts.parentId, parentId),
        eq(childAccounts.accessCode, accessCode),
        eq(childAccounts.isActive, true),
      ),
    )
    .limit(1);
  return results[0] || null;
}

export async function getChildAccountsByParent(parentId: number) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(childAccounts)
    .where(
      and(
        eq(childAccounts.parentId, parentId),
        eq(childAccounts.isActive, true),
      ),
    );
}

export async function getChildAccountForParent(
  parentId: number,
  childAccountId: number,
) {
  const database = await getDb();
  if (!database) return null;
  const rows = await database
    .select()
    .from(childAccounts)
    .where(
      and(
        eq(childAccounts.id, childAccountId),
        eq(childAccounts.parentId, parentId),
        eq(childAccounts.isActive, true),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

export async function updateChildAccountLastActive(accountId: number) {
  const database = await getDb();
  if (!database) return;
  await database
    .update(childAccounts)
    .set({ lastActive: new Date() })
    .where(eq(childAccounts.id, accountId));
}

// ============================================================
// FAMILY GROUPS (using existing families table)
// ============================================================
// Note: Family groups use the existing `families` table with invitationCodes for joining.
// The familyReminders and familyActivities tables reference familyId from the families table.

// ============================================================
// NEIGHBORHOOD GROUPS
// ============================================================

export async function createNeighborhoodGroup(data: InsertNeighborhoodGroup) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(neighborhoodGroups)
    .values(data)
    .$returningId();
  return result;
}

export async function getNeighborhoodGroupsNearby(
  lat: number,
  lng: number,
  radiusKm: number = 5,
) {
  const database = await getDb();
  if (!database) return [];
  // Simple bounding box filter (not exact distance but good enough)
  const latDiff = radiusKm / 111;
  const lngDiff = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return database
    .select()
    .from(neighborhoodGroups)
    .where(
      and(
        gte(neighborhoodGroups.lat, String(lat - latDiff)),
        lte(neighborhoodGroups.lat, String(lat + latDiff)),
        gte(neighborhoodGroups.lon, String(lng - lngDiff)),
        lte(neighborhoodGroups.lon, String(lng + lngDiff)),
        eq(neighborhoodGroups.isActive, true),
      ),
    );
}

export async function addNeighborhoodMember(data: InsertNeighborhoodMember) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(neighborhoodMembers)
    .values(data)
    .$returningId();
  return result;
}

export async function getNeighborhoodMembers(groupId: number) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(neighborhoodMembers)
    .where(eq(neighborhoodMembers.groupId, groupId));
}

// ============================================================
// CHILD DAILY CHALLENGES
// ============================================================

export async function createChildChallenge(data: InsertChildChallenge) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(childChallenges)
    .values(data)
    .$returningId();
  return result;
}

export async function getChildChallenges(
  childAccountId: number,
  date?: string,
) {
  const database = await getDb();
  if (!database) return [];
  const conditions = [eq(childChallenges.childAccountId, childAccountId)];
  if (date) conditions.push(eq(childChallenges.challengeDate, date));
  return database
    .select()
    .from(childChallenges)
    .where(and(...conditions))
    .orderBy(desc(childChallenges.challengeDate));
}

export async function completeChildChallenge(challengeId: number) {
  const database = await getDb();
  if (!database) return;
  await database
    .update(childChallenges)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(childChallenges.id, challengeId));
}

export async function getChildChallenge(challengeId: number) {
  const database = await getDb();
  if (!database) return null;
  const rows = await database
    .select()
    .from(childChallenges)
    .where(eq(childChallenges.id, challengeId))
    .limit(1);
  return rows[0] || null;
}

// ============================================================
// CHILD ACHIEVEMENTS
// ============================================================

export async function createChildAchievement(data: InsertChildAchievement) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(childAchievements)
    .values(data)
    .$returningId();
  return result;
}

export async function getChildAchievements(childAccountId: number) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(childAchievements)
    .where(eq(childAchievements.childAccountId, childAccountId))
    .orderBy(desc(childAchievements.earnedAt));
}

// ============================================================
// CHILD ACTIVITY LOG
// ============================================================

export async function logChildActivity(data: InsertChildActivityLog) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(childActivityLog)
    .values(data)
    .$returningId();
  return result;
}

export async function getChildActivityLog(
  childAccountId: number,
  limit: number = 50,
) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(childActivityLog)
    .where(eq(childActivityLog.childAccountId, childAccountId))
    .orderBy(desc(childActivityLog.createdAt))
    .limit(limit);
}

// ============================================================
// SHARED CHILD UPDATES (Divorced parents communication)
// ============================================================

export async function createSharedChildUpdate(data: InsertSharedChildUpdate) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(sharedChildUpdates)
    .values(data)
    .$returningId();
  return result;
}

export async function getSharedChildUpdates(
  childId: number,
  limit: number = 30,
) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(sharedChildUpdates)
    .where(eq(sharedChildUpdates.childId, childId))
    .orderBy(desc(sharedChildUpdates.createdAt))
    .limit(limit);
}

export async function markSharedUpdateRead(updateId: number) {
  const database = await getDb();
  if (!database) return;
  await database
    .update(sharedChildUpdates)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(sharedChildUpdates.id, updateId));
}

// ============================================================
// FAMILY REMINDERS
// ============================================================

export async function createFamilyReminder(data: InsertFamilyReminder) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(familyReminders)
    .values(data)
    .$returningId();
  return result;
}

export async function getFamilyReminders(familyId: number) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(familyReminders)
    .where(
      and(
        eq(familyReminders.familyId, familyId),
        eq(familyReminders.isActive, true),
      ),
    )
    .orderBy(familyReminders.scheduledAt);
}

// ============================================================
// FAMILY ACTIVITIES (with voting)
// ============================================================

export async function createFamilyActivity(data: InsertFamilyActivity) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(familyActivities)
    .values(data)
    .$returningId();
  return result;
}

export async function getFamilyActivities(familyId: number) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(familyActivities)
    .where(eq(familyActivities.familyId, familyId))
    .orderBy(desc(familyActivities.createdAt));
}

export async function voteFamilyActivity(
  activityId: number,
  userId: number,
  vote: string,
) {
  const database = await getDb();
  if (!database) return;
  const [activity] = await database
    .select()
    .from(familyActivities)
    .where(eq(familyActivities.id, activityId));
  if (!activity) return;
  const currentVotes = (activity.votes as Record<string, string>) || {};
  currentVotes[String(userId)] = vote;
  await database
    .update(familyActivities)
    .set({ votes: currentVotes })
    .where(eq(familyActivities.id, activityId));
}

// ============================================================
// NEIGHBORHOOD ACTIVITIES
// ============================================================

export async function createNeighborhoodActivity(
  data: InsertNeighborhoodActivity,
) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(neighborhoodActivities)
    .values(data)
    .$returningId();
  return result;
}

export async function getNeighborhoodActivities(groupId: number) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(neighborhoodActivities)
    .where(eq(neighborhoodActivities.groupId, groupId))
    .orderBy(desc(neighborhoodActivities.createdAt));
}

// ============================================================
// PEER GROUPS
// ============================================================

export async function createPeerGroup(data: InsertPeerGroup) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(peerGroups)
    .values(data)
    .$returningId();
  return result;
}

export async function getPeerGroupByCode(inviteCode: string) {
  const database = await getDb();
  if (!database) return null;
  const results = await database
    .select()
    .from(peerGroups)
    .where(
      and(eq(peerGroups.inviteCode, inviteCode), eq(peerGroups.isActive, true)),
    )
    .limit(1);
  return results[0] || null;
}

export async function addPeerGroupMember(data: InsertPeerGroupMember) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(peerGroupMembers)
    .values(data)
    .$returningId();
  return result;
}

export async function getPeerGroupMembers(groupId: number) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(peerGroupMembers)
    .where(eq(peerGroupMembers.groupId, groupId));
}

export async function approvePeerGroupMember(
  memberId: number,
  parentId: number,
) {
  const database = await getDb();
  if (!database) return;
  await database
    .update(peerGroupMembers)
    .set({ approved: true, approvedByParentId: parentId })
    .where(eq(peerGroupMembers.id, memberId));
}

// ============================================================
// CHILD MONITORING SYSTEM - DB Functions
// ============================================================

// --- Custom Tasks ---
export async function createCustomTask(data: InsertCustomTask) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(customTasks)
    .values(data)
    .$returningId();
  return result;
}
export async function getCustomTasks(childAccountId: number, status?: string) {
  const database = await getDb();
  if (!database) return [];
  if (status) {
    return database
      .select()
      .from(customTasks)
      .where(
        and(
          eq(customTasks.childAccountId, childAccountId),
          eq(customTasks.status, status),
        ),
      )
      .orderBy(desc(customTasks.createdAt));
  }
  return database
    .select()
    .from(customTasks)
    .where(eq(customTasks.childAccountId, childAccountId))
    .orderBy(desc(customTasks.createdAt));
}
export async function getCustomTasksByParent(parentId: number) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(customTasks)
    .where(eq(customTasks.parentId, parentId))
    .orderBy(desc(customTasks.createdAt));
}
export async function getCustomTask(taskId: number) {
  const database = await getDb();
  if (!database) return null;
  const rows = await database
    .select()
    .from(customTasks)
    .where(eq(customTasks.id, taskId))
    .limit(1);
  return rows[0] || null;
}
export async function updateCustomTask(
  taskId: number,
  data: Partial<InsertCustomTask>,
) {
  const database = await getDb();
  if (!database) return;
  await database
    .update(customTasks)
    .set(data)
    .where(eq(customTasks.id, taskId));
}
export async function deleteCustomTask(taskId: number) {
  const database = await getDb();
  if (!database) return;
  await database.delete(customTasks).where(eq(customTasks.id, taskId));
}
export async function completeCustomTask(
  taskId: number,
  childNote?: string,
  proofImageUrl?: string,
) {
  const database = await getDb();
  if (!database) return;
  await database
    .update(customTasks)
    .set({
      status: "completed",
      completedAt: new Date(),
      childNote: childNote || null,
      proofImageUrl: proofImageUrl || null,
    })
    .where(eq(customTasks.id, taskId));
}

// --- Family Chat Messages ---
export async function sendFamilyChatMessage(data: InsertFamilyChatMessage) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(familyChatMessages)
    .values(data)
    .$returningId();
  return result;
}
export async function getFamilyChatMessages(
  parentId: number,
  childAccountId: number,
  limit: number = 100,
) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(familyChatMessages)
    .where(
      and(
        eq(familyChatMessages.parentId, parentId),
        eq(familyChatMessages.childAccountId, childAccountId),
      ),
    )
    .orderBy(desc(familyChatMessages.createdAt))
    .limit(limit);
}
export async function markFamilyChatRead(
  parentId: number,
  childAccountId: number,
  readerType: string,
) {
  const database = await getDb();
  if (!database) return;
  const senderType = readerType === "parent" ? "child" : "parent";
  await database
    .update(familyChatMessages)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(familyChatMessages.parentId, parentId),
        eq(familyChatMessages.childAccountId, childAccountId),
        eq(familyChatMessages.senderType, senderType),
        eq(familyChatMessages.isRead, false),
      ),
    );
}
export async function getUnreadChatCount(
  parentId: number,
  childAccountId: number,
  readerType: string,
) {
  const database = await getDb();
  if (!database) return 0;
  const senderType = readerType === "parent" ? "child" : "parent";
  const rows = await database
    .select({ count: sql<number>`count(*)` })
    .from(familyChatMessages)
    .where(
      and(
        eq(familyChatMessages.parentId, parentId),
        eq(familyChatMessages.childAccountId, childAccountId),
        eq(familyChatMessages.senderType, senderType),
        eq(familyChatMessages.isRead, false),
      ),
    );
  return rows[0]?.count || 0;
}

// --- Child Daily Summary ---
export async function getChildDailySummary(
  childAccountId: number,
  date: string,
) {
  const database = await getDb();
  if (!database) return null;
  const rows = await database
    .select()
    .from(childDailySummary)
    .where(
      and(
        eq(childDailySummary.childAccountId, childAccountId),
        eq(childDailySummary.date, date),
      ),
    );
  return rows[0] || null;
}
export async function getChildWeeklySummary(
  childAccountId: number,
  startDate: string,
  endDate: string,
) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(childDailySummary)
    .where(
      and(
        eq(childDailySummary.childAccountId, childAccountId),
        sql`${childDailySummary.date} >= ${startDate}`,
        sql`${childDailySummary.date} <= ${endDate}`,
      ),
    )
    .orderBy(childDailySummary.date);
}
export async function upsertChildDailySummary(
  childAccountId: number,
  date: string,
  data: Partial<InsertChildDailySummary>,
) {
  const database = await getDb();
  if (!database) return;
  const existing = await getChildDailySummary(childAccountId, date);
  if (existing) {
    await database
      .update(childDailySummary)
      .set(data)
      .where(eq(childDailySummary.id, existing.id));
  } else {
    await database
      .insert(childDailySummary)
      .values({ childAccountId, date, ...data });
  }
}

// --- Child AI Conversations ---
export async function createChildAiConversation(
  data: InsertChildAiConversation,
) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(childAiConversations)
    .values(data)
    .$returningId();
  return result;
}
export async function getChildAiConversations(
  childAccountId: number,
  limit: number = 20,
) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(childAiConversations)
    .where(eq(childAiConversations.childAccountId, childAccountId))
    .orderBy(desc(childAiConversations.updatedAt))
    .limit(limit);
}
export async function getChildAiConversation(conversationId: number) {
  const database = await getDb();
  if (!database) return null;
  const rows = await database
    .select()
    .from(childAiConversations)
    .where(eq(childAiConversations.id, conversationId));
  return rows[0] || null;
}
export async function updateChildAiConversation(
  conversationId: number,
  data: Partial<InsertChildAiConversation>,
) {
  const database = await getDb();
  if (!database) return;
  await database
    .update(childAiConversations)
    .set(data)
    .where(eq(childAiConversations.id, conversationId));
}

// --- Child App Usage ---
export async function logChildAppUsage(data: InsertChildAppUsage) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(childAppUsage)
    .values(data)
    .$returningId();
  return result;
}
export async function logChildAppUsageBatch(data: InsertChildAppUsage[]) {
  if (data.length === 0) return;
  const database = await getDb();
  if (!database) return;
  await database.insert(childAppUsage).values(data);
}
export async function getChildAppUsage(childAccountId: number, date: string) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(childAppUsage)
    .where(
      and(
        eq(childAppUsage.childAccountId, childAccountId),
        eq(childAppUsage.date, date),
      ),
    )
    .orderBy(desc(childAppUsage.usageSeconds));
}
export async function getChildAppUsageRange(
  childAccountId: number,
  startDate: string,
  endDate: string,
) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(childAppUsage)
    .where(
      and(
        eq(childAppUsage.childAccountId, childAccountId),
        sql`${childAppUsage.date} >= ${startDate}`,
        sql`${childAppUsage.date} <= ${endDate}`,
      ),
    )
    .orderBy(desc(childAppUsage.usageSeconds));
}

// --- Parent AI Consultations ---
export async function createParentAiConsultation(
  data: InsertParentAiConsultation,
) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database
    .insert(parentAiConsultations)
    .values(data)
    .$returningId();
  return result;
}
export async function getParentAiConsultations(
  parentId: number,
  consultationType?: string,
) {
  const database = await getDb();
  if (!database) return [];
  if (consultationType) {
    return database
      .select()
      .from(parentAiConsultations)
      .where(
        and(
          eq(parentAiConsultations.parentId, parentId),
          eq(parentAiConsultations.consultationType, consultationType),
        ),
      )
      .orderBy(desc(parentAiConsultations.updatedAt));
  }
  return database
    .select()
    .from(parentAiConsultations)
    .where(eq(parentAiConsultations.parentId, parentId))
    .orderBy(desc(parentAiConsultations.updatedAt));
}
export async function getParentAiConsultation(consultationId: number) {
  const database = await getDb();
  if (!database) return null;
  const rows = await database
    .select()
    .from(parentAiConsultations)
    .where(eq(parentAiConsultations.id, consultationId));
  return rows[0] || null;
}
export async function updateParentAiConsultation(
  consultationId: number,
  data: Partial<InsertParentAiConsultation>,
) {
  const database = await getDb();
  if (!database) return;
  await database
    .update(parentAiConsultations)
    .set(data)
    .where(eq(parentAiConsultations.id, consultationId));
}

export async function deleteParentAiConsultation(consultationId: number) {
  const database = await getDb();
  if (!database) return;
  await database
    .delete(parentAiConsultations)
    .where(eq(parentAiConsultations.id, consultationId));
}
/**
 * A parent's consultations, keyed to their account when they have one.
 *
 * Every consultation was filed under deviceId alone with parentId hardcoded to
 * 0, so a reinstall or a new phone orphaned all of them: the rows stayed in the
 * table while the archive read empty.
 *
 * A signed-in caller gets their own rows plus any unclaimed ones from the device
 * in front of them. Note what that does NOT do: a legacy row is reachable only
 * while the device still sends the id it was filed under, and nothing re-homes
 * it to the account — read-time adoption was removed because a client-asserted
 * deviceId must not be able to claim rows. Rows written from now on carry the
 * account, so the orphaning stops going forward rather than being undone.
 */
export async function getParentAiConsultationsForOwner(
  parentId: number,
  deviceId: string,
) {
  const database = await getDb();
  if (!database) return [];
  if (!parentId) {
    // Unowned rows only — the same rule ownsConsultation applies. Listing every
    // row for the device would show a caller with no account the consultations
    // that now belong to one, which open and delete would then refuse.
    return database
      .select()
      .from(parentAiConsultations)
      .where(
        and(
          eq(parentAiConsultations.parentId, 0),
          eq(parentAiConsultations.deviceId, deviceId),
        ),
      )
      .orderBy(desc(parentAiConsultations.updatedAt));
  }
  return database
    .select()
    .from(parentAiConsultations)
    .where(
      or(
        eq(parentAiConsultations.parentId, parentId),
        and(
          eq(parentAiConsultations.parentId, 0),
          eq(parentAiConsultations.deviceId, deviceId),
        ),
      ),
    )
    .orderBy(desc(parentAiConsultations.updatedAt));
}

