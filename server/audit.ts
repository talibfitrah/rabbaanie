import { getDb } from "./db";
import { auditLog } from "../drizzle/schema";
import { desc, eq, and, gte } from "drizzle-orm";

export type AuditAction =
  | "login"
  | "logout"
  | "create_user"
  | "update_user"
  | "delete_user"
  | "role_change"
  | "create_family"
  | "delete_family"
  | "create_child"
  | "delete_child"
  | "update_content"
  | "delete_content"
  | "send_broadcast"
  | "send_notification"
  | "update_settings"
  | "export_data"
  | "enable_2fa"
  | "disable_2fa"
  | "verify_2fa"
  | "push_test"
  | "add_network_contact"
  | "delete_network_contact"
  | "function_change";

export interface LogAuditParams {
  userId: number;
  userName?: string;
  userRole?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: number;
  description: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

/** Log an admin action to the audit trail */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(auditLog).values({
      userId: params.userId,
      userName: params.userName || null,
      userRole: params.userRole || null,
      action: params.action,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      description: params.description,
      metadata: params.metadata || null,
      ipAddress: params.ipAddress || null,
    });
  } catch (error) {
    console.warn("[Audit] Failed to log:", error);
  }
}

/** Get recent audit log entries */
export async function getAuditLog(limit: number = 50): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}

/** Get audit log for a specific user */
export async function getAuditLogByUser(userId: number, limit: number = 50): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLog).where(eq(auditLog.userId, userId)).orderBy(desc(auditLog.createdAt)).limit(limit);
}

/** Get audit log for a specific time range */
export async function getAuditLogSince(since: Date, limit: number = 200): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLog).where(gte(auditLog.createdAt, since)).orderBy(desc(auditLog.createdAt)).limit(limit);
}
