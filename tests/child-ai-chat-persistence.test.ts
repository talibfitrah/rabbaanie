import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fake standing in for the child_ai_conversations table, so a
// createConversation -> sendMessage -> getConversation sequence behaves like
// it would against real Postgres: an id minted by create() is the id a later
// get()/update() actually finds. Mirrors tests/child-monitoring-authorization.test.ts's
// vi.hoisted db-mock pattern.
const { dbMocks, conversations } = vi.hoisted(() => {
  const conversations = new Map<number, any>();
  return {
    conversations,
    dbMocks: {
      getChildAccountForParent: vi.fn(),
      createChildAiConversation: vi.fn(async (data: any) => {
        const id = conversations.size + 1;
        conversations.set(id, { id, ...data, title: null });
        return { id };
      }),
      getChildAiConversation: vi.fn(async (id: number) => conversations.get(id) ?? null),
      updateChildAiConversation: vi.fn(async (id: number, data: any) => {
        const existing = conversations.get(id);
        if (existing) conversations.set(id, { ...existing, ...data });
      }),
    },
  };
});

vi.mock("../server/db", () => dbMocks);
vi.mock("../server/_core/llm", () => ({ invokeLLM: vi.fn() }));

import { childAiChatRouter } from "../server/child-monitoring-router";
import { invokeLLM } from "../server/_core/llm";

// app/child-account/ask-ai.tsx is a React Native screen; importing it for its
// exported resolveConversationId still runs its module-level imports, so those
// need stubbing the same way tests/treatment-renderer.test.ts stubs react-native
// for components/treatment-plan-renderer.tsx. resolveConversationId itself is
// never invoked here except by the test below, so every stub is a trivial
// no-op shape.
vi.mock("react-native", () => ({
  Text: "Text",
  View: "View",
  ScrollView: "ScrollView",
  TouchableOpacity: "TouchableOpacity",
  TextInput: "TextInput",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "ios" },
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: vi.fn(), useRouter: vi.fn() }));
vi.mock("@/components/screen-container", () => ({ ScreenContainer: "ScreenContainer" }));
vi.mock("@/hooks/use-colors", () => ({ useColors: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useI18n: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("@/lib/app-usage-tracker", () => ({ startScreenTracking: vi.fn(), endScreenTracking: vi.fn() }));
vi.mock("@/components/report-ai-content", () => ({ ReportAiContent: "ReportAiContent" }));

import { resolveConversationId, runExclusive } from "@/app/child-account/ask-ai";

const context = { req: {} as any, res: {} as any, user: { id: 7 } as any };
const CHILD_ACCOUNT_ID = 99;

describe("child AI chat: persistence (job 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversations.clear();
    dbMocks.getChildAccountForParent.mockResolvedValue({ id: CHILD_ACCOUNT_ID, parentId: 7 });
    (invokeLLM as any).mockResolvedValue({ choices: [{ message: { content: "Wa alaykum salaam!" } }] });
  });

  // This is the exact sequence the unfixed app/child-account/ask-ai.tsx made:
  // it never calls createConversation, so conversationId stays its initial
  // state (0) for the very first message and forever after, because the
  // mutation's onSuccess handler also reads a "conversationId" field the
  // server response never contains.
  it("root cause: sendMessage with no prior createConversation call persists nothing", async () => {
    const caller = childAiChatRouter.createCaller(context);

    await expect(
      caller.sendMessage({
        conversationId: 0,
        childAccountId: CHILD_ACCOUNT_ID,
        message: "Salaam, mag ik iets vragen?",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(invokeLLM).not.toHaveBeenCalled();
    expect(dbMocks.updateChildAiConversation).not.toHaveBeenCalled();
    expect(conversations.size).toBe(0);
  });

  // The fixed sequence: mint a real conversationId first, then send. Asserts
  // the exchange is actually retrievable afterwards (not merely that nothing
  // threw) -- both the child's question and the AI's reply must be readable
  // back from a fresh getConversation call, the same way a parent reviewing
  // the conversation later would read it.
  it("fix: createConversation then sendMessage persists a conversation retrievable via getConversation", async () => {
    const caller = childAiChatRouter.createCaller(context);

    const { id: conversationId } = await caller.createConversation({
      childAccountId: CHILD_ACCOUNT_ID,
    });
    expect(conversationId).toBeTruthy();

    const result = await caller.sendMessage({
      conversationId: conversationId!,
      childAccountId: CHILD_ACCOUNT_ID,
      message: "Salaam, mag ik iets vragen?",
    });
    expect(result.response).toBe("Wa alaykum salaam!");

    const stored = await caller.getConversation({ conversationId: conversationId! });
    const roles = (stored.messages as any[]).map((m) => m.role);
    const contents = (stored.messages as any[]).map((m) => m.content);
    expect(roles).toEqual(["user", "assistant"]);
    expect(contents).toEqual(["Salaam, mag ik iets vragen?", "Wa alaykum salaam!"]);
  });

  // The actual fixed client orchestration (ask-ai.tsx's exported
  // resolveConversationId, not a hand-simulated stand-in for it) driving the
  // real server procedures end to end: no conversationId known yet, exactly
  // like a child's very first message today.
  it("client fix end-to-end: resolveConversationId + sendMessage against the real router persists and is retrievable", async () => {
    const caller = childAiChatRouter.createCaller(context);

    const activeId = await resolveConversationId(
      null,
      CHILD_ACCOUNT_ID,
      (input) => caller.createConversation(input),
    );
    expect(activeId).toBeTruthy();

    await caller.sendMessage({
      conversationId: activeId!,
      childAccountId: CHILD_ACCOUNT_ID,
      message: "Wat is de eerste zuil van de Islam?",
    });

    const stored = await caller.getConversation({ conversationId: activeId! });
    expect((stored.messages as any[]).map((m) => m.content)).toEqual([
      "Wat is de eerste zuil van de Islam?",
      "Wa alaykum salaam!",
    ]);
  });

  // A second message in the same screen session must accumulate onto the
  // same conversation, not mint a fresh one each time -- resolveConversationId
  // takes this branch once conversationId state is no longer null.
  it("a second message in the same session reuses the conversation instead of creating another", async () => {
    const caller = childAiChatRouter.createCaller(context);
    const { id } = await caller.createConversation({ childAccountId: CHILD_ACCOUNT_ID });

    const reusedId = await resolveConversationId(id!, CHILD_ACCOUNT_ID, (input) =>
      caller.createConversation(input),
    );
    expect(reusedId).toBe(id);
    expect(dbMocks.createChildAiConversation).toHaveBeenCalledTimes(1);

    await caller.sendMessage({ conversationId: id!, childAccountId: CHILD_ACCOUNT_ID, message: "Vraag 1" });
    await caller.sendMessage({ conversationId: id!, childAccountId: CHILD_ACCOUNT_ID, message: "Vraag 2" });

    const stored = await caller.getConversation({ conversationId: id! });
    expect((stored.messages as any[]).map((m) => m.content)).toEqual([
      "Vraag 1",
      "Wa alaykum salaam!",
      "Vraag 2",
      "Wa alaykum salaam!",
    ]);
  });
});

// Cubic P3: handleSend became async and awaits resolveConversationId (a
// network createConversation) before sendMutation.mutate. Its top guard
// (`if (!input.trim() || isLoading) return`) reads isLoading from that
// render's closure, which can still be false during that await if a second
// tap lands before React has committed the isLoading=true re-render -- so a
// fast double-tap could fire createConversation twice, minting an extra
// empty conversation. runExclusive is the synchronous (ref-based, not
// state-based) guard handleSend wraps its body in; this drives the real
// exported guard against the real resolveConversationId, not a
// reimplementation of either.
describe("ask-ai double-submit guard: runExclusive", () => {
  it("ignores a second concurrent call that arrives while the first is still resolving its conversation id", async () => {
    const inFlight = { current: false };
    const createConversation = vi.fn(
      () => new Promise<{ id?: number }>((resolve) => setTimeout(() => resolve({ id: 1 }), 10)),
    );
    let sent = 0;
    const send = async () => {
      await resolveConversationId(null, CHILD_ACCOUNT_ID, createConversation);
      sent++;
    };

    // Both "taps" fire before either has resolved -- the real double-tap race.
    await Promise.all([runExclusive(inFlight, send), runExclusive(inFlight, send)]);

    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(sent).toBe(1);
  });

  it("allows a later send once the previous one has finished", async () => {
    const inFlight = { current: false };
    const createConversation = vi.fn(async () => ({ id: 1 }));
    const send = async () => {
      await resolveConversationId(null, CHILD_ACCOUNT_ID, createConversation);
    };

    await runExclusive(inFlight, send);
    await runExclusive(inFlight, send);

    expect(createConversation).toHaveBeenCalledTimes(2);
  });

  it("releases the guard even when the wrapped action throws, so a later tap is not permanently blocked", async () => {
    const inFlight = { current: false };
    const failing = async () => {
      throw new Error("boom");
    };

    await expect(runExclusive(inFlight, failing)).rejects.toThrow("boom");

    expect(inFlight.current).toBe(false);
  });
});
