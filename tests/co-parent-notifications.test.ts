import { beforeEach, describe, it, expect, vi } from "vitest";

// The "should define notification helper functions" it() below used to grep
// server/routers.ts for each notify call site as a literal source substring
// — brittle against reformatting (a wrapped multi-line call broke it with no
// behavior change; confirmed unchanged since base commit 336b547 via
// `git log --follow -p`). Rewritten to invoke the real router mutations with
// server/db mocked and observe the real notification side effects — same
// hoisted-mock + createCaller pattern as tests/partner-profile-access.test.ts.
const dbMocks = vi.hoisted(() => ({
  getFamilyMembership: vi.fn(),
  getChildById: vi.fn(),
  getUserById: vi.fn(),
  getLinkedParents: vi.fn(),
  getUserLanguage: vi.fn(),
  sendMessage: vi.fn(),
  sendLocalizedPush: vi.fn(),
  upsertGoalProgress: vi.fn(),
  updateChild: vi.fn(),
  addObservation: vi.fn(),
  tx: (lang: string, nl: string, en: string, ar: string) =>
    lang === "ar" ? ar : lang === "en" ? en : nl,
}));
vi.mock("../server/db", () => dbMocks);

import { appRouter } from "../server/routers";

const ACTOR_ID = 1;
const CO_PARENT_ID = 2;
const FAMILY_ID = 5;
const CHILD_ID = 100;

function actorCaller() {
  return appRouter.createCaller({
    req: {} as any,
    res: {} as any,
    user: { id: ACTOR_ID, name: "Actor", language: "nl", profileData: {} } as any,
  });
}

describe("Co-parent notification system", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getFamilyMembership.mockResolvedValue({ permissions: {} });
    dbMocks.getChildById.mockResolvedValue({
      id: CHILD_ID,
      familyId: FAMILY_ID,
      name: "Kid",
    });
    dbMocks.getUserById.mockResolvedValue({ name: "Actor" });
    dbMocks.getLinkedParents.mockResolvedValue([
      { id: ACTOR_ID, name: "Actor" },
      { id: CO_PARENT_ID, name: "Co-parent" },
    ]);
    dbMocks.getUserLanguage.mockResolvedValue("nl");
    dbMocks.sendMessage.mockResolvedValue(1);
    dbMocks.sendLocalizedPush.mockResolvedValue(true);
    dbMocks.upsertGoalProgress.mockResolvedValue(undefined);
    dbMocks.updateChild.mockResolvedValue(undefined);
    dbMocks.addObservation.mockResolvedValue(1);
  });

  it("should have activity_update, environment_update, consultation_share message types fitting in varchar(32)", () => {
    const types = ["activity_update", "environment_update", "consultation_share", "text", "notification", "link_request"];
    for (const type of types) {
      expect(type.length).toBeLessThanOrEqual(32);
    }
  });

  it("goals.update marking a goal done notifies the co-parent (not the actor) via activity_update", async () => {
    await actorCaller().goals.update({
      familyId: FAMILY_ID,
      childId: CHILD_ID,
      weekId: "w1",
      goalId: "g1",
      goalTitle: "Salah on time",
      status: "done",
    });
    // notifyCoParentsAboutActivity is fired-and-forgotten (`.catch(() => {})`,
    // never awaited by the mutation), so poll for its last db call instead of
    // assuming it's settled the instant the mutation promise resolves.
    await vi.waitFor(() => expect(dbMocks.sendLocalizedPush).toHaveBeenCalled());

    expect(dbMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: ACTOR_ID,
        recipientId: CO_PARENT_ID,
        childId: CHILD_ID,
        type: "activity_update",
      }),
    );
    expect(dbMocks.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: ACTOR_ID }),
    );
  });

  it("children.update with environmentData notifies the co-parent via environment_update", async () => {
    await actorCaller().children.update({
      childId: CHILD_ID,
      environmentData: { housing: "apartment" },
    });
    await vi.waitFor(() => expect(dbMocks.sendLocalizedPush).toHaveBeenCalled());

    expect(dbMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: ACTOR_ID,
        recipientId: CO_PARENT_ID,
        childId: CHILD_ID,
        type: "environment_update",
      }),
    );
  });

  it("children.addObservation notifies the co-parent via consultation_share", async () => {
    await actorCaller().children.addObservation({
      childId: CHILD_ID,
      category: "gedrag",
      title: "Moeite met slapen",
    });
    await vi.waitFor(() => expect(dbMocks.sendLocalizedPush).toHaveBeenCalled());

    expect(dbMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: ACTOR_ID,
        recipientId: CO_PARENT_ID,
        childId: CHILD_ID,
        type: "consultation_share",
      }),
    );
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
