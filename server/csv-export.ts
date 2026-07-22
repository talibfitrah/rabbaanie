/**
 * CSV Export utility for admin panel.
 * Generates CSV data from database records.
 */
import * as db from "./db";

/** Escape a CSV field value */
function escapeCSV(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/** Convert array of objects to CSV string */
function toCSV(data: Record<string, any>[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => escapeCSV(c.label)).join(",");
  const rows = data.map((row) => columns.map((c) => escapeCSV(row[c.key])).join(","));
  return [header, ...rows].join("\r\n");
}

/** Export all users as CSV */
export async function exportUsersCSV(): Promise<string> {
  const users = await db.getAllUsers();
  const columns = [
    { key: "id", label: "ID" },
    { key: "publicId", label: "Public ID" },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "role", label: "Role" },
    { key: "language", label: "Language" },
    { key: "authMethod", label: "Auth Method" },
    { key: "onboardingCompleted", label: "Onboarding Completed" },
    { key: "lastActive", label: "Last Active" },
    { key: "createdAt", label: "Created At" },
    { key: "lastSignedIn", label: "Last Signed In" },
  ];
  return toCSV(users, columns);
}

/** Export all children as CSV */
export async function exportChildrenCSV(): Promise<string> {
  const children = await db.getAllChildrenDetailed();
  const columns = [
    { key: "id", label: "ID" },
    { key: "publicId", label: "Public ID" },
    { key: "name", label: "Name" },
    { key: "birthDate", label: "Birth Date" },
    { key: "gender", label: "Gender" },
    { key: "familyId", label: "Family ID" },
    { key: "createdAt", label: "Created At" },
  ];
  return toCSV(children, columns);
}

/** Export all families as CSV */
export async function exportFamiliesCSV(): Promise<string> {
  const families = await db.getAllFamiliesDetailed();
  const columns = [
    { key: "id", label: "ID" },
    { key: "name", label: "Family Name" },
    { key: "memberCount", label: "Members" },
    { key: "childCount", label: "Children" },
    { key: "createdAt", label: "Created At" },
  ];
  return toCSV(families, columns);
}

/** Export audit log as CSV */
export async function exportAuditLogCSV(limit: number = 500): Promise<string> {
  const { getAuditLog } = await import("./audit");
  const logs = await getAuditLog(limit);
  const columns = [
    { key: "id", label: "ID" },
    { key: "userName", label: "User" },
    { key: "userRole", label: "Role" },
    { key: "action", label: "Action" },
    { key: "entityType", label: "Entity Type" },
    { key: "entityId", label: "Entity ID" },
    { key: "description", label: "Description" },
    { key: "ipAddress", label: "IP Address" },
    { key: "createdAt", label: "Timestamp" },
  ];
  return toCSV(logs, columns);
}
