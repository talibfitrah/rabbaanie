import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

/**
 * deleteUser and deleteChild are both SOFT deletes (server/db.ts: they stamp
 * deletedAt and preserve the row), but the admin "list everything" queries
 * selected every row with no deletedAt filter — so deleted accounts and
 * removed children still reached the admin lists, the CSV exports (which
 * carry name AND email), and the /admin-api/* JSON endpoints.
 *
 * This is a bug shape this repo has already been bitten by once: getCoParents
 * counted soft-deleted children toward "shared children" (13 vs the real 9) —
 * see tests/co-parents-shared-children-count.test.ts. Same class, same fix.
 *
 * No live DB is available to this test run, and the bug is a MISSING WHERE
 * clause, so a row-return mock cannot prove the fix — it would hand back
 * whatever canned rows the test supplied regardless of the clause. The
 * query's own compiled SQL is the invariant to assert. Same reasoning and
 * the same harness as the co-parents test above.
 */

const dialect = new MySqlDialect();
const compiledSql = (condition: any) => dialect.sqlToQuery(condition).sql;

type Captured = { table: unknown; where: unknown };
const captured: Captured[] = [];
const rowsByTable = new Map<unknown, unknown[]>();

const setRows = (table: unknown, rows: unknown[]) => rowsByTable.set(table, rows);

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    select: () => ({
      from: (table: unknown) => {
        // Every from() is recorded up front, and .where() fills in its clause
        // if one is ever chained. That is what lets a MISSING clause be
        // asserted: the call is captured either way, with where === undefined
        // when the query sent none. The chain is thenable at every step
        // because these functions terminate variously on .where(), .orderBy()
        // or a bare await.
        const call: Captured = { table, where: undefined };
        captured.push(call);
        const chain: any = {
          where: (w: unknown) => { call.where = w; return chain; },
          orderBy: () => chain,
          groupBy: () => chain,
          then: (resolve: any) => resolve(rowsByTable.get(table) ?? []),
        };
        return chain;
      },
    }),
  }),
}));

import {
  children,
  families,
  familyMembers,
  messages,
  parentAiConsultations,
  specialistAssignments,
  specialistProfiles,
  treatmentPlans,
  users,
} from "../drizzle/schema";
import {
  attachSpecialistUser,
  getActiveUsersAnalytics,
  getAllChildrenDetailed,
  getAllFamiliesDetailed,
  getAllSpecialists,
  getAllTeachers,
  getAllUsers,
  getChildrenByAgeGroup,
  getDashboardStats,
  getDb,
  getFallbackPhoneNumbers,
  getFamiliesBySize,
  getRegistrationAnalytics,
} from "../server/db";

// getDb() only calls the (mocked) drizzle() factory when DATABASE_URL is set.
process.env.DATABASE_URL = "mysql://admin-lists-test-only/db";

/** Assert EVERY query this function sent against `table` filters deletedAt IS NULL. */
function expectDeletedAtFilter(table: unknown, label: string) {
  // Every call, not the first: a gate that checks only the query it knows about
  // lets a second, unfiltered select against the same table slip in later —
  // the exact failure mode these filters exist to close.
  const calls = captured.filter((c) => c.table === table);
  expect(calls.length, `${label} never queried its table`).toBeGreaterThan(0);
  calls.forEach((call, i) => {
    const which = calls.length > 1 ? ` (query ${i + 1} of ${calls.length})` : "";
    expect(
      call.where,
      `${label}${which} sent no WHERE clause — soft-deleted rows reach every caller`,
    ).toBeTruthy();
    const text = compiledSql(call.where);
    expect(text, `${label}${which} filters on the wrong column`).toContain("deletedAt");
    // /is null/i, not a bare "deletedAt" check: an inverted filter (isNotNull)
    // still contains the column name and would otherwise pass.
    expect(text, `${label}${which} does not filter deletedAt IS NULL`).toMatch(/is null/i);
  });
}

/** Assert the users query for `label` still binds the role it is supposed to select. */
function expectRoleBound(role: string, label: string) {
  const call = captured.find((c) => c.table === users);
  // The role is a bound parameter — `users`.`role` = ? — so the VALUE lives in
  // .params. Asserting the SQL text only proves a role column is mentioned:
  // selecting "admin" instead of "teacher" compiles to identical text.
  const compiled = dialect.sqlToQuery(call!.where as any);
  expect(compiled.sql, `${label} dropped its role filter`).toContain("role");
  expect(compiled.params, `${label} selects the wrong role`).toContain(role);
}

beforeEach(() => {
  captured.length = 0;
  rowsByTable.clear();
});

describe("admin list queries exclude soft-deleted rows", () => {
  it("getAllUsers filters users.deletedAt", async () => {
    setRows(users, [{ id: 1, name: "Live", email: "live@example.com" }]);

    await expect(getAllUsers()).resolves.toHaveLength(1); // presence: the filter must not empty the list
    expectDeletedAtFilter(users, "getAllUsers");
  });

  it("getAllTeachers filters users.deletedAt as well as the role", async () => {
    setRows(users, [{ id: 2, name: "Teacher", role: "teacher" }]);

    await expect(getAllTeachers()).resolves.toHaveLength(1);
    expectDeletedAtFilter(users, "getAllTeachers");
    // The pre-existing role filter must survive the fix, not be replaced by it.
    expectRoleBound("teacher", "getAllTeachers");
  });

  it("getAllSpecialists filters users.deletedAt as well as the role", async () => {
    setRows(users, [{ id: 3, name: "Specialist", role: "specialist" }]);
    setRows(specialistAssignments, []);
    setRows(treatmentPlans, []);

    await expect(getAllSpecialists()).resolves.toHaveLength(1);
    expectDeletedAtFilter(users, "getAllSpecialists");
    expectRoleBound("specialist", "getAllSpecialists");
  });

  it("getAllChildrenDetailed filters children.deletedAt", async () => {
    setRows(children, [{ id: 4, name: "Kid", familyId: 1 }]);
    setRows(families, []);

    await expect(getAllChildrenDetailed()).resolves.toHaveLength(1);
    expectDeletedAtFilter(children, "getAllChildrenDetailed");
  });

  it("getAllFamiliesDetailed does not count soft-deleted children toward childrenCount", async () => {
    setRows(families, [{ id: 1, name: "Family" }]);
    setRows(familyMembers, [{ familyId: 1, userId: 10 }]);
    setRows(children, [{ id: 4, name: "Kid", familyId: 1 }]);

    const result = await getAllFamiliesDetailed();

    expect(result).toHaveLength(1);
    expect(result[0].childrenCount, "the live child must still be counted").toBe(1);
    expectDeletedAtFilter(children, "getAllFamiliesDetailed");
  });

  // The dashboard and the list it links to read the same tables. Filtering the
  // lists without filtering these counts makes the panel contradict itself:
  // "42 users" over a list showing 41.
  it("getDashboardStats counts only live users and children, so the totals match the lists", async () => {
    setRows(users, [{ count: 41 }]);
    setRows(families, [{ count: 5 }]);
    setRows(children, [{ count: 12 }]);
    setRows(messages, [{ count: 0 }]);
    setRows(parentAiConsultations, [{ count: 0 }]);

    const stats = await getDashboardStats();

    expect(stats.totalUsers, "the count must still be read, not zeroed").toBe(41);
    expectDeletedAtFilter(users, "getDashboardStats (totalUsers)");
    expectDeletedAtFilter(children, "getDashboardStats (totalChildren)");
  });

  // app/admin/management.tsx AnalyticsTab renders the dashboard tiles and these
  // four charts on ONE screen. Filtering the tiles alone would make "Kinderen: 12"
  // sit above age-group bars summing to 14 — the same self-contradiction the
  // dashboard filter exists to prevent, moved one component over.
  it("getChildrenByAgeGroup excludes soft-deleted children, so the chart matches the tile", async () => {
    setRows(children, [{ id: 1, birthDate: "2020-01-01", familyId: 1 }]);

    await expect(getChildrenByAgeGroup()).resolves.toBeInstanceOf(Array);
    expectDeletedAtFilter(children, "getChildrenByAgeGroup");
  });

  it("getFamiliesBySize excludes soft-deleted children from family sizes", async () => {
    setRows(families, [{ id: 1, name: "Family" }]);
    setRows(children, [{ id: 1, familyId: 1 }]);

    await expect(getFamiliesBySize()).resolves.toBeInstanceOf(Array);
    expectDeletedAtFilter(children, "getFamiliesBySize");
  });

  it("getRegistrationAnalytics counts only live users", async () => {
    setRows(users, [{ date: "2026-08-01", count: 3 }]);

    await expect(getRegistrationAnalytics(30)).resolves.toBeInstanceOf(Array);
    expectDeletedAtFilter(users, "getRegistrationAnalytics");
  });

  it("getActiveUsersAnalytics counts only live users", async () => {
    setRows(users, [{ date: "2026-08-01", count: 3 }]);

    await expect(getActiveUsersAnalytics(30)).resolves.toBeInstanceOf(Array);
    expectDeletedAtFilter(users, "getActiveUsersAnalytics");
  });

  // family_members rows are never cleaned up when a user is deleted (same as
  // parentChildLinks — see deleteUser's "preserve data"), so a family kept
  // rendering "3 leden" while the user list this panel links to showed 2.
  it("getAllFamiliesDetailed does not count soft-deleted users as members", async () => {
    setRows(families, [{ id: 1, name: "Family" }]);
    setRows(familyMembers, [
      { familyId: 1, userId: 10 },
      { familyId: 1, userId: 99 }, // 99 is soft-deleted: absent from the live users read
    ]);
    setRows(users, [{ id: 10 }]);
    setRows(children, []);

    const result = await getAllFamiliesDetailed();

    expect(result[0].memberCount, "the soft-deleted member is still counted").toBe(1);
    expect(result[0].members.map((m: any) => m.userId)).toEqual([10]);
    expectDeletedAtFilter(users, "getAllFamiliesDetailed (members)");
  });

  // The root the four specialist discovery paths share (getAvailableSpecialists,
  // findNearestSpecialist, findSpecialistsByCity, findSpecialistsByCountry).
  // It returns name AND email to parents, so it is a wider leak than the
  // fallback path below — which is only reached when these come back empty.
  it("attachSpecialistUser does not resolve soft-deleted specialists", async () => {
    setRows(users, [{ id: 7, name: "Live Specialist", email: "spec@example.invalid" }]);

    const db = await getDb();
    await attachSpecialistUser(db!, { userId: 7 }, { getUserFunctions: async () => [] });

    expectDeletedAtFilter(users, "attachSpecialistUser");
  });

  // The user-facing fallback: a specialist who deleted their account was still
  // handed out by name and phone number on the fallback contact path.
  it("getFallbackPhoneNumbers does not hand out soft-deleted specialists", async () => {
    setRows(specialistProfiles, [
      { userId: 7, displayName: "Ustadh", phone: "+3160000000", isAvailable: true },
    ]);
    setRows(users, [{ id: 7, name: "Live Specialist" }]);

    await expect(getFallbackPhoneNumbers()).resolves.toHaveLength(1);
    expectDeletedAtFilter(users, "getFallbackPhoneNumbers");
  });
});
