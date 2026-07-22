import { describe, it, expect } from "vitest";

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

  it("confirmLink endpoint should accept senderId parameter", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routersPath = path.resolve(__dirname, "../server/routers.ts");
    const content = fs.readFileSync(routersPath, "utf-8");

    // Find the confirmLink endpoint
    const funcStart = content.indexOf("confirmLink: protectedProcedure");
    const funcEnd = content.indexOf("return { success: true }", funcStart) + 30;
    const funcBody = content.substring(funcStart, funcEnd);

    // Should accept senderId as input
    expect(funcBody).toContain("senderId: z.number().optional()");
    // Should call confirmAllLinksFromSender
    expect(funcBody).toContain("confirmAllLinksFromSender");
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
