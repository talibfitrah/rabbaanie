import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean } from "drizzle-orm/mysql-core";

// ============================================================
// 1. USERS TABLE (existing, extended with profile fields)
// ============================================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  /** Public visible ID: format UXXXX-YYYYMMDD (volgnummer + geboortedatum) */
  publicId: varchar("publicId", { length: 32 }).unique(),
  /** User's birth date for ID generation */
  birthDate: varchar("birthDate", { length: 10 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "super_admin", "moderator", "specialist", "teacher", "kennisdrager", "doctor"]).default("user").notNull(),
  /** User's preferred language: nl, en, ar */
  language: varchar("language", { length: 5 }).default("nl"),
  /** Profile data (parent profile JSON) */
  profileData: json("profileData"),
  /** Whether onboarding is completed */
  onboardingCompleted: boolean("onboardingCompleted").default(false),
  /** Password hash for email/password auth */
  passwordHash: varchar("password_hash", { length: 255 }),
  /** Auth method: 'oauth' or 'email' */
  authMethod: varchar("auth_method", { length: 32 }).default("oauth"),
  /** Expo push token for push notifications */
  pushToken: varchar("pushToken", { length: 255 }),
  /** Last active timestamp for inactivity tracking */
  lastActive: timestamp("lastActive").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** Gender: male, female */
  gender: varchar("gender", { length: 10 }),
  /** Marital status: single_male, single_female, married_with_children, married_no_children, divorced_with_children, divorced_no_children, widowed_with_children, widowed_no_children */
  maritalStatus: varchar("maritalStatus", { length: 32 }),
  /** Whether user has children */
  hasChildren: boolean("hasChildren"),
  /** Previous methodology before adopting Quran & Sunnah */
  previousMethodology: varchar("previousMethodology", { length: 64 }),
  /** Soft delete: when set, user is considered deleted but data is preserved */
  deletedAt: timestamp("deletedAt"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// 2. FAMILIES - Multi-user shared family unit
// ============================================================
export const families = mysqlTable("families", {
  id: int("id").autoincrement().primaryKey(),
  /** Family name (e.g. "Familie Ahmed") */
  name: varchar("name", { length: 255 }).notNull(),
  /** Invite code for joining the family */
  inviteCode: varchar("inviteCode", { length: 32 }).notNull().unique(),
  /** Creator of the family */
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Family = typeof families.$inferSelect;
export type InsertFamily = typeof families.$inferInsert;

// ============================================================
// 3. FAMILY MEMBERS - Roles within a family
// ============================================================
export const familyMembers = mysqlTable("family_members", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  userId: int("userId").notNull(),
  /** Role: vader, moeder, leraar, specialist, familielid */
  role: varchar("role", { length: 32 }).notNull().default("familielid"),
  /** Display name within the family context */
  displayName: varchar("displayName", { length: 128 }),
  /** Permissions JSON: { canEditChildren, canViewAdvice, canMessage, canManageGoals } */
  permissions: json("permissions"),
  /** Whether this member has accepted the invitation */
  accepted: boolean("accepted").default(false),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type FamilyMember = typeof familyMembers.$inferSelect;
export type InsertFamilyMember = typeof familyMembers.$inferInsert;

// ============================================================
// 4. CHILDREN - Shared child profiles within a family
// ============================================================
export const children = mysqlTable("children", {
  id: int("id").autoincrement().primaryKey(),
  /** Public visible ID: format KXXXX-YYYYMMDD (volgnummer + geboortedatum) */
  publicId: varchar("publicId", { length: 32 }).unique(),
  familyId: int("familyId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  birthDate: varchar("birthDate", { length: 10 }), // YYYY-MM-DD
  gender: varchar("gender", { length: 16 }),
  /** Full environment/profile data (JSON) */
  profileData: json("profileData"),
  /** Environment data (JSON) */
  environmentData: json("environmentData"),
  /** Whether profile is completed */
  profileCompleted: boolean("profileCompleted").default(false),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  /** Soft delete: when set, child is considered deleted but data is preserved */
  deletedAt: timestamp("deletedAt"),
});

export type Child = typeof children.$inferSelect;
export type InsertChild = typeof children.$inferInsert;

// ============================================================
// 5. CHILD OBSERVATIONS - Notes/observations by family members
// ============================================================
export const childObservations = mysqlTable("child_observations", {
  id: int("id").autoincrement().primaryKey(),
  childId: int("childId").notNull(),
  authorId: int("authorId").notNull(),
  /** Category: behavior, mood, milestone, concern, prayer, achievement, health */
  category: varchar("category", { length: 32 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  /** Severity: low, medium, high */
  severity: varchar("severity", { length: 16 }).default("medium"),
  /** Tags (JSON array) */
  tags: json("tags"),
  /** Whether addressed/resolved */
  addressed: boolean("addressed").default(false),
  observedAt: timestamp("observedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChildObservation = typeof childObservations.$inferSelect;
export type InsertChildObservation = typeof childObservations.$inferInsert;

// ============================================================
// 6. MESSAGES - In-app communication between family members
// ============================================================
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  senderId: int("senderId").notNull(),
  /** Recipient: null = broadcast to all family members */
  recipientId: int("recipientId"),
  /** Optional: related child */
  childId: int("childId"),
  /** Message type: text, advice, alert, system */
  type: varchar("type", { length: 32 }).notNull().default("text"),
  subject: varchar("subject", { length: 255 }),
  content: text("content").notNull(),
  /** Whether read by recipient */
  isRead: boolean("isRead").default(false),
  /** Timestamp when message was read */
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ============================================================
// 7. WEEKLY GOALS PROGRESS - Track goal completion per child
// ============================================================
export const goalProgress = mysqlTable("goal_progress", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  childId: int("childId").notNull(),
  /** Week identifier: YYYY-Wnn */
  weekId: varchar("weekId", { length: 10 }).notNull(),
  /** Goal ID from weekly_advice.json */
  goalId: varchar("goalId", { length: 64 }).notNull(),
  /** Status: pending, in_progress, completed, skipped */
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  /** Notes from parent/teacher */
  notes: text("notes"),
  /** Who marked it */
  markedBy: int("markedBy"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GoalProgress = typeof goalProgress.$inferSelect;
export type InsertGoalProgress = typeof goalProgress.$inferInsert;

// ============================================================
// 8. CONTENT - CMS for managing advice, goals, articles
// ============================================================
export const content = mysqlTable("content", {
  id: int("id").autoincrement().primaryKey(),
  /** Content type: weekly_goal, article, tip, hadith, concept */
  type: varchar("type", { length: 32 }).notNull(),
  /** Category: tasfiya, tazkiya, tarbiya, aqeedah, ibadah, akhlaq */
  category: varchar("category", { length: 32 }),
  /** Sub-category for finer classification */
  subCategory: varchar("subCategory", { length: 64 }),
  /** Target age range: 0-3, 3-5, 5-7, 7-10, 10-12, 12-16, 16+ */
  ageRange: varchar("ageRange", { length: 16 }),
  /** Title in Dutch */
  titleNl: varchar("titleNl", { length: 500 }),
  /** Title in English */
  titleEn: varchar("titleEn", { length: 500 }),
  /** Title in Arabic */
  titleAr: varchar("titleAr", { length: 500 }),
  /** Content body in Dutch */
  contentNl: text("contentNl"),
  /** Content body in English */
  contentEn: text("contentEn"),
  /** Content body in Arabic */
  contentAr: text("contentAr"),
  /** Source/hadith reference */
  source: text("source"),
  sourceEn: text("sourceEn"),
  sourceAr: text("sourceAr"),
  /** Tags (JSON array) */
  tags: json("tags"),
  /** URL slug for the article */
  slug: varchar("slug", { length: 255 }),
  /** Short excerpt/summary */
  excerpt: text("excerpt"),
  /** Whether published */
  published: boolean("published").default(true),
  /** Sort order */
  sortOrder: int("sortOrder").default(0),
  /** Author/editor */
  authorId: int("authorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Content = typeof content.$inferSelect;
export type InsertContent = typeof content.$inferInsert;

// ============================================================
// 9. NEWSLETTERS - Interactive newsletter system
// ============================================================
export const newsletters = mysqlTable("newsletters", {
  id: int("id").autoincrement().primaryKey(),
  /** Title */
  titleNl: varchar("titleNl", { length: 255 }),
  titleEn: varchar("titleEn", { length: 255 }),
  titleAr: varchar("titleAr", { length: 255 }),
  /** Content body (Markdown) */
  contentNl: text("contentNl"),
  contentEn: text("contentEn"),
  contentAr: text("contentAr"),
  /** Interactive elements (JSON: polls, quizzes, links) */
  interactiveElements: json("interactiveElements"),
  /** Target audience: all, parents, teachers, specialists */
  audience: varchar("audience", { length: 32 }).default("all"),
  /** Status: draft, scheduled, sent */
  status: varchar("status", { length: 16 }).default("draft"),
  /** Scheduled send date */
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Newsletter = typeof newsletters.$inferSelect;
export type InsertNewsletter = typeof newsletters.$inferInsert;

// ============================================================
// 10. NEWSLETTER SUBSCRIBERS
// ============================================================
export const newsletterSubscribers = mysqlTable("newsletter_subscribers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 128 }),
  language: varchar("language", { length: 5 }).default("nl"),
  /** Whether subscribed */
  active: boolean("active").default(true),
  subscribedAt: timestamp("subscribedAt").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribedAt"),
});

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type InsertNewsletterSubscriber = typeof newsletterSubscribers.$inferInsert;

// ============================================================
// 11. NEWSLETTER INTERACTIONS - Track poll answers, quiz results
// ============================================================
export const newsletterInteractions = mysqlTable("newsletter_interactions", {
  id: int("id").autoincrement().primaryKey(),
  newsletterId: int("newsletterId").notNull(),
  subscriberId: int("subscriberId").notNull(),
  /** Interaction type: opened, poll_answer, quiz_result, link_click */
  type: varchar("type", { length: 32 }).notNull(),
  /** Interaction data (JSON) */
  data: json("data"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NewsletterInteraction = typeof newsletterInteractions.$inferSelect;
export type InsertNewsletterInteraction = typeof newsletterInteractions.$inferInsert;

// ============================================================
// 12. ADMIN STATISTICS - Aggregated stats for dashboard
// ============================================================
export const adminStats = mysqlTable("admin_stats", {
  id: int("id").autoincrement().primaryKey(),
  /** Stat type: daily_active, weekly_active, new_users, goals_completed, etc. */
  type: varchar("type", { length: 32 }).notNull(),
  /** Date for this stat */
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  /** Numeric value */
  value: int("value").notNull().default(0),
  /** Additional metadata (JSON) */
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminStat = typeof adminStats.$inferSelect;
export type InsertAdminStat = typeof adminStats.$inferInsert;

// ============================================================
// 13. AI CONVERSATIONS (moved from ai-schema.ts)
// ============================================================
export const aiConversations = mysqlTable("ai_conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  childId: varchar("childId", { length: 64 }),
  type: varchar("type", { length: 32 }).notNull().default("freeform"),
  title: varchar("title", { length: 255 }),
  language: varchar("language", { length: 5 }).default("nl"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AIConversation = typeof aiConversations.$inferSelect;
export type InsertAIConversation = typeof aiConversations.$inferInsert;

// ============================================================
// 14. AI MESSAGES
// ============================================================
export const aiMessages = mysqlTable("ai_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull(),
  provider: varchar("provider", { length: 16 }),
  model: varchar("model", { length: 64 }),
  tokensUsed: int("tokensUsed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AIMessage = typeof aiMessages.$inferSelect;
export type InsertAIMessage = typeof aiMessages.$inferInsert;

// ============================================================
// 15. TREATMENT PLANS - Specialist-managed treatment plans
// ============================================================
export const treatmentPlans = mysqlTable("treatment_plans", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  childId: int("childId").notNull(),
  /** Specialist who created/manages this plan */
  specialistId: int("specialistId").notNull(),
  /** Title of the treatment plan */
  title: varchar("title", { length: 255 }).notNull(),
  /** Description of the issue/concern */
  issueDescription: text("issueDescription"),
  /** The treatment plan content */
  planContent: text("planContent"),
  /** Status: active, paused, completed, archived */
  status: varchar("status", { length: 16 }).notNull().default("active"),
  /** Priority: low, medium, high, urgent */
  priority: varchar("priority", { length: 16 }).default("medium"),
  /** Category: behavior, emotional, social, academic, faith, health */
  category: varchar("category", { length: 32 }),
  /** Goals (JSON array of goal objects) */
  goals: json("goals"),
  /** Start date */
  startDate: varchar("startDate", { length: 10 }),
  /** Target end date */
  targetEndDate: varchar("targetEndDate", { length: 10 }),
  /** Actual end date */
  completedDate: varchar("completedDate", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TreatmentPlan = typeof treatmentPlans.$inferSelect;
export type InsertTreatmentPlan = typeof treatmentPlans.$inferInsert;

// ============================================================
// 16. SPECIALIST NOTES - Feedback and guidance on treatment plans
// ============================================================
export const specialistNotes = mysqlTable("specialist_notes", {
  id: int("id").autoincrement().primaryKey(),
  treatmentPlanId: int("treatmentPlanId").notNull(),
  /** Author (specialist or family member) */
  authorId: int("authorId").notNull(),
  /** Note type: progress, feedback, guidance, observation, milestone, concern */
  type: varchar("type", { length: 32 }).notNull().default("feedback"),
  /** Note content */
  content: text("content").notNull(),
  /** Whether this note is visible to parents */
  visibleToParents: boolean("visibleToParents").default(true),
  /** Whether this note is pinned/important */
  pinned: boolean("pinned").default(false),
  /** Attachments (JSON array of URLs) */
  attachments: json("attachments"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SpecialistNote = typeof specialistNotes.$inferSelect;
export type InsertSpecialistNote = typeof specialistNotes.$inferInsert;

// ============================================================
// 17. SPECIALIST ASSIGNMENTS - Link specialists to families
// ============================================================
export const specialistAssignments = mysqlTable("specialist_assignments", {
  id: int("id").autoincrement().primaryKey(),
  specialistId: int("specialistId").notNull(),
  familyId: int("familyId").notNull(),
  /** Status: pending, active, completed, declined */
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  /** Specialist's area of expertise */
  expertise: varchar("expertise", { length: 128 }),
  /** Notes about the assignment */
  assignmentNotes: text("assignmentNotes"),
  /** Who assigned (admin or family request) */
  assignedBy: int("assignedBy"),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  acceptedAt: timestamp("acceptedAt"),
});

export type SpecialistAssignment = typeof specialistAssignments.$inferSelect;
export type InsertSpecialistAssignment = typeof specialistAssignments.$inferInsert;

// ============================================================
// 18. AUTHORS - Expert profiles for blog/articles
// ============================================================
export const authors = mysqlTable("authors", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  nameNl: varchar("nameNl", { length: 128 }),
  nameEn: varchar("nameEn", { length: 128 }),
  nameAr: varchar("nameAr", { length: 128 }),
  slug: varchar("slug", { length: 128 }),
  bioNl: text("bioNl"),
  bioEn: text("bioEn"),
  bioAr: text("bioAr"),
  roleNl: varchar("roleNl", { length: 128 }),
  roleEn: varchar("roleEn", { length: 128 }),
  roleAr: varchar("roleAr", { length: 128 }),
  expertise: json("expertise"),
  avatarUrl: varchar("avatarUrl", { length: 500 }),
  socialLinks: json("socialLinks"),
  articleCount: int("articleCount").default(0),
  featured: boolean("featured").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Author = typeof authors.$inferSelect;
export type InsertAuthor = typeof authors.$inferInsert;

// ============================================================
// 19. PARENT-CHILD LINKS - Support blended families
// Links a parent (user) directly to a child, independent of family unit
// ============================================================
export const parentChildLinks = mysqlTable("parent_child_links", {
  id: int("id").autoincrement().primaryKey(),
  /** Parent user ID */
  parentId: int("parentId").notNull(),
  /** Child ID */
  childId: int("childId").notNull(),
  /** Relationship: biological_father, biological_mother, stepfather, stepmother, guardian */
  relationship: varchar("relationship", { length: 32 }).notNull().default("parent"),
  /** Whether this parent has edit permissions for this child */
  canEdit: boolean("canEdit").default(true),
  /** Whether this link is confirmed by both parties */
  confirmed: boolean("confirmed").default(false),
  /** Who created this link */
  createdBy: int("createdBy").notNull(),
  linkedAt: timestamp("linkedAt").defaultNow().notNull(),
});

export type ParentChildLink = typeof parentChildLinks.$inferSelect;
export type InsertParentChildLink = typeof parentChildLinks.$inferInsert;


// ============================================================
// 20. SPECIALIST PROFILES - Location, availability, and contact info
// ============================================================
export const specialistProfiles = mysqlTable("specialist_profiles", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (must have role=specialist) */
  userId: int("userId").notNull().unique(),
  /** Display name */
  displayName: varchar("displayName", { length: 128 }),
  /** Bio / introduction */
  bio: text("bio"),
  /** Expertise areas (JSON array: ["tarbiyah", "behavior", "quran", "family"]) */
  expertise: json("expertise"),
  /** Languages spoken (JSON array: ["nl", "ar", "en"]) */
  languages: json("languages"),
  /** Country */
  country: varchar("country", { length: 64 }),
  /** Country ISO code */
  countryIso: varchar("countryIso", { length: 5 }),
  /** City */
  city: varchar("city", { length: 128 }),
  /** Latitude */
  lat: varchar("lat", { length: 20 }),
  /** Longitude */
  lon: varchar("lon", { length: 20 }),
  /** Phone number (for fallback contact) */
  phone: varchar("phone", { length: 32 }),
  /** Whether currently accepting new clients */
  isAvailable: boolean("isAvailable").default(true),
  /** Maximum number of active families */
  maxFamilies: int("maxFamilies").default(10),
  /** Current active family count (cached) */
  activeFamilyCount: int("activeFamilyCount").default(0),
  /** Rating (1-5, cached average) */
  rating: varchar("rating", { length: 5 }),
  /** Total ratings count */
  ratingCount: int("ratingCount").default(0),
  /** Whether profile is verified by admin */
  verified: boolean("verified").default(false),
  /** Online status */
  lastOnline: timestamp("lastOnline"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SpecialistProfile = typeof specialistProfiles.$inferSelect;
export type InsertSpecialistProfile = typeof specialistProfiles.$inferInsert;

/** Invitation codes for specialist registration */
export const invitationCodes = mysqlTable("invitation_codes", {
  id: int("id").autoincrement().primaryKey(),
  /** The unique invitation code */
  code: varchar("code", { length: 32 }).notNull().unique(),
  /** Who created this code (admin user ID) */
  createdBy: int("createdBy"),
  /** Who used this code (specialist user ID, null if unused) */
  usedBy: int("usedBy"),
  /** Whether the code has been used */
  isUsed: boolean("isUsed").default(false),
  /** Optional: restrict to specific email */
  restrictedEmail: varchar("restrictedEmail", { length: 255 }),
  /** Expiry date (null = never expires) */
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  usedAt: timestamp("usedAt"),
});

export type InvitationCode = typeof invitationCodes.$inferSelect;
export type InsertInvitationCode = typeof invitationCodes.$inferInsert;


// ============================================================
// AUDIT LOG - Track all admin actions
// ============================================================
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  /** User who performed the action */
  userId: int("userId").notNull(),
  /** User's name at time of action */
  userName: varchar("userName", { length: 255 }),
  /** User's role at time of action */
  userRole: varchar("userRole", { length: 32 }),
  /** Action type: create, update, delete, login, role_change, export, broadcast, settings */
  action: varchar("action", { length: 64 }).notNull(),
  /** Entity type: user, family, child, content, message, notification, settings */
  entityType: varchar("entityType", { length: 64 }),
  /** Entity ID affected */
  entityId: int("entityId"),
  /** Human-readable description */
  description: text("description"),
  /** Additional metadata (JSON) */
  metadata: json("metadata"),
  /** IP address */
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

// ============================================================
// ADMIN 2FA - TOTP secrets for admin accounts
// ============================================================
export const admin2fa = mysqlTable("admin_2fa", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  /** TOTP secret (base32 encoded) */
  secret: varchar("secret", { length: 128 }).notNull(),
  /** Whether 2FA is verified and active */
  verified: boolean("verified").default(false).notNull(),
  /** Backup codes (JSON array of hashed codes) */
  backupCodes: json("backupCodes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Admin2FA = typeof admin2fa.$inferSelect;
export type InsertAdmin2FA = typeof admin2fa.$inferInsert;

// ============================================================
// NETWORK CONTACTS - Specialists, Teachers, Scholars, Doctors
// ============================================================
export const networkContacts = mysqlTable("network_contacts", {
  id: int("id").autoincrement().primaryKey(),
  /** Category: specialist, teacher, kennisdrager, doctor */
  category: mysqlEnum("category", ["specialist", "teacher", "kennisdrager", "doctor"]).notNull(),
  /** Full name */
  name: varchar("name", { length: 128 }).notNull(),
  /** Email address */
  email: varchar("email", { length: 320 }),
  /** Phone number */
  phone: varchar("phone", { length: 32 }),
  /** Specialization / expertise */
  specialization: varchar("specialization", { length: 255 }),
  /** City */
  city: varchar("city", { length: 128 }),
  /** Country */
  country: varchar("country", { length: 64 }),
  /** Bio / description */
  bio: text("bio"),
  /** Languages spoken (JSON array) */
  languages: json("languages"),
  /** Whether currently available */
  isAvailable: boolean("isAvailable").default(true),
  /** Linked user ID (if they have an account) */
  userId: int("userId"),
  /** Added by admin ID */
  addedBy: int("addedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NetworkContact = typeof networkContacts.$inferSelect;
export type InsertNetworkContact = typeof networkContacts.$inferInsert;

// ============================================================
// USER AUTHORIZATION ROLES (what a user is allowed to do in the system)
// A user can have multiple authorization roles simultaneously
// ============================================================
export const userAuthorizationRoles = mysqlTable("user_authorization_roles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Authorization role: determines system permissions */
  role: mysqlEnum("role", ["super_admin", "admin", "moderator", "user"]).notNull(),
  /** Who assigned this role */
  assignedBy: int("assignedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserAuthorizationRole = typeof userAuthorizationRoles.$inferSelect;
export type InsertUserAuthorizationRole = typeof userAuthorizationRoles.$inferInsert;

// ============================================================
// USER FUNCTIONS (what a user does in practice - their professional role)
// A user can have multiple functions simultaneously
// ============================================================
export const userFunctions = mysqlTable("user_functions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Functional role: what the user does in practice */
  functionRole: mysqlEnum("functionRole", ["vader", "moeder", "specialist", "leraar", "kennisdrager", "arts", "imam", "therapeut", "maatschappelijk_werker", "opvoedkundige_begeleider"]).notNull(),
  /** Optional specialization details */
  specialization: varchar("specialization", { length: 255 }),
  /** City where they practice */
  city: varchar("city", { length: 128 }),
  /** Whether currently active in this function */
  isActive: boolean("isActive").default(true),
  /** Who assigned this function */
  assignedBy: int("assignedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserFunction = typeof userFunctions.$inferSelect;
export type InsertUserFunction = typeof userFunctions.$inferInsert;

// ============================================================
// CONTENT MANAGEMENT SYSTEM (CMS)
// Full CMS with multi-language support, categories, file uploads
// ============================================================

export const contentCategories = mysqlTable("content_categories", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  nameNl: varchar("nameNl", { length: 255 }).notNull(),
  nameEn: varchar("nameEn", { length: 255 }).notNull(),
  nameAr: varchar("nameAr", { length: 255 }).notNull(),
  /** Where this content appears in the app: fitrah, weekprogramma, tips, begrippen, behandelingen, general */
  appSection: mysqlEnum("appSection", ["fitrah", "weekprogramma", "tips", "begrippen", "behandelingen", "general"]).default("general"),
  /** Optional: age group for fitrah content */
  ageGroup: varchar("ageGroup", { length: 50 }),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const contentItems = mysqlTable("content_items", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId"),
  /** Content type: article, video, audio, tip, fatwa */
  contentType: mysqlEnum("contentType", ["article", "video", "audio", "tip", "fatwa"]).notNull(),
  /** Status: draft or published */
  status: mysqlEnum("status", ["draft", "published"]).default("draft").notNull(),
  /** Original language the content was written in */
  originalLanguage: mysqlEnum("originalLanguage", ["nl", "en", "ar"]).default("nl").notNull(),
  /** Tags as JSON array */
  tags: text("tags"),
  /** Author/creator user ID */
  authorId: int("authorId"),
  /** For video/audio: external URL */
  mediaUrl: varchar("mediaUrl", { length: 1024 }),
  /** Sort order within category */
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  publishedAt: timestamp("publishedAt"),
});

export const contentTranslations = mysqlTable("content_translations", {
  id: int("id").autoincrement().primaryKey(),
  contentId: int("contentId").notNull(),
  language: mysqlEnum("language", ["nl", "en", "ar"]).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  /** Short summary/excerpt */
  summary: text("summary"),
  /** Full body content (rich text / HTML) */
  body: text("body"),
  /** Whether this translation was auto-generated by LLM */
  isAutoTranslated: boolean("isAutoTranslated").default(false),
  /** Whether manually reviewed after auto-translation */
  isReviewed: boolean("isReviewed").default(false),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const contentFiles = mysqlTable("content_files", {
  id: int("id").autoincrement().primaryKey(),
  contentId: int("contentId").notNull(),
  /** Original filename */
  fileName: varchar("fileName", { length: 500 }).notNull(),
  /** File type: word, pdf, excel, image, other */
  fileType: mysqlEnum("fileType", ["word", "pdf", "excel", "image", "other"]).notNull(),
  /** Storage path or URL */
  filePath: varchar("filePath", { length: 1024 }).notNull(),
  /** File size in bytes */
  fileSize: int("fileSize"),
  /** Language of the file */
  language: mysqlEnum("language", ["nl", "en", "ar"]).default("nl"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});

// ============================================================
// INVITATION CODES PER FUNCTION
// Allows creating codes that auto-assign specific functions
// ============================================================

export const functionInvitationCodes = mysqlTable("function_invitation_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  /** Which function this code assigns */
  functionRole: mysqlEnum("functionRole", ["vader", "moeder", "specialist", "leraar", "kennisdrager", "arts", "imam", "therapeut", "maatschappelijk_werker", "opvoedkundige_begeleider"]).notNull(),
  /** Optional: restrict to specific email */
  restrictedEmail: varchar("restrictedEmail", { length: 255 }),
  /** Max number of uses (null = unlimited) */
  maxUses: int("maxUses"),
  /** Current number of uses */
  usedCount: int("usedCount").default(0).notNull(),
  /** Whether the code is still active */
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
});

export type ContentCategory = typeof contentCategories.$inferSelect;
export type InsertContentCategory = typeof contentCategories.$inferInsert;
export type ContentItem = typeof contentItems.$inferSelect;
export type InsertContentItem = typeof contentItems.$inferInsert;
export type ContentTranslation = typeof contentTranslations.$inferSelect;
export type InsertContentTranslation = typeof contentTranslations.$inferInsert;
export type ContentFile = typeof contentFiles.$inferSelect;
export type InsertContentFile = typeof contentFiles.$inferInsert;
export type FunctionInvitationCode = typeof functionInvitationCodes.$inferSelect;
export type InsertFunctionInvitationCode = typeof functionInvitationCodes.$inferInsert;

// ============================================================
// SPOUSE ADVICE - AI-generated advice between spouses
// ============================================================
export const spouseAdvice = mysqlTable("spouse_advice", {
  id: int("id").autoincrement().primaryKey(),
  /** The user who receives this advice (about their spouse) */
  recipientId: int("recipientId").notNull(),
  /** The spouse this advice is about */
  aboutSpouseId: int("aboutSpouseId").notNull(),
  /** Advice content (generated by AI) */
  content: text("content").notNull(),
  /** Category: communication, parenting, faith, emotional, practical */
  category: varchar("category", { length: 32 }).notNull().default("general"),
  /** Data sources used: questionnaire, weekly_interaction, consultant, daily_analysis */
  basedOn: json("basedOn"),
  /** Whether the recipient has read this advice */
  isRead: boolean("isRead").default(false),
  /** Whether the recipient found this advice helpful */
  isHelpful: boolean("isHelpful"),
  /** Week identifier when generated */
  weekId: varchar("weekId", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SpouseAdvice = typeof spouseAdvice.$inferSelect;
export type InsertSpouseAdvice = typeof spouseAdvice.$inferInsert;

// ============================================================
// TRANSLATION CACHE - Persistent translation cache shared across all users
// ============================================================
export const translationCache = mysqlTable("translation_cache", {
  id: int("id").autoincrement().primaryKey(),
  /** Hash of source text (SHA-256 first 64 chars) for fast lookup */
  sourceHash: varchar("sourceHash", { length: 64 }).notNull(),
  /** Target language */
  targetLang: mysqlEnum("targetLang", ["nl", "en"]).notNull(),
  /** Original source text (Arabic) */
  sourceText: text("sourceText").notNull(),
  /** Translated text */
  translatedText: text("translatedText").notNull(),
  /** Context category: names_of_allah, mindsets, library, general */
  category: varchar("category", { length: 50 }).default("general"),
  /** Number of times this translation was served from cache */
  hitCount: int("hitCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TranslationCache = typeof translationCache.$inferSelect;
export type InsertTranslationCache = typeof translationCache.$inferInsert;

// ============================================================
// PARTNERSHIPS - Direct partner links (persists across app reinstalls)
// ============================================================
export const partnerships = mysqlTable("partnerships", {
  id: int("id").autoincrement().primaryKey(),
  /** First user in the partnership */
  userId1: int("userId1").notNull(),
  /** Second user in the partnership */
  userId2: int("userId2").notNull(),
  /** Status: active, dissolved */
  status: varchar("status", { length: 16 }).notNull().default("active"),
  /** Who initiated the link */
  initiatedBy: int("initiatedBy").notNull(),
  /** Whether the partner confirmed */
  confirmed: boolean("confirmed").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  dissolvedAt: timestamp("dissolvedAt"),
});

export type Partnership = typeof partnerships.$inferSelect;
export type InsertPartnership = typeof partnerships.$inferInsert;


// ============================================================
// CHILD ACCOUNTS - Login accounts for children aged 12+
// ============================================================
export const childAccounts = mysqlTable("child_accounts", {
  id: int("id").autoincrement().primaryKey(),
  /** The user record for this child (created on account creation) */
  userId: int("userId").notNull(),
  /** Parent who created this account */
  parentId: int("parentId").notNull(),
  /** Link to child profile in children table */
  childProfileId: int("childProfileId"),
  /** Age group: 12-14, 15-17, 18+ */
  ageGroup: varchar("ageGroup", { length: 8 }).notNull(),
  /** Access code for child login (6-digit) */
  accessCode: varchar("accessCode", { length: 16 }).notNull(),
  /** Gender: male, female */
  gender: varchar("gender", { length: 10 }).notNull(),
  /** Child's preferred language */
  language: varchar("language", { length: 5 }).default("ar"),
  /** Whether parent can see advisor conversations */
  parentCanSeeAdvisor: boolean("parentCanSeeAdvisor").default(true),
  /** Screen time limit in minutes (0 = unlimited) */
  screenTimeLimit: int("screenTimeLimit").default(0),
  /** Last active timestamp */
  lastActive: timestamp("lastActive"),
  /** Whether account is active */
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChildAccount = typeof childAccounts.$inferSelect;
export type InsertChildAccount = typeof childAccounts.$inferInsert;

// ============================================================
// ENVIRONMENT ANALYSIS - Auto-generated from conversations & plans
// ============================================================
export const environmentAnalysis = mysqlTable("environment_analysis", {
  id: int("id").autoincrement().primaryKey(),
  /** User who owns this analysis */
  userId: int("userId").notNull(),
  /** Child this analysis is about (null = general family) */
  childId: int("childId"),
  /** Analysis data (JSON: strengths, weaknesses, risks, recommendations) */
  analysisData: json("analysisData"),
  /** Sources used: conversations, weekly_plans, observations, manual */
  sources: json("sources"),
  /** Whether auto-generated or manually edited */
  autoGenerated: boolean("autoGenerated").default(true),
  /** Version number (increments on update) */
  version: int("version").default(1),
  /** Last analysis date */
  analyzedAt: timestamp("analyzedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EnvironmentAnalysis = typeof environmentAnalysis.$inferSelect;
export type InsertEnvironmentAnalysis = typeof environmentAnalysis.$inferInsert;

// ============================================================
// NEIGHBORHOOD GROUPS - Local community groups
// ============================================================
export const neighborhoodGroups = mysqlTable("neighborhood_groups", {
  id: int("id").autoincrement().primaryKey(),
  /** Group name */
  name: varchar("name", { length: 255 }).notNull(),
  /** City */
  city: varchar("city", { length: 128 }),
  /** Country */
  country: varchar("country", { length: 64 }),
  /** Latitude center */
  lat: varchar("lat", { length: 20 }),
  /** Longitude center */
  lon: varchar("lon", { length: 20 }),
  /** Radius in km */
  radiusKm: int("radiusKm").default(5),
  /** Invite code for joining */
  inviteCode: varchar("inviteCode", { length: 32 }).notNull().unique(),
  /** Description */
  description: text("description"),
  /** Creator user ID */
  createdBy: int("createdBy").notNull(),
  /** Max members (0 = unlimited) */
  maxMembers: int("maxMembers").default(50),
  /** Whether group is active */
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NeighborhoodGroup = typeof neighborhoodGroups.$inferSelect;
export type InsertNeighborhoodGroup = typeof neighborhoodGroups.$inferInsert;

// ============================================================
// NEIGHBORHOOD MEMBERS
// ============================================================
export const neighborhoodMembers = mysqlTable("neighborhood_members", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  userId: int("userId").notNull(),
  /** Role: admin, member */
  role: varchar("role", { length: 16 }).default("member"),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type NeighborhoodMember = typeof neighborhoodMembers.$inferSelect;
export type InsertNeighborhoodMember = typeof neighborhoodMembers.$inferInsert;

// ============================================================
// NEIGHBORHOOD ACTIVITIES
// ============================================================
export const neighborhoodActivities = mysqlTable("neighborhood_activities", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  /** Title */
  title: varchar("title", { length: 255 }).notNull(),
  /** Description */
  description: text("description"),
  /** Activity type: lesson, children_activity, cooperation, social, prayer */
  activityType: varchar("activityType", { length: 32 }).notNull(),
  /** Date and time */
  scheduledAt: timestamp("scheduledAt"),
  /** Location description */
  location: varchar("location", { length: 255 }),
  /** Creator */
  createdBy: int("createdBy").notNull(),
  /** Status: proposed, confirmed, completed, cancelled */
  status: varchar("status", { length: 16 }).default("proposed"),
  /** Max participants (0 = unlimited) */
  maxParticipants: int("maxParticipants").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NeighborhoodActivity = typeof neighborhoodActivities.$inferSelect;
export type InsertNeighborhoodActivity = typeof neighborhoodActivities.$inferInsert;

// ============================================================
// CHILD ACTIVITY LOG - Track child app usage
// ============================================================
export const childActivityLog = mysqlTable("child_activity_log", {
  id: int("id").autoincrement().primaryKey(),
  /** Child account ID */
  childAccountId: int("childAccountId").notNull(),
  /** Activity type: app_open, advice_read, challenge_completed, advisor_question, emergency_pressed, wird_completed */
  activityType: varchar("activityType", { length: 32 }).notNull(),
  /** Additional data (JSON) */
  data: json("data"),
  /** Duration in seconds (for timed activities) */
  durationSeconds: int("durationSeconds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChildActivityLog = typeof childActivityLog.$inferSelect;
export type InsertChildActivityLog = typeof childActivityLog.$inferInsert;

// ============================================================
// CHILD ACHIEVEMENTS - Gamification for children
// ============================================================
export const childAchievements = mysqlTable("child_achievements", {
  id: int("id").autoincrement().primaryKey(),
  childAccountId: int("childAccountId").notNull(),
  /** Title */
  title: varchar("title", { length: 255 }).notNull(),
  /** Description */
  description: text("description"),
  /** Category: quran, prayer, fasting, helping, learning, challenge */
  category: varchar("category", { length: 32 }).notNull(),
  /** Icon name */
  icon: varchar("icon", { length: 64 }),
  earnedAt: timestamp("earnedAt").defaultNow().notNull(),
});

export type ChildAchievement = typeof childAchievements.$inferSelect;
export type InsertChildAchievement = typeof childAchievements.$inferInsert;

// ============================================================
// CHILD CHALLENGES - Daily/weekly challenges for children
// ============================================================
export const childChallenges = mysqlTable("child_challenges", {
  id: int("id").autoincrement().primaryKey(),
  childAccountId: int("childAccountId").notNull(),
  /** Challenge title */
  title: varchar("title", { length: 255 }).notNull(),
  /** Description */
  description: text("description"),
  /** Category: prayer, quran, akhlaq, family, learning, health */
  category: varchar("category", { length: 32 }).notNull(),
  /** Status: pending, completed, skipped */
  status: varchar("status", { length: 16 }).default("pending"),
  /** Challenge date */
  challengeDate: varchar("challengeDate", { length: 10 }).notNull(),
  /** Completed at */
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChildChallenge = typeof childChallenges.$inferSelect;
export type InsertChildChallenge = typeof childChallenges.$inferInsert;

// ============================================================
// PEER GROUPS - Groups for children of similar age
// ============================================================
export const peerGroups = mysqlTable("peer_groups", {
  id: int("id").autoincrement().primaryKey(),
  /** Group name */
  name: varchar("name", { length: 255 }).notNull(),
  /** Age range: 12-14, 15-17, 18+ */
  ageRange: varchar("ageRange", { length: 8 }).notNull(),
  /** Gender: male, female, mixed */
  gender: varchar("gender", { length: 10 }).notNull(),
  /** Invite code */
  inviteCode: varchar("inviteCode", { length: 32 }).notNull().unique(),
  /** Parent who created this group */
  createdBy: int("createdBy").notNull(),
  /** Whether parent approval is required for messages */
  parentApproval: boolean("parentApproval").default(true),
  /** Max members */
  maxMembers: int("maxMembers").default(20),
  /** Whether active */
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PeerGroup = typeof peerGroups.$inferSelect;
export type InsertPeerGroup = typeof peerGroups.$inferInsert;

// ============================================================
// PEER GROUP MEMBERS
// ============================================================
export const peerGroupMembers = mysqlTable("peer_group_members", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  childAccountId: int("childAccountId").notNull(),
  /** Parent who approved */
  approvedByParentId: int("approvedByParentId"),
  /** Whether approved */
  approved: boolean("approved").default(false),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type PeerGroupMember = typeof peerGroupMembers.$inferSelect;
export type InsertPeerGroupMember = typeof peerGroupMembers.$inferInsert;

// ============================================================
// SHARED CHILD UPDATES - Updates between divorced parents
// ============================================================
export const sharedChildUpdates = mysqlTable("shared_child_updates", {
  id: int("id").autoincrement().primaryKey(),
  /** Child ID */
  childId: int("childId").notNull(),
  /** Author (parent who wrote the update) */
  authorId: int("authorId").notNull(),
  /** Update type: daily_report, achievement, concern, wird, behavior, health */
  updateType: varchar("updateType", { length: 32 }).notNull(),
  /** Content */
  content: text("content").notNull(),
  /** Whether read by the other parent */
  isRead: boolean("isRead").default(false),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SharedChildUpdate = typeof sharedChildUpdates.$inferSelect;
export type InsertSharedChildUpdate = typeof sharedChildUpdates.$inferInsert;

// ============================================================
// FAMILY REMINDERS - Shared reminders within family
// ============================================================
export const familyReminders = mysqlTable("family_reminders", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  /** Creator */
  createdBy: int("createdBy").notNull(),
  /** Title */
  title: varchar("title", { length: 255 }).notNull(),
  /** Description */
  description: text("description"),
  /** Type: prayer, activity, meeting, other */
  reminderType: varchar("reminderType", { length: 32 }).notNull(),
  /** Scheduled time */
  scheduledAt: timestamp("scheduledAt"),
  /** Recurrence: none, daily, weekly, monthly */
  recurrence: varchar("recurrence", { length: 16 }).default("none"),
  /** Whether active */
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FamilyReminder = typeof familyReminders.$inferSelect;
export type InsertFamilyReminder = typeof familyReminders.$inferInsert;

// ============================================================
// FAMILY ACTIVITIES - Proposed activities with voting
// ============================================================
export const familyActivities = mysqlTable("family_activities", {
  id: int("id").autoincrement().primaryKey(),
  familyId: int("familyId").notNull(),
  /** Proposer */
  proposedBy: int("proposedBy").notNull(),
  /** Title */
  title: varchar("title", { length: 255 }).notNull(),
  /** Description */
  description: text("description"),
  /** Type: outing, lesson, game, worship, sport */
  activityType: varchar("activityType", { length: 32 }).notNull(),
  /** Proposed date */
  proposedDate: varchar("proposedDate", { length: 10 }),
  /** Status: proposed, voted, confirmed, completed, cancelled */
  status: varchar("status", { length: 16 }).default("proposed"),
  /** Votes (JSON: { userId: vote }) */
  votes: json("votes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FamilyActivity = typeof familyActivities.$inferSelect;
export type InsertFamilyActivity = typeof familyActivities.$inferInsert;

// ============================================================
// CHILD DAILY SUMMARY - Aggregated daily stats for parent monitoring
// ============================================================
export const childDailySummary = mysqlTable("child_daily_summary", {
  id: int("id").autoincrement().primaryKey(),
  childAccountId: int("childAccountId").notNull(),
  /** Date string YYYY-MM-DD */
  date: varchar("date", { length: 10 }).notNull(),
  /** Total app usage in seconds */
  totalAppUsageSeconds: int("totalAppUsageSeconds").default(0),
  /** Morning adhkar completed */
  morningAdhkarDone: boolean("morningAdhkarDone").default(false),
  /** Evening adhkar completed */
  eveningAdhkarDone: boolean("eveningAdhkarDone").default(false),
  /** Sleep adhkar completed */
  sleepAdhkarDone: boolean("sleepAdhkarDone").default(false),
  /** Waking adhkar completed */
  wakingAdhkarDone: boolean("wakingAdhkarDone").default(false),
  /** Number of custom tasks completed */
  customTasksCompleted: int("customTasksCompleted").default(0),
  /** Total custom tasks assigned */
  customTasksTotal: int("customTasksTotal").default(0),
  /** Number of challenges completed */
  challengesCompleted: int("challengesCompleted").default(0),
  /** Number of AI questions asked */
  aiQuestionsAsked: int("aiQuestionsAsked").default(0),
  /** Screens visited (JSON: { screenName: durationSeconds }) */
  screensVisited: json("screensVisited"),
  /** First app open time */
  firstOpenAt: varchar("firstOpenAt", { length: 8 }),
  /** Last app close time */
  lastCloseAt: varchar("lastCloseAt", { length: 8 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ChildDailySummary = typeof childDailySummary.$inferSelect;
export type InsertChildDailySummary = typeof childDailySummary.$inferInsert;
// ============================================================
// CUSTOM TASKS - Tasks assigned by parent to child
// ============================================================
export const customTasks = mysqlTable("custom_tasks", {
  id: int("id").autoincrement().primaryKey(),
  /** Parent who created the task */
  parentId: int("parentId").notNull(),
  /** Child account this task is for */
  childAccountId: int("childAccountId").notNull(),
  /** Task title */
  title: varchar("title", { length: 255 }).notNull(),
  /** Task description */
  description: text("description"),
  /** Category: prayer, quran, study, chores, sport, other */
  category: varchar("category", { length: 32 }).default("other"),
  /** Priority: low, medium, high */
  priority: varchar("priority", { length: 10 }).default("medium"),
  /** Due date (YYYY-MM-DD) */
  dueDate: varchar("dueDate", { length: 10 }),
  /** Recurrence: none, daily, weekly, monthly */
  recurrence: varchar("recurrence", { length: 16 }).default("none"),
  /** Status: pending, completed, skipped, overdue */
  status: varchar("status", { length: 16 }).default("pending"),
  /** Proof image URL (child uploads photo as proof) */
  proofImageUrl: text("proofImageUrl"),
  /** Child's note on completion */
  childNote: text("childNote"),
  /** Parent's feedback on completion */
  parentFeedback: text("parentFeedback"),
  /** Completed at */
  completedAt: timestamp("completedAt"),
  /** Whether parent verified completion */
  parentVerified: boolean("parentVerified").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomTask = typeof customTasks.$inferSelect;
export type InsertCustomTask = typeof customTasks.$inferInsert;
// ============================================================
// FAMILY CHAT MESSAGES - Direct chat between parent and child
// ============================================================
export const familyChatMessages = mysqlTable("family_chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  /** Parent user ID */
  parentId: int("parentId").notNull(),
  /** Child account ID */
  childAccountId: int("childAccountId").notNull(),
  /** Sender: 'parent' or 'child' */
  senderType: varchar("senderType", { length: 10 }).notNull(),
  /** Message content */
  content: text("content").notNull(),
  /** Message type: text, image, voice, task_update */
  messageType: varchar("messageType", { length: 16 }).default("text"),
  /** Attachment URL (for images/voice) */
  attachmentUrl: text("attachmentUrl"),
  /** Whether read by recipient */
  isRead: boolean("isRead").default(false),
  /** Read at timestamp */
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FamilyChatMessage = typeof familyChatMessages.$inferSelect;
export type InsertFamilyChatMessage = typeof familyChatMessages.$inferInsert;
// ============================================================
// CHILD AI CONVERSATIONS - Child's conversations with AI advisor
// ============================================================
export const childAiConversations = mysqlTable("child_ai_conversations", {
  id: int("id").autoincrement().primaryKey(),
  childAccountId: int("childAccountId").notNull(),
  /** Conversation title (auto-generated from first question) */
  title: varchar("title", { length: 255 }),
  /** Messages (JSON array: [{role, content, timestamp}]) */
  messages: json("messages"),
  /** Total messages in conversation */
  messageCount: int("messageCount").default(0),
  /** Whether parent has reviewed this conversation */
  parentReviewed: boolean("parentReviewed").default(false),
  /** Whether flagged for parent attention */
  flaggedForParent: boolean("flaggedForParent").default(false),
  /** Flag reason */
  flagReason: varchar("flagReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ChildAiConversation = typeof childAiConversations.$inferSelect;
export type InsertChildAiConversation = typeof childAiConversations.$inferInsert;
// ============================================================
// CHILD APP USAGE - Phone app usage tracking (Android)
// ============================================================
export const childAppUsage = mysqlTable("child_app_usage", {
  id: int("id").autoincrement().primaryKey(),
  childAccountId: int("childAccountId").notNull(),
  /** Date (YYYY-MM-DD) */
  date: varchar("date", { length: 10 }).notNull(),
  /** App package name (e.g., com.google.youtube) */
  packageName: varchar("packageName", { length: 255 }).notNull(),
  /** App display name */
  appName: varchar("appName", { length: 255 }),
  /** Usage duration in seconds */
  usageSeconds: int("usageSeconds").default(0),
  /** Category: social, games, education, video, other */
  category: varchar("category", { length: 32 }),
  /** Number of times opened */
  openCount: int("openCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ChildAppUsage = typeof childAppUsage.$inferSelect;
export type InsertChildAppUsage = typeof childAppUsage.$inferInsert;
// ============================================================
// PARENT AI CONSULTATIONS - Parent consulting AI about family members
// ============================================================
export const parentAiConsultations = mysqlTable("parent_ai_consultations", {
  id: int("id").autoincrement().primaryKey(),
  /** Parent user ID */
  parentId: int("parentId").notNull(),
  /** Consultation type: child, spouse */
  consultationType: varchar("consultationType", { length: 10 }).notNull(),
  /** Target: child profile ID or 'spouse' */
  targetId: varchar("targetId", { length: 32 }),
  /** Target name (for display) */
  targetName: varchar("targetName", { length: 128 }),
  /** Conversation title (first message snippet) */
  title: varchar("title", { length: 255 }),
  /** Language: ar, nl, en */
  language: varchar("language", { length: 5 }),
  /** Device ID for anonymous users */
  deviceId: varchar("deviceId", { length: 128 }),
  /** Messages (JSON array: [{role, content, timestamp}]) */
  messages: json("messages"),
  /** Total messages */
  messageCount: int("messageCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ParentAiConsultation = typeof parentAiConsultations.$inferSelect;
export type InsertParentAiConsultation = typeof parentAiConsultations.$inferInsert;
