import {
  eq,
  and,
  desc,
  sql,
  isNull,
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
} from "../drizzle/schema";
// Family groups use existing `families` table - no separate familyGroups/familyGroupMembers tables
import { ENV } from "./_core/env";

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

export async function updateUserProfile(userId: number, profileData: unknown) {
  const db = await getDb();
  if (!db) return;
  // Extract key fields into dedicated columns for querying
  const data = profileData as any;
  const parentProfile = data?.parentProfile || {};
  const setFields: any = {
    profileData,
    onboardingCompleted: true,
    lastActive: new Date(),
  };
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
  return db.select().from(users).orderBy(desc(users.createdAt));
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
  const [userCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users);
  const [familyCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(families);
  const [childCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(children);
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
  const allMembers = await db.select().from(familyMembers);
  const allChildren = await db.select().from(children);
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
  const allChildren = await db
    .select()
    .from(children)
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
    .where(eq(users.role, "specialist"));
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
  return db.select().from(users).where(eq(users.role, "teacher"));
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
    .where(sql`${users.createdAt} >= ${since}`)
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
    .where(sql`${users.lastActive} >= ${since}`)
    .groupBy(sql`DATE(${users.lastActive})`)
    .orderBy(sql`DATE(${users.lastActive})`);
  return results;
}

/** Get analytics: children by age group */
export async function getChildrenByAgeGroup() {
  const db = await getDb();
  if (!db) return [];
  const allChildren = await db.select().from(children);
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
  const allChildren = await db.select().from(children);
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
  // First try exact match
  let result = await db
    .select()
    .from(users)
    .where(eq(users.publicId, publicId))
    .limit(1);
  if (result.length > 0) return result[0];
  // Try case-insensitive match (UPPER comparison)
  const upper = publicId.toUpperCase();
  result = await db
    .select()
    .from(users)
    .where(sql`UPPER(${users.publicId}) = ${upper}`)
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
      .where(sql`${users.publicId} LIKE ${datePart + "_%_" + seqPart}`)
      .limit(1);
    if (result.length > 0) return result[0];
  }
  // Also try if user entered without underscores or with different separators
  const cleaned = publicId.replace(/[-\s]/g, "_").toUpperCase();
  if (cleaned !== upper) {
    result = await db
      .select()
      .from(users)
      .where(sql`UPPER(${users.publicId}) = ${cleaned}`)
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
      sql`${users.id} IN (${sql.join(
        otherParentIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
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
        sql`${children.id} IN (${sql.join(
          allSharedChildIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
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
    .where(eq(users.id, profile.userId));
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
      .where(eq(users.id, profile.userId));
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

    // Get children
    const familyChildren = await db
      .select()
      .from(children)
      .where(eq(children.familyId, assignment.familyId));

    // Get parent user profiles
    const parentProfiles = [];
    for (const member of members) {
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, member.userId));
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
    .where(eq(users.id, userId))
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
  // Soft delete: mark as deleted but preserve data
  await db
    .update(users)
    .set({ deletedAt: new Date() })
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
): Promise<{ sent: number; failed: number }> {
  return broadcastLocalizedPush(title, title, title, body, body, body, data);
}

/** Send localized push notification to all users - each user gets their preferred language */
export async function broadcastLocalizedPush(
  titleNl: string,
  titleEn: string,
  titleAr: string,
  bodyNl: string,
  bodyEn: string,
  bodyAr: string,
  data?: Record<string, unknown>,
): Promise<{ sent: number; failed: number }> {
  const db = await getDb();
  if (!db) return { sent: 0, failed: 0 };

  // Get all users with push tokens AND their language
  const usersWithTokens = await db
    .select({
      id: users.id,
      pushToken: sql<string>`pushToken`,
      language: users.language,
    })
    .from(users)
    .where(sql`pushToken IS NOT NULL AND pushToken != ''`);

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

/**
 * Get the partner (spouse) of a user by checking parent_child_links.
 * Two users are considered partners if they both have confirmed links to the same child.
 */
export async function getPartnerOfUser(
  userId: number,
): Promise<{ id: number; name: string | null; profileData: any } | null> {
  const db = await getDb();
  if (!db) return null;

  // 1. First check partnerships table (persists across reinstalls)
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

  if (partnershipRows.length > 0) {
    const p = partnershipRows[0];
    const partnerId = p.userId1 === userId ? p.userId2 : p.userId1;
    const partner = await db
      .select()
      .from(users)
      .where(and(eq(users.id, partnerId), isNull(users.deletedAt)))
      .limit(1);
    if (partner.length > 0) {
      return {
        id: partner[0].id,
        name: partner[0].name,
        profileData: partner[0].profileData,
      };
    }
  }

  // 2. Fallback: detect via shared children (legacy)
  const myLinks = await db
    .select()
    .from(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.parentId, userId),
        eq(parentChildLinks.confirmed, true),
      ),
    );
  if (myLinks.length === 0) return null;
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
        // Auto-create partnership record for persistence
        await createPartnership(userId, partnerId, userId, true);
        return {
          id: partner[0].id,
          name: partner[0].name,
          profileData: partner[0].profileData,
        };
      }
    }
  }
  return null;
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
  if (existing.length > 0) return existing[0];
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
  return {
    id: result.insertId,
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

export async function confirmPartnershipRequest(
  partnershipId: number,
  recipientId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
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
  return Number((result as any)?.[0]?.affectedRows ?? 0) === 1;
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
  return Number((result as any)?.[0]?.affectedRows ?? 0) === 1;
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

/** Dissolve a partnership */
export async function dissolvePartnership(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(partnerships)
    .set({ status: "dissolved", dissolvedAt: new Date() })
    .where(
      and(
        or(eq(partnerships.userId1, userId), eq(partnerships.userId2, userId)),
        eq(partnerships.status, "active"),
      ),
    );
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
export async function getParentAiConsultationsByDevice(deviceId: string) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(parentAiConsultations)
    .where(eq(parentAiConsultations.deviceId, deviceId))
    .orderBy(desc(parentAiConsultations.updatedAt));
}

/**
 * A parent's consultations, keyed to their account when they have one.
 *
 * Every consultation was filed under deviceId alone with parentId hardcoded to
 * 0, so a reinstall or a new phone orphaned all of them: the rows stayed in the
 * table while the archive read empty. Daa3iyah had six he could not see
 * (2026-08-15), spread over two device ids.
 *
 * A signed-in caller gets their own rows plus any still-unclaimed ones from the
 * device in front of them, which is what lets the legacy rows come back without
 * a hand-run migration. Anonymous callers keep the old device-only behaviour.
 */
export async function getParentAiConsultationsForOwner(
  parentId: number,
  deviceId: string,
) {
  if (!parentId) return getParentAiConsultationsByDevice(deviceId);
  const database = await getDb();
  if (!database) return [];
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

