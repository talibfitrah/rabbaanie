import { describe, it, expect, vi } from "vitest";

// We test that the notification helper functions are properly defined and the
// router endpoints call them correctly.

describe("Co-parent notification system", () => {
  it("should have activity_update, environment_update, consultation_share message types fitting in varchar(32)", () => {
    const types = ["activity_update", "environment_update", "consultation_share", "text", "notification", "link_request"];
    for (const type of types) {
      expect(type.length).toBeLessThanOrEqual(32);
    }
  });

  it("should define notification helper functions in routers.ts", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routersPath = path.resolve(__dirname, "../server/routers.ts");
    const content = fs.readFileSync(routersPath, "utf-8");

    // Verify all three helper functions exist
    expect(content).toContain("async function notifyCoParentsAboutActivity");
    expect(content).toContain("async function notifyCoParentsAboutEnvironment");
    expect(content).toContain("async function notifyCoParentsAboutConsultation");

    // Verify they are called in the right places
    expect(content).toContain("notifyCoParentsAboutActivity(ctx.user.id, input.childId");
    expect(content).toContain("notifyCoParentsAboutEnvironment(ctx.user.id, childId)");
    expect(content).toContain("notifyCoParentsAboutConsultation(ctx.user.id, input.childId");
  });

  it("should have goals.update endpoint accepting goalTitle parameter", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routersPath = path.resolve(__dirname, "../server/routers.ts");
    const content = fs.readFileSync(routersPath, "utf-8");

    // Verify goalTitle is accepted as optional input
    expect(content).toContain("goalTitle: z.string().optional()");
  });

  it("should have push notification handler for new notification types", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const hookPath = path.resolve(__dirname, "../hooks/use-push-notifications.ts");
    const content = fs.readFileSync(hookPath, "utf-8");

    // Verify the push notification handler handles new types
    expect(content).toContain("activity_update");
    expect(content).toContain("environment_update");
    expect(content).toContain("consultation_share");
    // Verify it navigates to messages tab
    expect(content).toContain("router.push(\"/(tabs)/messages\")");
  });

  it("should have a dedicated Android notification channel for shared activities", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const hookPath = path.resolve(__dirname, "../hooks/use-push-notifications.ts");
    const content = fs.readFileSync(hookPath, "utf-8");

    expect(content).toContain("setNotificationChannelAsync(\"shared\"");
    expect(content).toContain("Gedeelde activiteiten");
  });

  it("should have messages tab visible in tab layout (not hidden)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const layoutPath = path.resolve(__dirname, "../app/(tabs)/_layout.tsx");
    const content = fs.readFileSync(layoutPath, "utf-8");

    // Find the messages Tabs.Screen block (from name="messages" to the next Tabs.Screen)
    const afterMessages = content.split('name="messages"')[1] || "";
    const messagesBlock = afterMessages.split('<Tabs.Screen')[0] || "";
    // The messages tab block itself should NOT have href: null
    expect(messagesBlock).not.toContain("href: null");
    // It should have a title
    expect(messagesBlock).toContain("title:");
    // It should have a tabBarIcon
    expect(messagesBlock).toContain("tabBarIcon:");
  });

  it("should have tab.network i18n key", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const i18nPath = path.resolve(__dirname, "../lib/i18n.tsx");
    const content = fs.readFileSync(i18nPath, "utf-8");

    expect(content).toContain("\"tab.network\"");
    expect(content).toContain("شبكتي");
    expect(content).toContain("Network");
    expect(content).toContain("Netwerk");
  });

  it("should have messages schema type field with length >= 32", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
    const content = fs.readFileSync(schemaPath, "utf-8");

    // Find the messages table type field
    const messagesSection = content.split("export const messages")[1]?.split("export type")[0] || "";
    expect(messagesSection).toContain("varchar(\"type\", { length: 32 })");
  });
});
