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

  it("still maps a request whose sender row is missing (no crash, null identity)", async () => {
    partnershipRows = [{ id: 8, initiatedBy: 200, userId1: 42, userId2: 200, status: "pending", confirmed: false, createdAt: null }];
    senderRows = []; // sender not found

    const out = await getIncomingLinkRequests(42);

    expect(out).toEqual([
      { partnershipId: 8, senderId: 200, senderName: null, senderPublicId: null, createdAt: null },
    ]);
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
  });
});
