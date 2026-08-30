import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

/**
 * Item 4 (2005): the wife's "shared children" card showed 13 when the real
 * distinct number is 9. Traced to server/db.ts getCoParents: deleteChild is
 * a soft delete (children.deletedAt), and parentChildLinks rows are never
 * cleaned up when a child is deleted (see db.ts deleteChild's own comment,
 * "preserve data"). getLinkedChildren (the sibling function used by
 * confirmLink) already excludes `deletedAt IS NOT NULL` rows from its own
 * children-table query — getCoParents's childList query never did, so a
 * removed child's row (name/publicId still readable by design) kept
 * counting toward "shared children" forever.
 *
 * No live DB is available to this test run, so this proves the FIX at the
 * only level that is actually checkable here: the compiled SQL text
 * getCoParents sends for the children-table query. A dumb row-return mock
 * cannot prove this (it would return whatever canned rows the test hands
 * it regardless of the WHERE clause) — the bug is a missing clause, so the
 * query's own content is the invariant to assert, not a mocked result.
 */

const dialect = new MySqlDialect();
const compiledSql = (condition: any) => dialect.sqlToQuery(condition).sql;

type Captured = { table: unknown; where: unknown };
const captured: Captured[] = [];
const queues = new Map<unknown, unknown[][]>();
const counts = new Map<unknown, number>();

function setRows(table: unknown, ...responses: unknown[][]) {
  queues.set(table, responses);
  counts.set(table, 0);
}
function nextRows(table: unknown): unknown[] {
  const q = queues.get(table) ?? [];
  const i = counts.get(table) ?? 0;
  counts.set(table, i + 1);
  return (q[Math.min(i, q.length - 1)] as unknown[]) ?? [];
}

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: (where: unknown) => {
          captured.push({ table, where });
          const rows = nextRows(table);
          // getCoParents never chains .limit()/.orderBy() on these calls —
          // a plain thenable is enough (same minimal shape as this file's
          // sibling mocks elsewhere, e.g. tests/partner-profile-access.test.ts).
          return { then: (resolve: any) => resolve(rows) };
        },
      }),
    }),
  }),
}));

import { children, parentChildLinks, partnerships, users } from "../drizzle/schema";
import { getCoParents } from "../server/db";

// getDb() only calls the (mocked) drizzle() factory when DATABASE_URL is
// set, and caches the result for the lifetime of this module — same
// convention as tests/partner-profile-access.test.ts's direct db.ts tests.
process.env.DATABASE_URL = "mysql://co-parents-count-test-only/db";

const HUSBAND = 1;
const WIFE = 9;

beforeEach(() => {
  captured.length = 0;
  queues.clear();
  counts.clear();
});

describe("getCoParents excludes soft-deleted children from the shared-children count (item 4)", () => {
  it("sends a children-table query that filters deletedAt IS NULL", async () => {
    setRows(partnerships, []);
    setRows(
      parentChildLinks,
      [{ parentId: HUSBAND, childId: 1, confirmed: true }], // myLinks
      [{ parentId: WIFE, childId: 1, confirmed: true }], // otherLinks
    );
    setRows(users, [{ id: WIFE, name: "Wife", role: "parent" }]);
    setRows(children, [{ id: 1, name: "Kid", publicId: "K1" }]);

    const result = await getCoParents(HUSBAND);

    expect(result).toHaveLength(1);
    expect(result[0].sharedChildren).toHaveLength(1);

    const childrenCall = captured.find((c) => c.table === children);
    expect(childrenCall, "getCoParents never queried the children table").toBeTruthy();
    const text = compiledSql(childrenCall!.where);
    expect(text).toContain("deletedAt");
    expect(text).toMatch(/IS NULL/);
  });

  it("the parentChildLinks queries (myLinks/otherLinks) are unaffected by the fix — still scoped by parentId/confirmed only", async () => {
    setRows(partnerships, []);
    setRows(
      parentChildLinks,
      [{ parentId: HUSBAND, childId: 1, confirmed: true }],
      [{ parentId: WIFE, childId: 1, confirmed: true }],
    );
    setRows(users, [{ id: WIFE, name: "Wife", role: "parent" }]);
    setRows(children, [{ id: 1, name: "Kid", publicId: "K1" }]);

    await getCoParents(HUSBAND);

    const linkCalls = captured.filter((c) => c.table === parentChildLinks);
    expect(linkCalls).toHaveLength(2);
  });
});

describe("getCoParents excludes soft-deleted co-parents from the co-parent list (identity)", () => {
  it("sends a users query that filters deletedAt IS NULL — a co-parent who deleted their account is not surfaced by name/publicId", async () => {
    // Soft-delete preserves name/publicId; the parentList (users) query resolves
    // co-parent identity for display. Without the guard a deleted co-parent's
    // real name/publicId still appears in the recipient's co-parent list — the
    // same leak class fixed at the other user-identity hand-out sites. Assert the
    // compiled predicate carries the guard, not a mocked row shape. The children
    // query already filtered deletedAt (item 4); this is its users-table sibling.
    setRows(partnerships, []);
    setRows(
      parentChildLinks,
      [{ parentId: HUSBAND, childId: 1, confirmed: true }],
      [{ parentId: WIFE, childId: 1, confirmed: true }],
    );
    setRows(users, [{ id: WIFE, name: "Wife", role: "parent" }]);
    setRows(children, [{ id: 1, name: "Kid", publicId: "K1" }]);

    await getCoParents(HUSBAND);

    const userCall = captured.find((c) => c.table === users);
    expect(userCall, "getCoParents never queried the users table").toBeTruthy();
    const text = compiledSql(userCall!.where);
    expect(text).toContain("deletedAt");
    expect(text).toMatch(/IS NULL/);
  });
});
