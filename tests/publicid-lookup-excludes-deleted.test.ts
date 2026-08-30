import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

/**
 * getUserByPublicId resolves a user from a scanned/typed public ID and feeds
 * lookupUser (QR + "add person") and linkPartnerByPublicId. Soft-delete stamps
 * deletedAt but PRESERVES publicId, so without a deletedAt guard on EVERY match
 * branch (exact, case-insensitive, fuzzy date+seq, separator-normalized) a
 * deleted account still resolves and can be linked as a live partner. This was
 * a deliberate deferral (see getFallbackPhoneNumbers' note in server/db.ts),
 * closed here for the two non-authorization callers; getLinkedParents, which
 * doubles as an access check, stays unfiltered by design.
 *
 * No live DB here, so the checkable invariant is the compiled SQL: assert every
 * users-table query the function sends carries "deletedAt ... IS NULL". A
 * row-return mock cannot prove a MISSING clause (it returns canned rows
 * regardless of the WHERE), so the WHERE is captured and compiled — same
 * approach as tests/co-parents-shared-children-count.test.ts.
 */

const dialect = new MySqlDialect();
const compiledSql = (condition: any) => dialect.sqlToQuery(condition).sql;

const captured: unknown[] = [];

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    select: () => ({
      from: () => ({
        where: (where: unknown) => {
          captured.push(where);
          // getUserByPublicId chains .limit(1) then awaits. Every branch misses
          // (empty result) so all fallbacks run and each WHERE is captured.
          return { limit: () => ({ then: (resolve: any) => resolve([]) }) };
        },
      }),
    }),
  }),
}));

import { getUserByPublicId } from "../server/db";

process.env.DATABASE_URL = "mysql://publicid-lookup-deleted-test-only/db";

beforeEach(() => {
  captured.length = 0;
});

describe("getUserByPublicId excludes soft-deleted users on every branch", () => {
  it("every lookup branch filters deletedAt IS NULL", async () => {
    // Underscore input reaches branches 1 (exact), 2 (case-insensitive) and 3
    // (fuzzy date+seq); a space-separated input reaches 1, 2 and 4 (separator-
    // normalized, since cleaned !== upper). Between the two, all four branch
    // shapes run and are captured.
    await getUserByPublicId("19850315_MA_001");
    await getUserByPublicId("19850315 MA 001");

    expect(
      captured.length,
      "expected all fallback branches to run and be captured",
    ).toBeGreaterThanOrEqual(4);
    for (const where of captured) {
      const text = compiledSql(where);
      expect(text, `a lookup branch does not name deletedAt: ${text}`).toContain(
        "deletedAt",
      );
      expect(text, `a lookup branch does not filter IS NULL: ${text}`).toMatch(
        /IS NULL/i,
      );
    }
  });
});
