import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getChildAccountForParent: vi.fn(),
  createCustomTask: vi.fn(),
  getCustomTask: vi.fn(),
  updateCustomTask: vi.fn(),
  getChildAiConversation: vi.fn(),
  getParentAiConsultation: vi.fn(),
  getChildChallenge: vi.fn(),
  getChildChallenges: vi.fn(),
  completeChildChallenge: vi.fn(),
  logChildAppUsageBatch: vi.fn(),
}));

vi.mock("../server/db", () => dbMocks);
vi.mock("../server/_core/llm", () => ({ invokeLLM: vi.fn() }));

import {
  childAiChatRouter,
  childAppUsageRouter,
  childSummaryRouter,
  customTasksRouter,
  familyChatRouter,
  parentAiConsultRouter,
} from "../server/child-monitoring-router";
import { childAccountRouter } from "../server/community-router";

const context = {
  req: {} as any,
  res: {} as any,
  user: { id: 7 } as any,
};

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND" });
}

describe("child and family record authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getChildAccountForParent.mockResolvedValue(null);
  });

  it("rejects creating a task for another family's child", async () => {
    const caller = customTasksRouter.createCaller(context);
    await expectNotFound(
      caller.create({ childAccountId: 99, title: "Private task" }),
    );
    expect(dbMocks.createCustomTask).not.toHaveBeenCalled();
  });

  it("rejects changing a task owned by another parent", async () => {
    dbMocks.getCustomTask.mockResolvedValue({
      id: 41,
      parentId: 8,
      childAccountId: 99,
    });
    const caller = customTasksRouter.createCaller(context);
    await expectNotFound(caller.update({ taskId: 41, title: "Changed" }));
    expect(dbMocks.updateCustomTask).not.toHaveBeenCalled();
  });

  it("rejects reading another child's AI conversation", async () => {
    dbMocks.getChildAiConversation.mockResolvedValue({
      id: 12,
      childAccountId: 99,
    });
    const caller = childAiChatRouter.createCaller(context);
    await expectNotFound(caller.getConversation({ conversationId: 12 }));
  });

  it("rejects reading another parent's consultation", async () => {
    dbMocks.getParentAiConsultation.mockResolvedValue({ id: 5, parentId: 8 });
    const caller = parentAiConsultRouter.createCaller(context);
    await expectNotFound(caller.get({ consultationId: 5 }));
  });

  it("rejects child activity reads for an unowned account", async () => {
    const caller = childAccountRouter.createCaller(context);
    await expectNotFound(caller.getChallenges({ childAccountId: 99 }));
    expect(dbMocks.getChildChallenges).not.toHaveBeenCalled();
  });

  it("rejects completing another child's challenge", async () => {
    dbMocks.getChildChallenge.mockResolvedValue({ id: 3, childAccountId: 99 });
    const caller = childAccountRouter.createCaller(context);
    await expectNotFound(caller.completeChallenge({ challengeId: 3 }));
    expect(dbMocks.completeChildChallenge).not.toHaveBeenCalled();
  });

  it("caps bulk usage uploads before they reach the database", async () => {
    const caller = childAppUsageRouter.createCaller(context);
    await expect(
      caller.bulkLog({
        childAccountId: 99,
        date: "2026-08-02",
        apps: Array.from({ length: 501 }, (_, index) => ({
          packageName: `app.${index}`,
          usageSeconds: 1,
        })),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.logChildAppUsageBatch).not.toHaveBeenCalled();
  });

  it("writes an owned usage upload in one batch", async () => {
    dbMocks.getChildAccountForParent.mockResolvedValue({ id: 99, parentId: 7 });
    const caller = childAppUsageRouter.createCaller(context);
    await expect(
      caller.bulkLog({
        childAccountId: 99,
        date: "2026-08-02",
        apps: [
          { packageName: "app.one", usageSeconds: 60 },
          { packageName: "app.two", usageSeconds: 120 },
        ],
      }),
    ).resolves.toEqual({ success: true, count: 2 });
    expect(dbMocks.logChildAppUsageBatch).toHaveBeenCalledTimes(1);
    expect(dbMocks.logChildAppUsageBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ packageName: "app.one", childAccountId: 99 }),
        expect.objectContaining({ packageName: "app.two", childAccountId: 99 }),
      ]),
    );
  });

  it("rejects oversized child AI prompts before loading a conversation", async () => {
    const caller = childAiChatRouter.createCaller(context);
    await expect(
      caller.sendMessage({
        conversationId: 12,
        childAccountId: 99,
        message: "x".repeat(2_001),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.getChildAiConversation).not.toHaveBeenCalled();
  });

  it.each([
    [
      "task lists",
      () =>
        customTasksRouter.createCaller(context).list({ childAccountId: 99 }),
    ],
    [
      "family-chat sends",
      () =>
        familyChatRouter.createCaller(context).send({
          childAccountId: 99,
          senderType: "parent",
          content: "Private",
        }),
    ],
    [
      "family-chat reads",
      () =>
        familyChatRouter
          .createCaller(context)
          .getMessages({ childAccountId: 99 }),
    ],
    [
      "family-chat read markers",
      () =>
        familyChatRouter
          .createCaller(context)
          .markRead({ childAccountId: 99, readerType: "parent" }),
    ],
    [
      "family-chat unread counts",
      () =>
        familyChatRouter
          .createCaller(context)
          .unreadCount({ childAccountId: 99, readerType: "parent" }),
    ],
    [
      "daily summaries",
      () =>
        childSummaryRouter
          .createCaller(context)
          .getDaily({ childAccountId: 99, date: "2026-08-02" }),
    ],
    [
      "weekly summaries",
      () =>
        childSummaryRouter.createCaller(context).getWeekly({
          childAccountId: 99,
          startDate: "2026-07-27",
          endDate: "2026-08-02",
        }),
    ],
    [
      "summary writes",
      () =>
        childSummaryRouter
          .createCaller(context)
          .upsert({ childAccountId: 99, date: "2026-08-02" }),
    ],
    [
      "AI conversation creation",
      () =>
        childAiChatRouter
          .createCaller(context)
          .createConversation({ childAccountId: 99 }),
    ],
    [
      "AI conversation lists",
      () =>
        childAiChatRouter
          .createCaller(context)
          .listConversations({ childAccountId: 99 }),
    ],
    [
      "single app-usage writes",
      () =>
        childAppUsageRouter.createCaller(context).log({
          childAccountId: 99,
          date: "2026-08-02",
          packageName: "example.app",
          usageSeconds: 60,
        }),
    ],
    [
      "bulk app-usage writes",
      () =>
        childAppUsageRouter
          .createCaller(context)
          .bulkLog({ childAccountId: 99, date: "2026-08-02", apps: [] }),
    ],
    [
      "daily app-usage reads",
      () =>
        childAppUsageRouter
          .createCaller(context)
          .getDaily({ childAccountId: 99, date: "2026-08-02" }),
    ],
    [
      "range app-usage reads",
      () =>
        childAppUsageRouter.createCaller(context).getRange({
          childAccountId: 99,
          startDate: "2026-07-27",
          endDate: "2026-08-02",
        }),
    ],
    [
      "achievement reads",
      () =>
        childAccountRouter
          .createCaller(context)
          .getAchievements({ childAccountId: 99 }),
    ],
    [
      "activity writes",
      () =>
        childAccountRouter
          .createCaller(context)
          .logActivity({ childAccountId: 99, activityType: "private" }),
    ],
    [
      "activity-log reads",
      () =>
        childAccountRouter
          .createCaller(context)
          .getActivityLog({ childAccountId: 99 }),
    ],
  ] as Array<[string, () => Promise<unknown>]>)(
    "rejects cross-family %s",
    async (_name, call) => {
      await expectNotFound(call());
    },
  );

  it.each(["delete", "complete"] as const)(
    "rejects %s for another parent's task",
    async (action) => {
      dbMocks.getCustomTask.mockResolvedValue({
        id: 41,
        parentId: 8,
        childAccountId: 99,
      });
      const caller = customTasksRouter.createCaller(context);

      await expectNotFound(
        action === "delete"
          ? caller.delete({ taskId: 41 })
          : caller.complete({ taskId: 41 }),
      );
    },
  );

  it.each(["sendMessage", "markReviewed"] as const)(
    "rejects AI %s for another child",
    async (action) => {
      dbMocks.getChildAiConversation.mockResolvedValue({
        id: 12,
        childAccountId: 99,
        messages: [],
      });
      const caller = childAiChatRouter.createCaller(context);

      await expectNotFound(
        action === "sendMessage"
          ? caller.sendMessage({
              conversationId: 12,
              childAccountId: 99,
              message: "Private",
            })
          : caller.markReviewed({ conversationId: 12 }),
      );
    },
  );

  it.each(["sendMessage", "delete"] as const)(
    "rejects consultation %s for another parent",
    async (action) => {
      dbMocks.getParentAiConsultation.mockResolvedValue({
        id: 5,
        parentId: 8,
        messages: [],
      });
      const caller = parentAiConsultRouter.createCaller(context);

      await expectNotFound(
        action === "sendMessage"
          ? caller.sendMessage({
              consultationId: 5,
              message: "Private",
              consultationType: "child",
            })
          : caller.delete({ consultationId: 5 }),
      );
    },
  );
});
