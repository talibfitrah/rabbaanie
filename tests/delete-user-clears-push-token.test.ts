import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

/**
 * deleteUser is a soft delete, and nothing downstream of it filters deletedAt
 * when choosing push recipients: broadcastLocalizedPush selects purely on
 * `pushToken IS NOT NULL AND pushToken != ''` (server/db.ts), and
 * getUserPushToken selects by id alone. So a user who deleted their account
 * via the Play-mandated self-service path kept receiving every all-user
 * broadcast, forever.
 *
 * Fixed at deleteUser rather than in each recipient query: that is the one
 * place every push path routes through, so it also covers the targeted sends
 * and any selector added later. It is what the deployed rabbaanie-api already
 * does (its deleteUser nulls email/name/pushToken/profileData) — this repo's
 * copy had drifted to stamping deletedAt alone.
 */

const updates: { table: unknown; payload: any; where: unknown }[] = [];

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    update: (table: unknown) => ({
      set: (payload: any) => {
        const call = { table, payload, where: undefined as unknown };
        updates.push(call);
        // The predicate is captured, not discarded: this is a destructive write,
        // so WHICH rows it targets is as much the invariant as what it writes.
        // A mock that swallows the clause stays green even if the UPDATE loses
        // its WHERE and soft-deletes every account in the table.
        return {
          where: async (w: unknown) => { call.where = w; },
        };
      },
    }),
  }),
}));

import { users } from "../drizzle/schema";
import { deleteUser } from "../server/db";

process.env.DATABASE_URL = "mysql://delete-user-push-test-only/db";

beforeEach(() => {
  updates.length = 0;
});

describe("deleteUser stops the account being reachable by push", () => {
  it("clears pushToken, so no broadcast or targeted send can still find the account", async () => {
    await deleteUser(42);

    const call = updates.find((u) => u.table === users);
    expect(call, "deleteUser never updated the users table").toBeTruthy();
    expect(
      call!.payload,
      "deleteUser left pushToken intact — every all-user broadcast still reaches this account",
    ).toHaveProperty("pushToken", null);
  });

  it("still performs the soft delete itself (the stamp must not be lost to the fix)", async () => {
    await deleteUser(42);

    const call = updates.find((u) => u.table === users);
    expect(call!.payload.deletedAt, "the deletedAt stamp is what marks the row deleted").toBeInstanceOf(Date);
  });

  it("scopes the write to the one requested user", async () => {
    await deleteUser(42);

    const call = updates.find((u) => u.table === users);
    expect(call!.where, "the UPDATE carried no WHERE — this would delete every account").toBeTruthy();
    const compiled = new MySqlDialect().sqlToQuery(call!.where as any);
    expect(compiled.sql).toContain("id");
    // The id is a bound parameter, so assert the VALUE, not the column name:
    // targeting the wrong row compiles to identical SQL text.
    expect(compiled.params, "the WHERE does not bind the requested user id").toContain(42);
  });
});
