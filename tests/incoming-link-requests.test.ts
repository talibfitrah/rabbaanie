import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

/**
 * getIncomingLinkRequests is the recipient's only reachable surface for a
 * pending partner-link request: getCoParents excludes unconfirmed rows and
 * directMessages is gated on a confirmed co-parent, so before this a request
 * could be sent (and push a notification) yet never be acceptable.
 *
 * This domain has a cross-wife-leak history, so WHICH rows it returns is the
 * real invariant: it must list only requests where I am a party AND did not
 * initiate them — never my own outbound requests, never anyone else's. The
 * predicate is captured and compiled here rather than trusted by eye.
 */

let capturedWhere: unknown;
let capturedSenderWhere: unknown;
let partnershipRows: any[] = [];
let senderRows: any[] = [];

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: async (w: unknown) => {
          if (table === partnerships) {
            capturedWhere = w;
            return partnershipRows;
          }
          capturedSenderWhere = w;
          return senderRows;
        },
      }),
    }),
  }),
}));

import { partnerships, users } from "../drizzle/schema";
import { getIncomingLinkRequests } from "../server/db";

process.env.DATABASE_URL = "mysql://incoming-link-requests-test-only/db";

beforeEach(() => {
  capturedWhere = undefined;
  capturedSenderWhere = undefined;
  partnershipRows = [];
  senderRows = [];
});

describe("getIncomingLinkRequests", () => {
  it("returns each pending request mapped to its sender's identity", async () => {
    const createdAt = new Date("2026-08-30T14:50:11Z");
    partnershipRows = [{ id: 7, initiatedBy: 100, userId1: 100, userId2: 42, status: "pending", confirmed: false, createdAt }];
    senderRows = [{ id: 100, name: "Claudia", publicId: "RB-100" }];

    const out = await getIncomingLinkRequests(42);

    expect(out).toEqual([
      { partnershipId: 7, senderId: 100, senderName: "Claudia", senderPublicId: "RB-100", createdAt },
    ]);
  });

  it("returns [] with no second query when there are no pending requests", async () => {
    partnershipRows = [];
    const out = await getIncomingLinkRequests(42);
    expect(out).toEqual([]);
  });

  it("drops a request whose sender is not a live user (soft-deleted or orphaned) — never a phantom", async () => {
    // A sender absent from the (deletedAt-filtered) users query is either a
    // soft-deleted account or a genuinely orphaned FK. Neither is an acceptable
    // partner: surfacing an Accept button for it would let the recipient confirm
    // a partnership with a deleted/nonexistent user that nothing can dissolve
    // (getPartnersOfUser hides deleted partners) and that permanently trips the
    // one-husband constraint. So it must be dropped, not shown with null identity.
    partnershipRows = [{ id: 8, initiatedBy: 200, userId1: 42, userId2: 200, status: "pending", confirmed: false, createdAt: null }];
    senderRows = []; // sender not a live user

    const out = await getIncomingLinkRequests(42);

    expect(out).toEqual([]);
  });

  it("scopes the query to inbound-only: binds me as recipient and excludes rows I initiated", async () => {
    partnershipRows = [{ id: 7, initiatedBy: 100, userId1: 100, userId2: 42, status: "pending", confirmed: false, createdAt: null }];
    senderRows = [{ id: 100, name: "X", publicId: "Y" }];

    await getIncomingLinkRequests(42);

    expect(capturedWhere, "no WHERE captured — the query would return every partnership row").toBeTruthy();
    const compiled = new MySqlDialect().sqlToQuery(capturedWhere as any);
    // The "!=" is the not-initiator guard: without it my own outbound requests
    // would show up as if someone were asking to link with me.
    expect(compiled.sql, "missing the not-initiator guard").toContain("!=");
    // Bound values: my id (as recipient AND as the not-initiator comparand) and
    // the pending status. Assert the values, not column text — a mistargeted
    // query compiles to identical SQL.
    expect(compiled.params, "the WHERE does not bind the requesting user id").toContain(42);
    expect(compiled.params, "the WHERE is not restricted to pending requests").toContain("pending");
    // Those token checks are necessary but NOT sufficient: 42 binds three times
    // (userId1, userId2, and the != comparand) and "!=" survives even if the
    // party-membership OR-clause is deleted, so a `toContain` check still passes
    // on a query that would leak every row or drop every user's requests. Lock
    // the STRUCTURE of the "(userId1 = ? or userId2 = ?)" membership clause, and
    // that all three bindings of the recipient id are present.
    expect(compiled.sql, "party-membership OR-clause missing or malformed").toMatch(
      /userId1.*=.*\bor\b.*userId2.*=/i,
    );
    expect(
      compiled.params.filter((p) => p === 42).length,
      "recipient id must bind 3x: userId1, userId2, and the not-initiator comparand",
    ).toBe(3);
  });

  it("does not hand out a soft-deleted sender's identity: the senders query excludes deletedAt", async () => {
    partnershipRows = [{ id: 7, initiatedBy: 100, userId1: 100, userId2: 42, status: "pending", confirmed: false, createdAt: null }];
    senderRows = [{ id: 100, name: "X", publicId: "Y" }];

    await getIncomingLinkRequests(42);

    // Soft-delete in this codebase stamps deletedAt only — name and publicId are
    // preserved (server/db.ts) — so a request from an account that later deletes
    // would otherwise leak that account's real identity to the recipient. This
    // is the exact leak class fixed at every other user-identity hand-out site
    // (commits 53f38ec / 50c3928 / 2998387: `isNull(users.deletedAt)`). Assert
    // the guard is in the compiled predicate, not merely that the mock returned
    // a clean row.
    expect(capturedSenderWhere, "senders query ran with no WHERE at all").toBeTruthy();
    const compiled = new MySqlDialect().sqlToQuery(capturedSenderWhere as any);
    expect(compiled.sql.toLowerCase(), "senders query does not filter soft-deleted users").toContain("is null");
    expect(compiled.sql, "the deletedAt column is not the one being null-checked").toContain("deletedAt");
  });
});
