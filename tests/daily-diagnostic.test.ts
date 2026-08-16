import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted, same pattern as tests/child-monitoring-authorization.test.ts) ──
const dbMocks = vi.hoisted(() => ({
  getDiagnosticCheckinForToday: vi.fn(),
  claimDiagnosticCheckin: vi.fn(),
  reclaimStaleDiagnosticCheckin: vi.fn(),
  fillDiagnosticCheckin: vi.fn(),
  saveDiagnosticAnswers: vi.fn(),
  getRecentDiagnosticSignals: vi.fn(),
  getPartnerOfUser: vi.fn(),
  getSpouseInteractionData: vi.fn(),
  createSpouseAdvice: vi.fn(),
}));
const invokeLLMMock = vi.hoisted(() => vi.fn());

vi.mock("../server/db", () => dbMocks);
vi.mock("../server/_core/llm", () => ({ invokeLLM: invokeLLMMock }));

import {
  DIAGNOSTIC_CATEGORIES,
  buildFallbackQuestions,
  parseGeneratedQuestions,
  buildGenerationPrompt,
  summarizeSignals,
  buildPartnerSignalContext,
  childrenAgesFromProfile,
  dailyDiagnosticRouter,
  LOSER_POLL_ATTEMPTS,
  LOSER_POLL_DELAY_MS,
} from "../server/daily-diagnostic";
import { adviceRouter } from "../server/advice";

// submitAnswers now rejects any date that isn't "today" (server-computed),
// so tests must use the real current date rather than a stale hardcoded
// literal that would only pass by coincidence on one specific day.
const TODAY = new Date().toISOString().slice(0, 10);

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

function llmContent(payload: unknown) {
  return { choices: [{ message: { content: JSON.stringify(payload) } }] };
}

function validGenerated(): import("../server/daily-diagnostic").DiagnosticQuestion[] {
  return [
    { category: "prayer", text: "كيف كانت صلاتك اليوم؟", options: [
      { label: "أديتها كاملة في وقتها", tone: "positive" },
      { label: "فاتتني صلاة أو أكثر", tone: "needs_support" },
    ] },
    { category: "psychological", text: "كيف كانت حالتك النفسية اليوم؟", options: [
      { label: "مرتاح البال", tone: "positive" },
      { label: "متوتر", tone: "needs_support" },
    ] },
    { category: "physical", text: "كيف كانت حالتك الجسدية اليوم؟", options: [
      { label: "نشيط", tone: "positive" },
      { label: "متعب", tone: "needs_support" },
    ] },
    { category: "children", text: "كيف كان تعاملك مع الأبناء اليوم؟", options: [
      { label: "صبور معهم", tone: "positive" },
      { label: "قصّرت معهم", tone: "needs_support" },
    ] },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default to "the write actually happened" (the common case) — tests that
  // specifically exercise the conditional-write race override these with
  // `false` for that one call.
  dbMocks.fillDiagnosticCheckin.mockResolvedValue(true);
  dbMocks.saveDiagnosticAnswers.mockResolvedValue(true);
});

// ============================================================
// Pure functions — no mocking needed
// ============================================================

describe("buildFallbackQuestions", () => {
  it("always returns exactly one question per required category", () => {
    for (const gender of ["man", "vrouw", ""] as const) {
      for (const lang of ["ar", "nl", "en"] as const) {
        const qs = buildFallbackQuestions(gender, lang);
        expect(qs).toHaveLength(4);
        expect(new Set(qs.map((q) => q.category))).toEqual(new Set(DIAGNOSTIC_CATEGORIES));
        for (const q of qs) {
          expect(q.text.length).toBeGreaterThan(0);
          expect(q.options.length).toBeGreaterThanOrEqual(2);
          expect(q.options.length).toBeLessThanOrEqual(4);
          for (const o of q.options) {
            expect(["positive", "neutral", "needs_support"]).toContain(o.tone);
            expect(o.label.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("is pure/deterministic", () => {
    expect(buildFallbackQuestions("man", "ar")).toEqual(buildFallbackQuestions("man", "ar"));
  });

  it("writes Arabic fallback copy with no Latin letters (no nl/en leaking)", () => {
    const qs = buildFallbackQuestions("vrouw", "ar");
    for (const q of qs) {
      expect(q.text).not.toMatch(/[a-zA-Z]/);
      for (const o of q.options) expect(o.label).not.toMatch(/[a-zA-Z]/);
    }
  });

  it("genders the option wording for man vs vrouw", () => {
    const manQs = buildFallbackQuestions("man", "ar");
    const vrouwQs = buildFallbackQuestions("vrouw", "ar");
    // At least one category's options must differ by gendered Arabic adjective endings (ة)
    const manPhysical = manQs.find((q) => q.category === "physical")!.options.map((o) => o.label).join("|");
    const vrouwPhysical = vrouwQs.find((q) => q.category === "physical")!.options.map((o) => o.label).join("|");
    expect(manPhysical).not.toEqual(vrouwPhysical);
  });
});

describe("parseGeneratedQuestions", () => {
  it("parses a well-formed model response", () => {
    const parsed = parseGeneratedQuestions(JSON.stringify(validGenerated()));
    expect(parsed).toHaveLength(4);
    expect(parsed![0].category).toBe("prayer");
  });

  it("strips a markdown code fence around the JSON", () => {
    const fenced = "```json\n" + JSON.stringify(validGenerated()) + "\n```";
    expect(parseGeneratedQuestions(fenced)).toHaveLength(4);
  });

  it("rejects unparseable JSON", () => {
    expect(parseGeneratedQuestions("not json at all")).toBeNull();
  });

  it("rejects a set missing a required category", () => {
    const bad = validGenerated().filter((q) => q.category !== "children");
    expect(parseGeneratedQuestions(JSON.stringify(bad))).toBeNull();
  });

  it("rejects a duplicate category even if length is 4", () => {
    const bad = validGenerated().slice(0, 3);
    bad.push({ ...bad[0] });
    expect(parseGeneratedQuestions(JSON.stringify(bad))).toBeNull();
  });

  it("rejects an invalid tone value", () => {
    const bad = validGenerated();
    (bad[0].options[0] as any).tone = "bad_tone";
    expect(parseGeneratedQuestions(JSON.stringify(bad))).toBeNull();
  });

  it("rejects an option label that reads like free text (too long)", () => {
    const bad = validGenerated();
    bad[0].options[0].label = "س".repeat(61);
    expect(parseGeneratedQuestions(JSON.stringify(bad))).toBeNull();
  });

  it("rejects a question with fewer than 2 options", () => {
    const bad = validGenerated();
    bad[0].options = [bad[0].options[0]];
    expect(parseGeneratedQuestions(JSON.stringify(bad))).toBeNull();
  });

  it("rejects duplicate option labels within a question (would collide as React keys)", () => {
    const bad = validGenerated();
    bad[0].options = [bad[0].options[0], { ...bad[0].options[0] }];
    expect(parseGeneratedQuestions(JSON.stringify(bad))).toBeNull();
  });

  it("rejects an empty question text", () => {
    const bad = validGenerated();
    bad[0].text = "";
    expect(parseGeneratedQuestions(JSON.stringify(bad))).toBeNull();
  });
});

describe("buildGenerationPrompt", () => {
  it("names every required category so the model can't drop one", () => {
    const { system } = buildGenerationPrompt({ gender: "man", lang: "ar", childrenAges: [4, 7] });
    for (const cat of DIAGNOSTIC_CATEGORIES) expect(system).toContain(cat);
  });

  it("instructs JSON-only output", () => {
    const { system } = buildGenerationPrompt({ gender: "man", lang: "ar", childrenAges: [] });
    expect(system.toUpperCase()).toContain("JSON");
  });

  it("carries only the answering user's own gender/children — never a partner field", () => {
    const { user } = buildGenerationPrompt({ gender: "vrouw", lang: "en", childrenAges: [10] });
    expect(user).not.toMatch(/partner/i);
  });
});

describe("summarizeSignals", () => {
  it("returns an empty summary for no rows", () => {
    expect(summarizeSignals([])).toEqual({});
  });

  it("takes the most recent day's tone per category (rows given most-recent-first)", () => {
    const rows = [
      { answers: [{ category: "prayer", label: "x", tone: "positive" }] }, // most recent
      { answers: [{ category: "prayer", label: "y", tone: "needs_support" }] }, // older
    ];
    expect(summarizeSignals(rows as any)).toEqual({ prayer: "positive" });
  });

  it("skips unanswered days and null answers", () => {
    const rows = [{ answers: null }, { answers: [{ category: "physical", label: "x", tone: "neutral" }] }];
    expect(summarizeSignals(rows as any)).toEqual({ physical: "neutral" });
  });

  it("leaves a never-answered category absent from the summary", () => {
    const rows = [{ answers: [{ category: "prayer", label: "x", tone: "positive" }] }];
    const summary = summarizeSignals(rows as any);
    expect(summary.children).toBeUndefined();
  });

  it("ignores a malformed entry instead of trusting the raw JSON column", () => {
    const rows = [{ answers: [{ category: "not_a_real_category", label: "x", tone: "positive" }] }];
    expect(summarizeSignals(rows as any)).toEqual({});
  });
});

describe("childrenAgesFromProfile", () => {
  it("returns no ages when there are no children", () => {
    expect(childrenAgesFromProfile({ children: [] })).toEqual([]);
    expect(childrenAgesFromProfile(null)).toEqual([]);
  });

  it("computes whole-year ages from birthDate", () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const ages = childrenAgesFromProfile({ children: [{ birthDate: tenYearsAgo.toISOString().slice(0, 10) }] });
    expect(ages).toEqual([10]);
  });

  it("drops children with a missing or invalid birthDate rather than crashing", () => {
    expect(childrenAgesFromProfile({ children: [{ name: "no birthdate" }, { birthDate: "not-a-date" }] })).toEqual([]);
  });
});

describe("buildPartnerSignalContext", () => {
  it("returns an empty string when there is nothing to say", () => {
    expect(buildPartnerSignalContext({}, "ar")).toBe("");
  });

  it("mentions the category and tone, never any option label text", () => {
    const text = buildPartnerSignalContext({ prayer: "needs_support" }, "ar");
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/[a-zA-Z]/); // Arabic-only, no leaked labels or Latin scaffolding
  });
});

// ============================================================
// Router — mocked db + mocked invokeLLM (never calls a real model)
// ============================================================

describe("dailyDiagnosticRouter.getToday", () => {
  it("falls back to the static question set when generation throws, and never leaves the check-in empty", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue({ id: 1, userId: 1, date: TODAY, source: "pending" });
    invokeLLMMock.mockRejectedValue(new Error("network down"));

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(result.source).toBe("fallback");
    expect(result.questions).toHaveLength(4);
    expect(dbMocks.fillDiagnosticCheckin).toHaveBeenCalledWith(1, expect.any(Array), "fallback");
  });

  it("falls back when the model returns malformed JSON", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue({ id: 1, userId: 1, date: TODAY, source: "pending" });
    invokeLLMMock.mockResolvedValue(llmContent("not the shape we asked for"));

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(result.source).toBe("fallback");
    expect(result.questions).toHaveLength(4);
  });

  it("uses the generated questions when the model returns a valid set", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue({ id: 1, userId: 1, date: TODAY, source: "pending" });
    invokeLLMMock.mockResolvedValue(llmContent(validGenerated()));

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(result.source).toBe("generated");
    expect(result.questions[0].category).toBe("prayer");
    expect(dbMocks.fillDiagnosticCheckin).toHaveBeenCalledWith(1, validGenerated(), "generated");
  });

  it("never calls the model twice in one day — returns the cached row instead", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue({
      id: 5,
      userId: 1,
      date: TODAY,
      questions: validGenerated(),
      answers: null,
      source: "generated",
    });

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(invokeLLMMock).not.toHaveBeenCalled();
    expect(dbMocks.claimDiagnosticCheckin).not.toHaveBeenCalled();
    expect(result.questions).toHaveLength(4);
  });

  it("never calls the paid model for the losing side of a concurrent race, and still gets nothing to submit only when the winner never shows up", async () => {
    // Simulates two near-simultaneous getToday calls for the same fresh
    // user+day: neither sees an existing row, but only one wins the claim.
    // The winner's row never actually appears in this test (getDiagnosticCheckinForToday
    // stays null throughout), so the loser's poll exhausts and it serves the
    // last-resort unpersisted fallback — see the next test for the recovery path.
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    invokeLLMMock.mockResolvedValue(llmContent(validGenerated()));

    dbMocks.claimDiagnosticCheckin.mockResolvedValueOnce({ id: 1, userId: 1, date: TODAY, source: "pending" }); // winner
    dbMocks.claimDiagnosticCheckin.mockResolvedValueOnce(null); // loser: unique index rejected the second insert

    const winnerResult = await dailyDiagnosticRouter.createCaller(context()).getToday();

    vi.useFakeTimers();
    try {
      const loserPromise = dailyDiagnosticRouter.createCaller(context()).getToday();
      await vi.advanceTimersByTimeAsync(LOSER_POLL_DELAY_MS * LOSER_POLL_ATTEMPTS);
      const loserResult = await loserPromise;

      expect(invokeLLMMock).toHaveBeenCalledTimes(1); // NOT 2 — this is the money guarantee
      expect(winnerResult.source).toBe("generated");
      expect(loserResult.source).toBe("fallback");
      expect(dbMocks.fillDiagnosticCheckin).toHaveBeenCalledTimes(1); // loser never persists anything
    } finally {
      vi.useRealTimers();
    }
  });

  it("polls briefly and picks up the winner's row once it lands, instead of serving an unsubmittable fallback", async () => {
    const winningRow = { id: 9, userId: 1, date: TODAY, questions: validGenerated(), answers: null, source: "generated" };
    // First read (before claiming) sees nothing; the row only appears once
    // polling starts, simulating the winner finishing generation mid-poll.
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValueOnce(null).mockResolvedValue(winningRow);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue(null); // lost the claim race

    vi.useFakeTimers();
    try {
      const promise = dailyDiagnosticRouter.createCaller(context()).getToday();
      await vi.advanceTimersByTimeAsync(LOSER_POLL_DELAY_MS);
      const result = await promise;

      expect(invokeLLMMock).not.toHaveBeenCalled();
      expect(result.source).toBe("generated");
      expect(result.questions).toEqual(validGenerated()); // the winner's real, submittable row
    } finally {
      vi.useRealTimers();
    }
  });

  it("never calls the paid model when the DB is unavailable to claim against (would otherwise retry-storm during an outage)", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue(null); // db.ts: getDb() returned null

    vi.useFakeTimers();
    try {
      const promise = dailyDiagnosticRouter.createCaller(context()).getToday();
      await vi.advanceTimersByTimeAsync(LOSER_POLL_DELAY_MS * LOSER_POLL_ATTEMPTS);
      const result = await promise;

      expect(invokeLLMMock).not.toHaveBeenCalled();
      expect(result.source).toBe("fallback");
      expect(result.questions).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("takes over a stale pending claim (crashed owner) after polling finds nothing, instead of leaving the day stuck all day", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null); // never completes -- the "crashed" claimant's row never fills in
    dbMocks.claimDiagnosticCheckin.mockResolvedValue(null); // lost the original claim
    dbMocks.reclaimStaleDiagnosticCheckin.mockResolvedValue({ id: 7, userId: 1, date: TODAY, source: "pending" });
    invokeLLMMock.mockResolvedValue(llmContent(validGenerated()));

    vi.useFakeTimers();
    try {
      const promise = dailyDiagnosticRouter.createCaller(context()).getToday();
      await vi.advanceTimersByTimeAsync(LOSER_POLL_DELAY_MS * LOSER_POLL_ATTEMPTS);
      const result = await promise;

      expect(invokeLLMMock).toHaveBeenCalledTimes(1);
      expect(dbMocks.fillDiagnosticCheckin).toHaveBeenCalledWith(7, validGenerated(), "generated");
      expect(result.source).toBe("generated");
      expect(result.questions).toEqual(validGenerated());
    } finally {
      vi.useRealTimers();
    }
  });

  it("trusts the persisted row, not its own local generation, when its fillDiagnosticCheckin write loses a race (the original claimant was slow, not actually dead)", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue({ id: 1, userId: 1, date: TODAY, source: "pending" });
    invokeLLMMock.mockResolvedValue(llmContent(validGenerated()));
    dbMocks.fillDiagnosticCheckin.mockResolvedValue(false); // someone else already filled this row first

    const persisted = { id: 1, userId: 1, date: TODAY, questions: buildFallbackQuestions("man", "nl"), answers: null, source: "fallback" };
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValueOnce(null); // initial check
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValueOnce(persisted); // re-read after the lost write

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(result.source).toBe("fallback"); // what's actually stored, not this request's own "generated" attempt
    expect(result.questions).toEqual(buildFallbackQuestions("man", "nl"));
  });

  it("still serves an unpersisted fallback, honestly, when neither a winner nor a stale claim is found", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue(null);
    dbMocks.reclaimStaleDiagnosticCheckin.mockResolvedValue(null); // not stale yet -- still within the generous window

    vi.useFakeTimers();
    try {
      const promise = dailyDiagnosticRouter.createCaller(context()).getToday();
      await vi.advanceTimersByTimeAsync(LOSER_POLL_DELAY_MS * LOSER_POLL_ATTEMPTS);
      const result = await promise;

      expect(invokeLLMMock).not.toHaveBeenCalled();
      expect(result.source).toBe("fallback");

      // Documented residual limitation: this specific unpersisted fallback
      // cannot be submitted (its labels don't match any stored row) — the
      // user must reopen once the real row is ready. Proven, not silent.
      dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null); // still no row for that date
      await expect(
        dailyDiagnosticRouter.createCaller(context()).submitAnswers({
          date: result.date,
          answers: result.questions.map((q) => ({ category: q.category, ...q.options[0] })),
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("also fails honestly (BAD_REQUEST, not a silent corruption) when the loser's unpersisted fallback collides with a row the winner DID finish and persist", async () => {
    // The more likely real-world variant of the limitation above: the
    // winner's row exists by the time the user submits, just with different
    // labels than the loser's client is showing (see server/db.ts:437's
    // fillDiagnosticCheckin condition — the winner's write is what stands).
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue(null);
    dbMocks.reclaimStaleDiagnosticCheckin.mockResolvedValue(null);

    vi.useFakeTimers();
    let result: any;
    try {
      const promise = dailyDiagnosticRouter.createCaller(context()).getToday();
      await vi.advanceTimersByTimeAsync(LOSER_POLL_DELAY_MS * LOSER_POLL_ATTEMPTS);
      result = await promise;
    } finally {
      vi.useRealTimers();
    }
    expect(result.source).toBe("fallback");

    // Now the winner's generation actually lands, persisted under the SAME
    // date, with different question/option content than what this user saw.
    const winnersRow = { id: 3, userId: 1, date: result.date, questions: validGenerated(), answers: null, source: "generated" };
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(winnersRow);

    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({
        date: result.date,
        answers: result.questions.map((q: any) => ({ category: q.category, ...q.options[0] })),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.saveDiagnosticAnswers).not.toHaveBeenCalled();
  });
});

describe("dailyDiagnosticRouter.submitAnswers", () => {
  const todayRow = {
    id: 5,
    userId: 1,
    date: TODAY,
    questions: validGenerated(),
    answers: null,
    source: "generated",
  };

  it("rejects submitting against a still-pending (not yet generated) row", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue({ ...todayRow, questions: [], source: "pending" });

    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({
        date: TODAY,
        answers: validGenerated().map((q) => ({ category: q.category, ...q.options[0] })),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dbMocks.saveDiagnosticAnswers).not.toHaveBeenCalled();
  });

  it("rejects re-submitting a day that was already answered (no rewriting history)", async () => {
    const already = { ...todayRow, answers: validGenerated().map((q) => ({ category: q.category, ...q.options[0] })) };
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(already);

    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({
        date: TODAY,
        answers: validGenerated().map((q) => ({ category: q.category, ...q.options[1] })), // different answers this time
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.saveDiagnosticAnswers).not.toHaveBeenCalled();
  });

  it("rejects when it loses a race against a concurrent submit for the same day (both read answers===null, only one write can win)", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(todayRow); // both requests see answers: null
    dbMocks.saveDiagnosticAnswers.mockResolvedValue(false); // the other request's write already landed first

    const answers = validGenerated().map((q) => ({ category: q.category, ...q.options[0] }));
    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({ date: TODAY, answers }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("saves an answer set that matches the stored options exactly", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(todayRow);

    const answers = validGenerated().map((q) => ({
      category: q.category,
      label: q.options[0].label,
      tone: q.options[0].tone,
    }));
    const result = await dailyDiagnosticRouter
      .createCaller(context())
      .submitAnswers({ date: TODAY, answers });

    expect(result).toEqual({ success: true });
    expect(dbMocks.saveDiagnosticAnswers).toHaveBeenCalledWith(5, answers);
  });

  it("rejects an answer whose label was never one of the stored options (tampered client)", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(todayRow);

    // All 4 categories present (so this fails on label-matching specifically,
    // not on the separate category-completeness check).
    const answers = validGenerated().map((q) => ({ category: q.category, label: q.options[0].label, tone: q.options[0].tone }));
    answers[0] = { category: "prayer", label: "إجابة مختلقة لم تُعرض قط", tone: "positive" as const };
    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({ date: TODAY, answers } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.saveDiagnosticAnswers).not.toHaveBeenCalled();
  });

  it("rejects two answers for the same category with a category left out", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(todayRow);

    const prayerQ = validGenerated().find((q) => q.category === "prayer")!;
    const answers = [
      { category: "prayer" as const, label: prayerQ.options[0].label, tone: prayerQ.options[0].tone },
      { category: "prayer" as const, label: prayerQ.options[1].label, tone: prayerQ.options[1].tone },
      // physical/psychological/children omitted entirely
    ];
    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({ date: TODAY, answers }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.saveDiagnosticAnswers).not.toHaveBeenCalled();
  });

  it("rejects when there is no question row for that date", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);

    const answers = [{ category: "prayer", label: "أديتها كاملة في وقتها", tone: "positive" }];
    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({ date: TODAY, answers } as any),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dbMocks.saveDiagnosticAnswers).not.toHaveBeenCalled();
  });

  it("rejects an empty answer set (would otherwise mark the day done with nothing recorded)", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(todayRow);

    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({ date: TODAY, answers: [] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.saveDiagnosticAnswers).not.toHaveBeenCalled();
  });
});

// ============================================================
// getSpouseAdvice — the hard privacy constraint, proven concretely
// ============================================================

describe("getSpouseAdvice never lets the partner's raw answer text reach the prompt", () => {
  const SECRET = "MARKER_SECRET_TEXT_ZZZ_do_not_leak";

  beforeEach(() => {
    dbMocks.getPartnerOfUser.mockResolvedValue({ id: 2, name: "Partner", profileData: {} });
    dbMocks.getSpouseInteractionData.mockResolvedValue({
      goals: [], conversations: [], messages: [], profileData: {}, childrenData: [],
    });
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([
      { answers: [{ category: "prayer", label: SECRET, tone: "needs_support" }] },
    ]);
    dbMocks.createSpouseAdvice.mockResolvedValue(1);
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: "نصيحة تجريبية" } }] });
  });

  it("keeps the raw option label out of the prompt sent to the model", async () => {
    await adviceRouter.createCaller(context()).getSpouseAdvice({ language: "ar" });

    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
    const sentPrompt = JSON.stringify(invokeLLMMock.mock.calls[0][0]);
    expect(sentPrompt).not.toContain(SECRET);
  });

  it("still wires the coarse category+tone signal into the prompt (presence, not just absence)", async () => {
    await adviceRouter.createCaller(context()).getSpouseAdvice({ language: "ar" });

    const sentPrompt = JSON.stringify(invokeLLMMock.mock.calls[0][0]);
    // Arabic prompt (lang: "ar") -> the category surfaces as its Arabic label.
    expect(sentPrompt).toContain("الصلاة");
    expect(sentPrompt).toContain("بحاجة إلى دعم");
  });

  it("never puts the raw label in what goes back to the requesting spouse either", async () => {
    const result = await adviceRouter.createCaller(context()).getSpouseAdvice({ language: "ar" });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
