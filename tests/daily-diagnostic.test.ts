import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted, same pattern as tests/child-monitoring-authorization.test.ts) ──
const dbMocks = vi.hoisted(() => ({
  getDiagnosticCheckinForToday: vi.fn(),
  claimDiagnosticCheckin: vi.fn(),
  fillDiagnosticCheckin: vi.fn(),
  saveDiagnosticAnswers: vi.fn(),
  getRecentDiagnosticSignals: vi.fn(),
  getPartnerOfUser: vi.fn(),
  // getSpouseAdvice (server/advice.ts) switched from getPartnerOfUser to
  // getPartnersOfUser (item 1 polygyny review pass) so it can detect 2+
  // confirmed partners and fail closed instead of guessing. getPartnerOfUser
  // above stays declared (unused by production code now, but the round-8 P2
  // regression test below asserts it's never called, which needs the mock
  // fn to exist).
  getPartnersOfUser: vi.fn(),
  hasConfirmedPartner: vi.fn(),
  getSpouseInteractionData: vi.fn(),
  createSpouseAdvice: vi.fn(),
  // item 3 — full-row counterpart of getRecentDiagnosticSignals, used by
  // getSpouseAdvice ONLY in the hasFullPartnerAccess-gated direction.
  getRecentDiagnosticRows: vi.fn(),
}));
const invokeLLMMock = vi.hoisted(() => vi.fn());

vi.mock("../server/db", () => dbMocks);
vi.mock("../server/_core/llm", () => ({ invokeLLM: invokeLLMMock }));

import {
  DIAGNOSTIC_CATEGORIES,
  buildQuestionsForToday,
  allBankQuestions,
  summarizeSignals,
  buildPartnerSignalContext,
  buildPartnerAnswersContext,
  dailyDiagnosticRouter,
} from "../server/daily-diagnostic";
import { adviceRouter } from "../server/advice";

// submitAnswers rejects any date that isn't "today" (server-computed), so
// tests must use the real current date rather than a stale hardcoded literal
// that would only pass by coincidence on one specific day.
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

// hasPartner defaults to false, matching every pre-existing test in this
// file: dbMocks.hasConfirmedPartner is never mocked true below unless a
// test says so, so getToday's real (read-only) lookup resolves to the
// file-level beforeEach default (false) — this keeps every pre-existing
// call site's "expected" value equal to what the router actually produces.
// getPartnerOfUser is a SEPARATE mock still used by getSpouseAdvice
// (server/advice.ts) further down this file — getToday must never call it
// (round-8 P2 fix: that function's legacy fallback can INSERT a
// partnership row as a side effect of what tRPC declares a `.query`).
function questionsFor(gender: "man" | "vrouw" | "" = "man", lang: "ar" | "nl" | "en" = "ar", date = TODAY, hasPartner = false) {
  return buildQuestionsForToday(gender, lang, date, hasPartner);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.fillDiagnosticCheckin.mockResolvedValue(true);
  dbMocks.saveDiagnosticAnswers.mockResolvedValue(true);
  dbMocks.getPartnerOfUser.mockResolvedValue(null);
  dbMocks.hasConfirmedPartner.mockResolvedValue(false);
});

// ============================================================
// Pure functions — no mocking needed
// ============================================================

describe("buildQuestionsForToday", () => {
  it("always returns exactly one question per required category, for every rotated variant", () => {
    // 30 consecutive dates, not just one — a single date only exercises
    // whichever one variant per category the rotation happens to pick that
    // day. A category-field typo on a non-selected variant would pass a
    // single-date check silently; a month of dates is confirmed (see
    // dateSeed's rolling-hash math) to cycle every variant index for every
    // category in this bank at least once.
    const dates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date("2026-08-01T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    for (const gender of ["man", "vrouw", ""] as const) {
      for (const lang of ["ar", "nl", "en"] as const) {
        for (const date of dates) {
          const qs = buildQuestionsForToday(gender, lang, date);
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
    }
  });

  it("is deterministic: same gender+lang+date always produces the same set", () => {
    expect(buildQuestionsForToday("man", "ar", "2026-08-16")).toEqual(buildQuestionsForToday("man", "ar", "2026-08-16"));
  });

  it("varies across dates so a user doesn't see the same four every day", () => {
    const dates = Array.from({ length: 14 }, (_, i) => {
      const d = new Date("2026-08-01T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const signatures = new Set(dates.map((d) => JSON.stringify(buildQuestionsForToday("man", "ar", d))));
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("writes Arabic copy with no Latin letters (no nl/en leaking)", () => {
    const qs = buildQuestionsForToday("vrouw", "ar", TODAY);
    for (const q of qs) {
      expect(q.text).not.toMatch(/[a-zA-Z]/);
      for (const o of q.options) expect(o.label).not.toMatch(/[a-zA-Z]/);
    }
  });

});

describe("buildQuestionsForToday — spouse-attentiveness gating (P2: a user with no confirmed partner must never be asked about one)", () => {
  // Matches the نتعاهد variants' actual copy in every language: "did you ask
  // your spouse..." (NL "uw partner gevraagd", EN "ask your spouse", AR
  // "سألت زوجتك/زوجك/شريك حياتك"). A content-level scan, not an index-based
  // check, so it also catches a future spousal variant that forgets to
  // register itself as partner-only.
  const SPOUSE_MENTION = /uw partner gevraagd|ask your spouse|سألت (زوجتك|زوجك|شريك حياتك)/;
  const dates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date("2026-08-01T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

  it("never asks about a spouse when hasPartner is false, in any gender/lang, across many dates", () => {
    for (const gender of ["man", "vrouw", ""] as const) {
      for (const lang of ["ar", "nl", "en"] as const) {
        for (const date of dates) {
          const qs = buildQuestionsForToday(gender, lang, date, false);
          for (const q of qs) expect(q.text).not.toMatch(SPOUSE_MENTION);
        }
      }
    }
  });

  it("does still ask about a spouse on some dates when hasPartner is true (proves the exclusion is conditional, not a permanent removal)", () => {
    const sawSpouseQuestion = dates.some((date) =>
      buildQuestionsForToday("man", "ar", date, true).some((q) => SPOUSE_MENTION.test(q.text)),
    );
    expect(sawSpouseQuestion).toBe(true);
  });

  it("still returns exactly one question per required category when hasPartner is false (dropping the spousal variants must not leave a short set)", () => {
    for (const date of dates) {
      const qs = buildQuestionsForToday("man", "ar", date, false);
      expect(qs).toHaveLength(4);
      expect(new Set(qs.map((q) => q.category))).toEqual(new Set(DIAGNOSTIC_CATEGORIES));
    }
  });
});

describe("allBankQuestions — exhaustive content invariants over every phrasing", () => {
  const genders = ["man", "vrouw", ""] as const;
  const langs = ["ar", "nl", "en"] as const;

  it("never mentions family planning / bearing children (إنجاب), in any gender or language", () => {
    for (const gender of genders) {
      for (const lang of langs) {
        for (const q of allBankQuestions(gender, lang)) {
          expect(q.text).not.toMatch(/إنجاب|الحمل|تنجب|family planning|planning to have (a )?child|kinderwens|zwanger/i);
          for (const o of q.options) {
            expect(o.label).not.toMatch(/إنجاب|الحمل|تنجب|family planning|planning to have (a )?child|kinderwens|zwanger/i);
          }
        }
      }
    }
  });

  it("never asks whether the prayer was performed on time, in any prayer-category variant (asked elsewhere on the same screen)", () => {
    // Checked against every variant directly (not sampled dates through the
    // rotation) — a hand-picked date list can miss a variant entirely; see
    // the rotation-coverage test in buildQuestionsForToday for why.
    for (const gender of genders) {
      for (const lang of langs) {
        const prayerQuestions = allBankQuestions(gender, lang).filter((q) => q.category === "prayer");
        expect(prayerQuestions.length).toBeGreaterThan(0);
        for (const q of prayerQuestions) {
          expect(q.text).not.toMatch(/وقتها|فاتتني صلاة|قضاء الصلاة|on time|missed a prayer|op tijd|gemist/i);
        }
      }
    }
  });

  it("gives every question 2-4 options, each with a valid tone, and no free-text field exists on the shape", () => {
    for (const gender of genders) {
      for (const lang of langs) {
        for (const q of allBankQuestions(gender, lang)) {
          expect(q.options.length).toBeGreaterThanOrEqual(2);
          expect(q.options.length).toBeLessThanOrEqual(4);
          for (const o of q.options) {
            expect(["positive", "neutral", "needs_support"]).toContain(o.tone);
            // The DiagnosticOption shape is {label, tone} only — asserting the
            // exact key set is what would catch a free-text field being added.
            expect(Object.keys(o).sort()).toEqual(["label", "tone"]);
          }
        }
      }
    }
  });

  it("never has two options with the same label within one question (would collide as a React key)", () => {
    for (const gender of genders) {
      for (const lang of langs) {
        for (const q of allBankQuestions(gender, lang)) {
          const labels = q.options.map((o) => o.label);
          expect(new Set(labels).size).toBe(labels.length);
        }
      }
    }
  });

  it("a man never sees his spouse referred to as though she were his husband (and the correct wording is present)", () => {
    const manQuestions = allBankQuestions("man", "ar");
    const allText = manQuestions.map((q) => q.text).join(" | ");
    // "زوجك" (your husband) would misgender a man's own wife — the bug this
    // change removes at the root. "زوجتك" (your wife) is the correct noun,
    // and is not a substring of "زوجك" (nor vice versa), so both checks are
    // unambiguous.
    expect(allText).not.toContain("زوجك");
    expect(allText).toContain("زوجتك");
  });

  it("a woman never sees her spouse referred to as though he were her wife (and the correct wording is present)", () => {
    const vrouwQuestions = allBankQuestions("vrouw", "ar");
    const allText = vrouwQuestions.map((q) => q.text).join(" | ");
    expect(allText).not.toContain("زوجتك");
    expect(allText).toContain("زوجك");
  });

  it("genders the option wording for man vs vrouw somewhere in the bank", () => {
    const manLabels = allBankQuestions("man", "ar").flatMap((q) => q.options.map((o) => o.label)).join("|");
    const vrouwLabels = allBankQuestions("vrouw", "ar").flatMap((q) => q.options.map((o) => o.label)).join("|");
    expect(manLabels).not.toEqual(vrouwLabels);
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

describe("buildPartnerAnswersContext (item 3 — full answer labels, caller must gate)", () => {
  it("returns an empty string for no rows", () => {
    expect(buildPartnerAnswersContext([], "ar")).toBe("");
  });

  it("returns an empty string when every row is unanswered", () => {
    const rows = [{ date: "2026-08-16", questions: [], answers: null }];
    expect(buildPartnerAnswersContext(rows, "ar")).toBe("");
  });

  it("includes the actual answer label text (unlike buildPartnerSignalContext)", () => {
    const rows = [
      {
        date: "2026-08-16",
        questions: [{ category: "prayer" as const, text: "كيف كان خشوعك؟", options: [] }],
        answers: [{ category: "prayer" as const, label: "كثير التشتت", tone: "needs_support" as const }],
      },
    ];
    const text = buildPartnerAnswersContext(rows, "ar");
    expect(text).toContain("كثير التشتت");
    expect(text).toContain("كيف كان خشوعك؟");
  });

  it("ignores a malformed answer entry instead of trusting the raw JSON column", () => {
    const rows = [
      {
        date: "2026-08-16",
        questions: [],
        answers: [{ category: "not_a_real_category", label: "SHOULD_NOT_APPEAR", tone: "positive" }],
      },
    ];
    expect(buildPartnerAnswersContext(rows as any, "ar")).not.toContain("SHOULD_NOT_APPEAR");
  });
});

// ============================================================
// Router — mocked db, no LLM involved at all for this module anymore
// ============================================================

describe("dailyDiagnosticRouter.getToday", () => {
  it("creates and persists today's row on first open, with no model call", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue({ id: 1, userId: 1, date: TODAY, source: "pending" });

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(invokeLLMMock).not.toHaveBeenCalled();
    expect(result.questions).toHaveLength(4);
    expect(result.questions).toEqual(questionsFor("man", "ar", TODAY));
    expect(dbMocks.fillDiagnosticCheckin).toHaveBeenCalledWith(1, questionsFor("man", "ar", TODAY), "curated");
  });

  it("P2 fix (round-7): builds with hasPartner=true when the user has a confirmed partner, instead of always false", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue({ id: 1, userId: 1, date: TODAY, source: "pending" });
    dbMocks.hasConfirmedPartner.mockResolvedValue(true);

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(result.questions).toEqual(questionsFor("man", "ar", TODAY, true));
    expect(dbMocks.fillDiagnosticCheckin).toHaveBeenCalledWith(1, questionsFor("man", "ar", TODAY, true), "curated");
  });

  it("never looks up the partner when today's row already exists (fast path — no wasted query on the common case)", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue({
      id: 5,
      userId: 1,
      date: TODAY,
      questions: questionsFor("man", "ar", TODAY),
      answers: null,
      source: "curated",
    });

    await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(dbMocks.hasConfirmedPartner).not.toHaveBeenCalled();
  });

  it("round-8 P2 fix: never calls db.getPartnerOfUser (its legacy fallback can INSERT a partnership row as a side effect) — only the read-only hasConfirmedPartner", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue({ id: 1, userId: 1, date: TODAY, source: "pending" });
    dbMocks.hasConfirmedPartner.mockResolvedValue(true);

    await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(dbMocks.getPartnerOfUser).not.toHaveBeenCalled();
    expect(dbMocks.hasConfirmedPartner).toHaveBeenCalledWith(1);
  });

  it("never calls claimDiagnosticCheckin again once a row already exists for today", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue({
      id: 5,
      userId: 1,
      date: TODAY,
      questions: questionsFor("man", "ar", TODAY),
      answers: null,
      source: "curated",
    });

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(dbMocks.claimDiagnosticCheckin).not.toHaveBeenCalled();
    expect(dbMocks.fillDiagnosticCheckin).not.toHaveBeenCalled();
    expect(result.questions).toHaveLength(4);
  });

  it("returns a pre-existing row's source unchanged (backward compat with rows written before this change)", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue({
      id: 5,
      userId: 1,
      date: TODAY,
      questions: questionsFor("man", "ar", TODAY),
      answers: null,
      source: "generated", // a legacy row from before this change
    });

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();
    expect(result.source).toBe("generated");
  });

  it("fills in a row still stuck in 'pending' (e.g. left over from before this change) instead of leaving the day stuck", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue({ id: 7, userId: 1, date: TODAY, questions: [], answers: null, source: "pending" });

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(dbMocks.claimDiagnosticCheckin).not.toHaveBeenCalled(); // reused the existing pending row instead of inserting a new one
    expect(dbMocks.fillDiagnosticCheckin).toHaveBeenCalledWith(7, questionsFor("man", "ar", TODAY), "curated");
    expect(result.source).toBe("curated");
    expect(result.questions).toEqual(questionsFor("man", "ar", TODAY));
  });

  it("trusts the persisted row, not its own locally-built set, when its own fill loses a race", async () => {
    dbMocks.getDiagnosticCheckinForToday
      .mockResolvedValueOnce(null) // initial check
      .mockResolvedValueOnce({ id: 1, userId: 1, date: TODAY, questions: questionsFor("man", "nl", TODAY), answers: null, source: "curated" }); // re-read after lost write
    dbMocks.claimDiagnosticCheckin.mockResolvedValue({ id: 1, userId: 1, date: TODAY, source: "pending" });
    dbMocks.fillDiagnosticCheckin.mockResolvedValue(false); // someone else already filled this row first

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(result.questions).toEqual(questionsFor("man", "nl", TODAY)); // what's actually stored
  });

  it("still serves an honest, unpersisted question set when the DB can't be claimed against (outage), rather than failing the request", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue(null); // db.ts: getDb() returned null

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(result.questions).toEqual(questionsFor("man", "ar", TODAY));
    expect(result.answers).toBeNull();

    // Documented residual limitation: this specific unpersisted set cannot be
    // submitted (no row exists in the DB under this date) — proven, not silent.
    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({
        date: result.date,
        answers: result.questions.map((q) => ({ category: q.category, ...q.options[0] })),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("re-checks for a persisted row when it loses the race to even CLAIM today's row, not just the race to fill it", async () => {
    // Distinct from the outage test above: here a concurrent peer's insert
    // won AND that peer already finished filling in AND the user already
    // answered on that other device — must surface the peer's real,
    // already-answered row rather than silently reporting "unanswered".
    const peerAnswers = questionsFor("man", "ar", TODAY).map((q) => ({ category: q.category, ...q.options[0] }));
    dbMocks.getDiagnosticCheckinForToday
      .mockResolvedValueOnce(null) // initial check
      .mockResolvedValueOnce({ id: 9, userId: 1, date: TODAY, questions: questionsFor("man", "ar", TODAY), answers: peerAnswers, source: "curated" }); // re-read after losing the claim race
    dbMocks.claimDiagnosticCheckin.mockResolvedValue(null); // lost the claim race (a peer's insert won)

    const result = await dailyDiagnosticRouter.createCaller(context()).getToday();

    expect(dbMocks.fillDiagnosticCheckin).not.toHaveBeenCalled(); // never had a row of our own to fill
    expect(result.answers).toEqual(peerAnswers); // the peer's actually-persisted, already-answered row — not null
  });

  it("respects the requested UI language over the account's stored language", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue({ id: 1, userId: 1, date: TODAY, source: "pending" });

    const result = await dailyDiagnosticRouter.createCaller(context({ language: "nl" })).getToday({ lang: "ar" });

    expect(result.questions).toEqual(questionsFor("man", "ar", TODAY));
  });

  // P3 fix: gender used to be read from profileData.parentProfile.gender
  // only, ignoring the users.gender COLUMN — same column-then-JSON gap
  // resolveGender (server/routers.ts) exists to close elsewhere.
  it("resolves gender from the users.gender COLUMN when the JSON copy is missing (legacy row)", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue({ id: 1, userId: 1, date: TODAY, source: "pending" });

    const result = await dailyDiagnosticRouter
      .createCaller(context({ gender: "vrouw", profileData: { children: [] } }))
      .getToday();

    expect(result.questions).toEqual(questionsFor("vrouw", "ar", TODAY));
  });

  it("prefers the users.gender COLUMN over a conflicting JSON copy", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(null);
    dbMocks.claimDiagnosticCheckin.mockResolvedValue({ id: 1, userId: 1, date: TODAY, source: "pending" });

    const result = await dailyDiagnosticRouter
      .createCaller(context({ gender: "man", profileData: { parentProfile: { gender: "vrouw" }, children: [] } }))
      .getToday();

    expect(result.questions).toEqual(questionsFor("man", "ar", TODAY));
  });
});

describe("dailyDiagnosticRouter.submitAnswers", () => {
  const todayRow = {
    id: 5,
    userId: 1,
    date: TODAY,
    questions: questionsFor("man", "ar", TODAY),
    answers: null,
    source: "curated",
  };

  it("rejects submitting against a still-pending (not yet filled) row", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue({ ...todayRow, questions: [], source: "pending" });

    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({
        date: TODAY,
        answers: questionsFor("man", "ar", TODAY).map((q) => ({ category: q.category, ...q.options[0] })),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dbMocks.saveDiagnosticAnswers).not.toHaveBeenCalled();
  });

  it("rejects re-submitting a day that was already answered (no rewriting history)", async () => {
    const already = { ...todayRow, answers: questionsFor("man", "ar", TODAY).map((q) => ({ category: q.category, ...q.options[0] })) };
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(already);

    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({
        date: TODAY,
        answers: questionsFor("man", "ar", TODAY).map((q) => ({ category: q.category, ...q.options[1] })), // different answers this time
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.saveDiagnosticAnswers).not.toHaveBeenCalled();
  });

  it("rejects when it loses a race against a concurrent submit for the same day (both read answers===null, only one write can win)", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(todayRow); // both requests see answers: null
    dbMocks.saveDiagnosticAnswers.mockResolvedValue(false); // the other request's write already landed first

    const answers = questionsFor("man", "ar", TODAY).map((q) => ({ category: q.category, ...q.options[0] }));
    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({ date: TODAY, answers }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("saves an answer set that matches the stored options exactly", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(todayRow);

    const answers = questionsFor("man", "ar", TODAY).map((q) => ({
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
    const answers = questionsFor("man", "ar", TODAY).map((q) => ({ category: q.category, label: q.options[0].label, tone: q.options[0].tone }));
    answers[0] = { category: "prayer", label: "إجابة مختلقة لم تُعرض قط", tone: "positive" as const };
    await expect(
      dailyDiagnosticRouter.createCaller(context()).submitAnswers({ date: TODAY, answers } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.saveDiagnosticAnswers).not.toHaveBeenCalled();
  });

  it("rejects two answers for the same category with a category left out", async () => {
    dbMocks.getDiagnosticCheckinForToday.mockResolvedValue(todayRow);

    const prayerQ = questionsFor("man", "ar", TODAY).find((q) => q.category === "prayer")!;
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
    // partnershipConfirmed: true — item 5's new confirmation gate (see the
    // describe block below) must not reject the confirmed-partner case
    // these tests exist to cover.
    dbMocks.getPartnersOfUser.mockResolvedValue([{
      id: 2,
      name: "Partner",
      profileData: {},
      partnershipConfirmed: true,
    }]);
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

// ============================================================
// item 3: the husband-ungated / wife-with-grant direction now ALSO feeds
// the partner's actual answer labels (buildPartnerAnswersContext), on top
// of the coarse category+tone signal above (which stays unconditional and
// unchanged in both directions — see the untouched describe block above).
// ============================================================
describe("getSpouseAdvice — full-access direction now feeds the partner's actual answer labels (item 3)", () => {
  const LABEL = "MARKER_FULL_ANSWER_LABEL_ZZZ";

  function wireCommonMocks() {
    dbMocks.getSpouseInteractionData.mockResolvedValue({
      goals: [], conversations: [], messages: [], profileData: {}, childrenData: [],
    });
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([]); // coarse signal: irrelevant here, unaffected either way
    dbMocks.getRecentDiagnosticRows.mockResolvedValue([
      { date: "2026-08-16", questions: [{ category: "prayer", text: "Q", options: [] }], answers: [{ category: "prayer", label: LABEL, tone: "needs_support" }] },
    ]);
    dbMocks.createSpouseAdvice.mockResolvedValue(1);
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: "advice" } }] });
  }

  it("husband (full access, ungated) DOES get her answer label in the prompt", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      { id: 2, name: "Wife", gender: "vrouw", profileData: {}, partnershipConfirmed: true, profileAccessGrantedAt: null },
    ]);
    wireCommonMocks();

    await adviceRouter.createCaller(context()).getSpouseAdvice({ language: "ar" }); // context() defaults to gender "man"

    const sentPrompt = JSON.stringify(invokeLLMMock.mock.calls[0][0]);
    expect(sentPrompt).toContain(LABEL);
    expect(dbMocks.getRecentDiagnosticRows).toHaveBeenCalledWith(2, 7);
  });

  it("wife WITHOUT a grant does NOT get his answer label — the fetch itself is gated, not just the render", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      { id: 2, name: "Husband", gender: "man", profileData: {}, partnershipConfirmed: true, profileAccessGrantedAt: null },
    ]);
    wireCommonMocks();

    await adviceRouter
      .createCaller(context({ gender: "vrouw", profileData: { children: [] } }))
      .getSpouseAdvice({ language: "ar" });

    const sentPrompt = JSON.stringify(invokeLLMMock.mock.calls[0][0]);
    expect(sentPrompt).not.toContain(LABEL);
    expect(dbMocks.getRecentDiagnosticRows).not.toHaveBeenCalled();
  });

  it("wife WITH an active grant DOES get his answer label", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      { id: 2, name: "Husband", gender: "man", profileData: {}, partnershipConfirmed: true, profileAccessGrantedAt: new Date("2026-01-01") },
    ]);
    wireCommonMocks();

    await adviceRouter
      .createCaller(context({ gender: "vrouw", profileData: { children: [] } }))
      .getSpouseAdvice({ language: "ar" });

    const sentPrompt = JSON.stringify(invokeLLMMock.mock.calls[0][0]);
    expect(sentPrompt).toContain(LABEL);
  });

  it("still wires the coarse category+tone signal in unconditionally alongside the labels (no regression)", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      { id: 2, name: "Wife", gender: "vrouw", profileData: {}, partnershipConfirmed: true, profileAccessGrantedAt: null },
    ]);
    dbMocks.getSpouseInteractionData.mockResolvedValue({
      goals: [], conversations: [], messages: [], profileData: {}, childrenData: [],
    });
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([
      { answers: [{ category: "prayer", label: "x", tone: "needs_support" }] },
    ]);
    dbMocks.getRecentDiagnosticRows.mockResolvedValue([]);
    dbMocks.createSpouseAdvice.mockResolvedValue(1);
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: "advice" } }] });

    await adviceRouter.createCaller(context()).getSpouseAdvice({ language: "ar" });

    const sentPrompt = JSON.stringify(invokeLLMMock.mock.calls[0][0]);
    expect(sentPrompt).toContain("الصلاة");
    expect(sentPrompt).toContain("بحاجة إلى دعم");
  });
});

// ============================================================
// Change B: getSpouseAdvice also folds in the REQUESTER's OWN recent
// daily-diagnostic tone (getOwnCheckinContext), mirroring the self-advisors'
// usage (e.g. advice.ts:~1044). Both the partner's coarse signal and the
// requester's own are unconditional (never gated by hasFullAnswerAccess),
// but come from two textually distinct headers (buildPartnerSignalContext
// vs buildOwnSignalContext) so the prompt never confuses whose signal is
// whose.
// ============================================================
describe("getSpouseAdvice folds in the requester's OWN recent check-in tone (change B)", () => {
  it("includes the requester's own check-in signal in the prompt, alongside the partner's", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      { id: 2, name: "Partner", profileData: {}, partnershipConfirmed: true },
    ]);
    dbMocks.getSpouseInteractionData.mockResolvedValue({
      goals: [], conversations: [], messages: [], profileData: {}, childrenData: [],
    });
    // context() below resolves to requester id 1; the partner above is id 2.
    // getOwnCheckinContext and the pre-existing partner-signal block both
    // call db.getRecentDiagnosticSignals — distinguish them by first arg.
    dbMocks.getRecentDiagnosticSignals.mockImplementation((userId: number) => {
      if (userId === 2) return Promise.resolve([{ answers: [{ category: "prayer", label: "x", tone: "positive" }] }]);
      if (userId === 1) return Promise.resolve([{ answers: [{ category: "psychological", label: "y", tone: "needs_support" }] }]);
      return Promise.resolve([]);
    });
    dbMocks.createSpouseAdvice.mockResolvedValue(1);
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: "advice" } }] });

    await adviceRouter.createCaller(context()).getSpouseAdvice({ language: "ar" });

    expect(dbMocks.getRecentDiagnosticSignals).toHaveBeenCalledWith(1, 7); // the requester
    expect(dbMocks.getRecentDiagnosticSignals).toHaveBeenCalledWith(2, 7); // the partner (pre-existing)

    const sentPrompt = JSON.stringify(invokeLLMMock.mock.calls[0][0]);
    // Partner's coarse signal (pre-existing, unconditional):
    expect(sentPrompt).toContain("الصلاة");
    expect(sentPrompt).toContain("بحالة جيدة");
    // The requester's OWN signal (new) under its own distinct header:
    expect(sentPrompt).toContain("إشاراتك الذاتية");
    expect(sentPrompt).toContain("الحالة النفسية");
    expect(sentPrompt).toContain("بحاجة إلى دعم");
  });
});

// ============================================================
// VULNERABILITY (item 5): getSpouseAdvice drew on partner.profileData,
// dailyCheckins, and environments with zero partnershipConfirmed check —
// an unconfirmed "partner" (a pending invite the shared-children legacy
// fallback can hand back, per round-8 P1) got the full treatment. The
// owner's "no grant required" ruling is a SEPARATE axis (see server/
// advice.ts's own comment) and is untouched by this fix.
// ============================================================
describe("getSpouseAdvice requires a CONFIRMED partnership (item 5 fix)", () => {
  it("refuses to generate advice when the partner is not confirmed, and never calls the model", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([{
      id: 2,
      name: "Partner",
      profileData: {},
      partnershipConfirmed: false,
    }]);

    const result: any = await adviceRouter.createCaller(context()).getSpouseAdvice({ language: "ar" });

    expect(result.advice).toBeNull();
    expect(result.error).toBe("not_confirmed");
    expect(invokeLLMMock).not.toHaveBeenCalled();
    expect(dbMocks.getSpouseInteractionData).not.toHaveBeenCalled();
  });

  it("still proceeds normally once the partnership IS confirmed (no regression)", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([{
      id: 2,
      name: "Partner",
      profileData: {},
      partnershipConfirmed: true,
    }]);
    dbMocks.getSpouseInteractionData.mockResolvedValue({
      goals: [], conversations: [], messages: [], profileData: {}, childrenData: [],
    });
    dbMocks.getRecentDiagnosticSignals.mockResolvedValue([]);
    dbMocks.createSpouseAdvice.mockResolvedValue(1);
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: "نصيحة تجريبية" } }] });

    const result: any = await adviceRouter.createCaller(context()).getSpouseAdvice({ language: "ar" });

    expect(result.error).toBeUndefined();
    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
  });
});
