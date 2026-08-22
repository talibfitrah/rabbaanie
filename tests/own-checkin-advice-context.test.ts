// Feature: fold the user's OWN recent daily-diagnostic check-in answers into
// the context of their OWN advice — three surfaces: getGeneralAdvice/
// getWeekPlan/generateTreatmentPlan (server/advice.ts) and startConversation/
// sendMessage/getLiveAdvice (server/ai-chat.ts). Reuses summarizeSignals +
// db.getRecentDiagnosticSignals (server/daily-diagnostic.ts, server/db.ts) —
// the exact machinery getSpouseAdvice already uses for the PARTNER's
// signals — just pointed at the caller's own id instead.
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getRecentDiagnosticSignals: vi.fn(),
}));
const invokeLLMMock = vi.hoisted(() => vi.fn());
const invokeAIChatMock = vi.hoisted(() => vi.fn());

vi.mock("../server/db", () => dbMocks);
vi.mock("../server/_core/llm", () => ({ invokeLLM: invokeLLMMock }));
vi.mock("../server/ai-provider", () => ({ invokeAIChat: invokeAIChatMock }));

import { buildOwnSignalContext, buildPartnerSignalContext, getOwnCheckinContext } from "../server/daily-diagnostic";
import { adviceRouter } from "../server/advice";
import { aiChatRouter } from "../server/ai-chat";

const context = (overrides: any = {}) => ({
  req: {} as any,
  res: {} as any,
  user: {
    id: 1,
    name: "Test User",
    language: "ar",
    profileData: { parentProfile: { gender: "man" }, children: [] },
    ...overrides,
  },
});
const anonContext = { req: {} as any, res: {} as any, user: null };

beforeEach(() => {
  vi.clearAllMocks();
  invokeAIChatMock.mockResolvedValue({ content: "رد تجريبي", provider: "builtin", model: "test" });
});

// ============================================================
// buildOwnSignalContext — pure, mirrors buildPartnerSignalContext's own tests
// ============================================================
describe("buildOwnSignalContext", () => {
  it("returns an empty string for an empty summary", () => {
    expect(buildOwnSignalContext({}, "ar")).toBe("");
  });

  it("reflects the given category and tone, never a raw option label", () => {
    const text = buildOwnSignalContext({ prayer: "needs_support" }, "ar");
    expect(text).toContain("الصلاة");
    expect(text).toContain("بحاجة إلى دعم");
  });

  it("is framed as the user's own signals, not the partner's (distinct from buildPartnerSignalContext)", () => {
    const own = buildOwnSignalContext({ prayer: "positive" }, "en");
    const partner = buildPartnerSignalContext({ prayer: "positive" }, "en");
    expect(own).not.toEqual(partner);
    expect(own.toLowerCase()).not.toContain("partner");
  });
});

// ============================================================
// getOwnCheckinContext — fetch + summarize + format in one call
// ============================================================
describe("getOwnCheckinContext", () => {
  it("returns an empty string and never touches the DB when there is no user id", async () => {
    expect(await getOwnCheckinContext(undefined, "ar")).toBe("");
    expect(await getOwnCheckinContext(null, "ar")).toBe("");
    expect(await getOwnCheckinContext(0, "ar")).toBe("");
    expect(dbMocks.getRecentDiagnosticSignals).not.toHaveBeenCalled();
  });

  it("returns an empty string when the user has no recent check-ins", async () => {
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([]);
    expect(await getOwnCheckinContext(1, "ar")).toBe("");
  });

  it("builds a context string from the user's own recent rows, over the same 7-day window getSpouseAdvice uses", async () => {
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([
      { answers: [{ category: "prayer", label: "SECRET_LABEL_TEXT", tone: "needs_support" }] },
    ]);
    const result = await getOwnCheckinContext(1, "ar");
    expect(result).toContain("الصلاة");
    expect(result).toContain("بحاجة إلى دعم");
    expect(result).not.toContain("SECRET_LABEL_TEXT");
    expect(dbMocks.getRecentDiagnosticSignals).toHaveBeenCalledWith(1, 7);
  });

  it("degrades to an empty string, not a throw, when the DB call fails", async () => {
    dbMocks.getRecentDiagnosticSignals.mockRejectedValue(new Error("db down"));
    await expect(getOwnCheckinContext(1, "ar")).resolves.toBe("");
  });
});

// ============================================================
// advice.ts — the 3 (well, 3 surfaces / 3 call sites within it) prompt
// assemblies. Each test inspects the actual payload sent to invokeLLM, the
// same pattern tests/daily-diagnostic.test.ts already uses for getSpouseAdvice.
// ============================================================
describe("advice.ts: getGeneralAdvice folds in the user's own check-in", () => {
  const input = {
    parentProfile: {},
    childrenCount: 1,
    childrenAges: ["8"],
    season: "summer",
    location: "Amsterdam",
    language: "ar",
  };

  beforeEach(() => {
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: '{"sections":[]}' } }] });
  });

  it("includes the user's own signal when a recent check-in exists", async () => {
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([
      { answers: [{ category: "prayer", label: "x", tone: "needs_support" }] },
    ]);

    await adviceRouter.createCaller(context()).getGeneralAdvice(input);

    const sentPrompt = JSON.stringify(invokeLLMMock.mock.calls[0][0]);
    expect(sentPrompt).toContain("الصلاة");
    expect(dbMocks.getRecentDiagnosticSignals).toHaveBeenCalledWith(1, 7);
  });

  it("sends a byte-identical prompt whether the emptiness comes from 'no stored rows' or 'no user at all' (the additive/no-op invariant)", async () => {
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([]);
    await adviceRouter.createCaller(context()).getGeneralAdvice(input);
    const withEmptyStoredRows = invokeLLMMock.mock.calls[0][0];

    invokeLLMMock.mockClear();
    await adviceRouter.createCaller(anonContext as any).getGeneralAdvice(input);
    const withNoUser = invokeLLMMock.mock.calls[0][0];

    expect(JSON.stringify(withEmptyStoredRows)).toBe(JSON.stringify(withNoUser));
  });
});

describe("advice.ts: getWeekPlan and generateTreatmentPlan (the parenting-advice / weekly-plan path) fold in the user's own check-in", () => {
  const weekPlanInput = {
    childName: "Ahmad",
    childAge: "8",
    childGender: "male",
    yearKey: "y1",
    weekInYear: 1,
    environment: { childId: "c1" },
    parentProfile: {},
    language: "ar",
  };
  const treatmentPlanInput = {
    childName: "Ahmad",
    childAge: "8",
    childGender: "male",
    yearKey: "y1",
    weekInYear: 1,
    issue: "some issue",
    environment: { childId: "c1" },
    parentProfile: {},
    language: "ar",
  };

  beforeEach(() => {
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: "خطة تجريبية" } }] });
  });

  it("getWeekPlan: includes the user's own signal when a recent check-in exists", async () => {
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([
      { answers: [{ category: "children", label: "x", tone: "positive" }] },
    ]);

    await adviceRouter.createCaller(context()).getWeekPlan(weekPlanInput);

    const sentPrompt = JSON.stringify(invokeLLMMock.mock.calls[0][0]);
    expect(sentPrompt).toContain("التعامل مع الأبناء");
    expect(dbMocks.getRecentDiagnosticSignals).toHaveBeenCalledWith(1, 7);
  });

  it("generateTreatmentPlan (mode: plan, the default): includes the user's own signal when a recent check-in exists", async () => {
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([
      { answers: [{ category: "physical", label: "x", tone: "needs_support" }] },
    ]);

    await adviceRouter.createCaller(context()).generateTreatmentPlan(treatmentPlanInput);

    const sentPrompt = JSON.stringify(invokeLLMMock.mock.calls[0][0]);
    expect(sentPrompt).toContain("الحالة الجسدية");
    expect(dbMocks.getRecentDiagnosticSignals).toHaveBeenCalledWith(1, 7);
  });

  it("generateTreatmentPlan's diagnostic-question modes (not 'advice' output) are untouched — no DB call", async () => {
    await adviceRouter.createCaller(context()).generateTreatmentPlan({ ...treatmentPlanInput, mode: "questions" });
    expect(dbMocks.getRecentDiagnosticSignals).not.toHaveBeenCalled();
  });
});

// ============================================================
// ai-chat.ts — the advisor-chat surface. Same invariant, checked against
// what's actually sent to invokeAIChat (systemPrompt is its first arg).
// ============================================================
describe("ai-chat.ts: startConversation/sendMessage/getLiveAdvice fold in the user's own check-in", () => {
  it("startConversation: includes the signal when a recent check-in exists", async () => {
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([
      { answers: [{ category: "prayer", label: "x", tone: "needs_support" }] },
    ]);

    await aiChatRouter.createCaller(context()).startConversation({ initialMessage: "السلام عليكم", language: "ar" });

    const sentSystemPrompt = invokeAIChatMock.mock.calls[0][0];
    expect(sentSystemPrompt).toContain("الصلاة");
    expect(dbMocks.getRecentDiagnosticSignals).toHaveBeenCalledWith(1, 7);
  });

  it("startConversation: prompt unchanged (no-op) when there is no stored check-in", async () => {
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([]);
    await aiChatRouter.createCaller(context()).startConversation({ initialMessage: "السلام عليكم", language: "ar" });
    const withEmptyStoredRows = invokeAIChatMock.mock.calls[0][0];

    invokeAIChatMock.mockClear();
    await aiChatRouter.createCaller(anonContext as any).startConversation({ initialMessage: "السلام عليكم", language: "ar" });
    const withNoUser = invokeAIChatMock.mock.calls[0][0];

    expect(withEmptyStoredRows).toBe(withNoUser);
  });

  it("sendMessage: includes the signal when a recent check-in exists", async () => {
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([]);
    const { conversationId } = await aiChatRouter
      .createCaller(context())
      .startConversation({ initialMessage: "السلام عليكم", language: "ar" });

    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([
      { answers: [{ category: "psychological", label: "x", tone: "positive" }] },
    ]);
    invokeAIChatMock.mockClear();
    await aiChatRouter.createCaller(context()).sendMessage({ conversationId, message: "سؤال", language: "ar" });

    const sentSystemPrompt = invokeAIChatMock.mock.calls[0][0];
    expect(sentSystemPrompt).toContain("الحالة النفسية");
    expect(dbMocks.getRecentDiagnosticSignals).toHaveBeenCalledWith(1, 7);
  });

  it("getLiveAdvice: includes the signal when a recent check-in exists", async () => {
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([
      { answers: [{ category: "prayer", label: "x", tone: "positive" }] },
    ]);

    await aiChatRouter.createCaller(context()).getLiveAdvice({ language: "ar" });

    const sentSystemPrompt = invokeAIChatMock.mock.calls[0][0];
    expect(sentSystemPrompt).toContain("الصلاة");
    expect(dbMocks.getRecentDiagnosticSignals).toHaveBeenCalledWith(1, 7);
  });
});
