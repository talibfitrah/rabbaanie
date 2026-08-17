import { describe, it, expect, vi } from "vitest";

// confirmLink's "should accept senderId parameter" it() below used to grep
// server/routers.ts for two literal substrings: the zod schema key, and a
// call to server/db.ts's confirmAllLinksFromSender. The router no longer
// calls that function at all — confirmLink was reworked to loop
// db.getPendingLinksFromSender() results through the real per-link
// assertMayConfirmLink authorization gate instead (see git blame on
// confirmLink in server/routers.ts). confirmAllLinksFromSender /
// removeAllLinksFromSender still exist in server/db.ts but are now dead code
// (grepped repo-wide: zero callers outside this test file) — a pre-existing
// finding, not touched here since server/db.ts is off-limits and deleting
// pre-existing code needs the user's explicit yes. Rewritten to invoke the
// real confirmLink mutation with server/db mocked, same hoisted-mock +
// createCaller pattern as tests/partner-profile-access.test.ts.
const dbMocks = vi.hoisted(() => ({
  getPendingLinksFromSender: vi.fn(),
  getParentChildLinkById: vi.fn(),
  getChildById: vi.fn(),
  getFamilyMembership: vi.fn(),
  getConfirmedParentChildLink: vi.fn(),
  confirmParentChildLink: vi.fn(),
  getPendingPartnershipFromSender: vi.fn(),
}));
vi.mock("../server/db", () => dbMocks);

import { linksRouter } from "../server/routers";

describe("Link accept/reject fix", () => {
  it("linkChildByPublicId should set createdBy to the requesting parent ID (not 0)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const dbPath = path.resolve(__dirname, "../server/db.ts");
    const content = fs.readFileSync(dbPath, "utf-8");

    // Find the linkChildByPublicId function
    const funcStart = content.indexOf("export async function linkChildByPublicId");
    const funcEnd = content.indexOf("\n}", funcStart) + 2;
    const funcBody = content.substring(funcStart, funcEnd);

    // Should NOT contain createdBy: 0 or createdBy: hasOtherParents ? 0
    expect(funcBody).not.toContain("createdBy: 0");
    expect(funcBody).not.toContain("createdBy: hasOtherParents ? 0");

    // Should set confirmed based on hasOtherParents
    expect(funcBody).toContain("confirmed: !hasOtherParents");

    // Should set createdBy to parentId
    expect(funcBody).toContain("createdBy: parentId");
  });

  it("confirmAllLinksFromSender should confirm links where parentId = senderId (the requester's own links)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const dbPath = path.resolve(__dirname, "../server/db.ts");
    const content = fs.readFileSync(dbPath, "utf-8");

    // Find the confirmAllLinksFromSender function
    const funcStart = content.indexOf("export async function confirmAllLinksFromSender");
    const funcEnd = content.indexOf("\n}", funcStart) + 2;
    const funcBody = content.substring(funcStart, funcEnd);

    // Should search for parentId = senderId (the person who requested the link)
    expect(funcBody).toContain("eq(parentChildLinks.parentId, senderId)");
    expect(funcBody).toContain("eq(parentChildLinks.createdBy, senderId)");
    expect(funcBody).toContain("eq(parentChildLinks.confirmed, false)");
  });

  it("removeAllLinksFromSender should delete links where parentId = senderId", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const dbPath = path.resolve(__dirname, "../server/db.ts");
    const content = fs.readFileSync(dbPath, "utf-8");

    // Find the removeAllLinksFromSender function
    const funcStart = content.indexOf("export async function removeAllLinksFromSender");
    const funcEnd = content.indexOf("\n}", funcStart) + 2;
    const funcBody = content.substring(funcStart, funcEnd);

    // Should search for parentId = senderId (the person who requested the link)
    expect(funcBody).toContain("eq(parentChildLinks.parentId, senderId)");
    expect(funcBody).toContain("eq(parentChildLinks.createdBy, senderId)");
    expect(funcBody).toContain("eq(parentChildLinks.confirmed, false)");
  });

  it("confirmLink with senderId confirms only the sender's links the confirming user is authorized for", async () => {
    // Sender (id 2) has two pending links: one to a child in the confirming
    // user's own family (must get confirmed), one to a child in a family the
    // confirming user has no access to at all (must be silently skipped, not
    // confirmed) — the real generalization of the old "parentId = senderId,
    // the requester's own links" scoping.
    const linkToOwnChild = { id: 10, parentId: 2, childId: 100, createdBy: 2, confirmed: false };
    const linkToForeignChild = { id: 11, parentId: 2, childId: 200, createdBy: 2, confirmed: false };
    dbMocks.getPendingLinksFromSender.mockResolvedValue([linkToOwnChild, linkToForeignChild]);
    dbMocks.getParentChildLinkById.mockImplementation(async (linkId: number) =>
      linkId === 10 ? linkToOwnChild : linkId === 11 ? linkToForeignChild : undefined,
    );
    dbMocks.getChildById.mockImplementation(async (childId: number) =>
      childId === 100
        ? { id: 100, familyId: 5, name: "Kid A" }
        : childId === 200
          ? { id: 200, familyId: 9, name: "Kid B" }
          : undefined,
    );
    dbMocks.getFamilyMembership.mockImplementation(async (userId: number, familyId: number) =>
      userId === 1 && familyId === 5 ? { permissions: {} } : undefined,
    );
    dbMocks.getConfirmedParentChildLink.mockResolvedValue(undefined);
    dbMocks.getPendingPartnershipFromSender.mockResolvedValue(null);

    const result = await linksRouter
      .createCaller({ req: {} as any, res: {} as any, user: { id: 1 } as any })
      .confirmLink({ senderId: 2 });

    expect(result).toEqual({ success: true, changed: 1 });
    expect(dbMocks.confirmParentChildLink).toHaveBeenCalledWith(10);
    expect(dbMocks.confirmParentChildLink).not.toHaveBeenCalledWith(11);
  });

  it("LinkRequestActions UI should pass item.senderId to confirmLink mutation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const messagesPath = path.resolve(__dirname, "../app/(tabs)/messages.tsx");
    const content = fs.readFileSync(messagesPath, "utf-8");

    // The UI should pass senderId from the message item
    expect(content).toContain("confirmMutation.mutate({ senderId: item.senderId })");
    expect(content).toContain("removeMutation.mutate({ senderId: item.senderId })");
  });
});
