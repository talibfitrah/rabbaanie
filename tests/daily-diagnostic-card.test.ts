import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mocking recipe as tests/treatment-renderer.test.ts (its own comment
// explains why): react-native's package entry uses Flow's `import typeof`
// syntax and @expo/vector-icons/MaterialIcons fails its own separate parse,
// so both must be stubbed before this file can import the component at all.
// trpc and ReportAiContent are only ever touched inside the component
// function body (hook calls, JSX) — never at module scope — so importing a
// plain function from this module never executes them; empty stubs are
// enough to satisfy the module's top-level `import` statements.
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@expo/vector-icons/MaterialIcons", () => ({ default: "MaterialIcons" }));
vi.mock("@/components/report-ai-content", () => ({ ReportAiContent: () => null }));
// The card also reads gender (haid tracker's excused-answer hook) via
// useAppState — real @/lib/app-context pulls in @react-native-async-storage
// via lib/store.ts, which this file's own bare-bones "react" mock (no
// createContext/useContext) cannot survive. Same recipe as
// tests/family-calendar-scripture.test.ts. `h.gender` defaults to "man" so
// every pre-existing test below (none of them exercise the excused hook)
// keeps isWoman false, exactly like before this component knew about gender.
vi.mock("@/lib/app-context", () => ({ useAppState: () => ({ state: { parentProfile: { gender: h.gender } } }) }));
// C7: the excused-answer hook now also needs the signed-in user id
// (syncHaidNotifications's userId) — useAuth delegates to a real React
// context (@/lib/auth-context) this file's bare-bones react mock cannot
// support, same reason useAppState above is stubbed rather than imported.
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: h.user }) }));
// C7: syncHaidNotifications is what actually cancels/reschedules the OS
// prayer alarms — stubbed so this file stays a pure unit test of the
// card's own wiring, not lib/haid-notifications' (that module owns its own
// tests/haid-notifications.test.ts).
vi.mock("@/lib/haid-notifications", () => ({
  syncHaidNotifications: (input: unknown) => {
    h.syncCalls.push(input);
    return Promise.resolve({ excused: false });
  },
}));

// The card is also exercised as a component below (the freshness suite), so
// trpc needs more than an empty stub: this fake stands in for the query cache
// and counts invalidations. `vi.hoisted` because vi.mock factories run at
// import time, before a plain `const` in this file has initialised. Same
// recipe as tests/daily-deeds-card.test.ts.
const h = vi.hoisted(() => ({
  query: { data: undefined, isError: false, isLoading: false, isFetching: false } as any,
  // The options this card configures its own query with, and the input every
  // invalidate it performs was addressed to — both are the behaviour under
  // test below, and neither is observable from the returned element tree.
  queryOpts: undefined as any,
  submitOpts: undefined as any,
  invalidateCalls: [] as any[],
  // item B: excused-answer hook fixtures.
  gender: "man" as "man" | "vrouw",
  mine: { data: undefined, isSuccess: false } as any,
  upsertCalls: [] as any[],
  // Overrides the `selected` useState below so a test can simulate "she
  // already tapped an option" without a real renderer/click.
  selectedOverride: undefined as Record<string, { label: string; tone: string }> | undefined,
  // C7: excused-answer hook's post-write sync fixtures.
  user: { id: 7 } as any,
  freshMine: { enabled: true, settings: {}, days: [] } as any,
  syncCalls: [] as any[],
  // logBlood's mock mutate() invokes onSuccess synchronously and stashes
  // whatever it returns here, so a test can await the real (async)
  // onSuccess before asserting on h.syncCalls.
  logBloodOnSuccess: undefined as Promise<unknown> | undefined,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dailyDiagnostic: { getToday: { invalidate: async (input?: unknown) => { h.invalidateCalls.push(input); } } },
      cycle: { getMine: { invalidate: () => {}, fetch: async () => h.freshMine } },
    }),
    dailyDiagnostic: {
      getToday: { useQuery: (_input: unknown, opts?: unknown) => { h.queryOpts = opts; return h.query; } },
      submitAnswers: {
        useMutation: (opts: any) => {
          h.submitOpts = opts;
          return { mutate: () => {}, isPending: false, isError: false };
        },
      },
    },
    // Called unconditionally every render by the excused-answer hook.
    cycle: {
      getMine: { useQuery: () => h.mine },
      upsertDay: {
        useMutation: (opts?: any) => ({
          mutate: (input: any) => {
            h.upsertCalls.push(input);
            h.logBloodOnSuccess = opts?.onSuccess?.();
          },
        }),
      },
    },
  },
}));

// No renderer is installed in this project, so a first render is simulated the
// only way it can be: call the component function with useState pinned to its
// initial value and useEffect run inline — which is exactly what mount does.
// `selectedOverride` lets a test stand in for the one useState call this
// component makes (the `selected` answers map) without a real click.
vi.mock("react", () => ({
  useState: (init: any) => [h.selectedOverride !== undefined ? h.selectedOverride : (typeof init === "function" ? init() : init), () => {}],
  useEffect: (fn: () => void) => { fn(); },
}));

/** Walks a returned element tree collecting every `onPress` handler found. */
function collectOnPress(node: any, acc: Function[] = []): Function[] {
  if (Array.isArray(node)) { node.forEach((n) => collectOnPress(n, acc)); return acc; }
  if (!node || typeof node !== "object") return acc;
  if (typeof node.props?.onPress === "function") acc.push(node.props.onPress);
  collectOnPress(node.props?.children, acc);
  return acc;
}

import { buildReviewSelections, DailyDiagnosticCard } from "@/components/daily-diagnostic-card";

/**
 * Task: reopening an answered daily check-in must show the question view
 * again with the owner's prior answers pre-selected, reusing cached
 * todayQuery.data (no new fetch/generation). buildReviewSelections is the
 * pure transform that turns the server's stored `answers` array into the
 * exact `{ [category]: { label, tone } }` shape the option list's
 * isSelected check reads — pulled out of the component so it's assertable
 * without a renderer (none is installed in this project).
 */
describe("buildReviewSelections — pre-fills the reopened question view from prior answers", () => {
  it("maps each stored answer back to a selection keyed by its category", () => {
    const answers = [
      { category: "prayer", label: "Alle 5 gebeden", tone: "positive" as const },
      { category: "psychological", label: "Gestrest", tone: "needs_support" as const },
      { category: "physical", label: "Moe", tone: "neutral" as const },
      { category: "children", label: "Rustig", tone: "positive" as const },
    ];
    expect(buildReviewSelections(answers)).toEqual({
      prayer: { label: "Alle 5 gebeden", tone: "positive" },
      psychological: { label: "Gestrest", tone: "needs_support" },
      physical: { label: "Moe", tone: "neutral" },
      children: { label: "Rustig", tone: "positive" },
    });
  });

  // The not-yet-answered case (data.answers is null) must never crash the
  // reopen path — it simply never happens (the done card only renders, and
  // can only be tapped, once answers is non-null), but the function must
  // degrade safely rather than throw if ever called before that.
  it("returns an empty object for null/undefined input instead of throwing", () => {
    expect(buildReviewSelections(null)).toEqual({});
    expect(buildReviewSelections(undefined)).toEqual({});
  });

  // Presence, not just absence: a real per-category tone must survive the
  // transform distinctly, not collapse to the same value or bleed into a
  // neighboring category.
  it("keeps each category's own tone distinct — no cross-category leakage", () => {
    const result = buildReviewSelections([
      { category: "prayer", label: "A", tone: "positive" as const },
      { category: "psychological", label: "B", tone: "neutral" as const },
      { category: "physical", label: "C", tone: "needs_support" as const },
    ]);
    expect(result.prayer).toEqual({ label: "A", tone: "positive" });
    expect(result.psychological).toEqual({ label: "B", tone: "neutral" });
    expect(result.physical).toEqual({ label: "C", tone: "needs_support" });
  });
});

/**
 * Bug: DailyDuoRow only mounts this card once its half was tapped, so mount
 * IS the explicit open — but the getToday.invalidate() that used to run on
 * that tap lived in branches the always-passed `autoOpen` made unreachable.
 * Nothing refetched, so a same-day cached-but-unanswered review could render
 * up to 5 minutes stale (longer from the persisted cache, which restores with
 * a fresh dataUpdatedAt) and let the user submit answers the server rejects.
 */
describe("DailyDiagnosticCard freshness — an explicit open must ask the server, not trust the cache", () => {
  const today = new Date().toISOString().slice(0, 10);
  const questions = [
    { category: "prayer", text: "Q?", options: [{ label: "A", tone: "positive" as const }] },
  ];

  const unanswered = {
    data: { date: today, questions, answers: null, source: "generated" },
    isError: false, isLoading: false, isFetching: false, error: undefined, refetch: () => {},
  };

  beforeEach(() => {
    h.invalidateCalls = [];
    h.queryOpts = undefined;
    h.submitOpts = undefined;
  });

  // Replaces an earlier "invalidates on mount" assertion. Same invariant — an
  // explicit open must not be answered from a cache the app already considers
  // fresh — but stated against the query itself rather than against the one
  // mechanism that happened to implement it. The 5-minute app-wide staleTime
  // (app/_layout.tsx) plus a persisted-cache restore that stamps a fresh
  // dataUpdatedAt (lib/query-persistence.ts) is what this has to defeat.
  it("never answers an explicit open from a cache it considers fresh", () => {
    h.query = unanswered;

    DailyDiagnosticCard({ lang: "en" });

    expect(h.queryOpts?.staleTime).toBe(0);
  });

  // A bare invalidate() clears the procedure across EVERY language and EVERY
  // day it has cached, not just the entry this card is showing.
  it("scopes every cache invalidation it performs to today's own key", () => {
    h.query = unanswered;

    DailyDiagnosticCard({ lang: "en" });
    h.submitOpts.onSuccess();
    h.submitOpts.onError();

    expect(h.invalidateCalls.length).toBeGreaterThan(0);
    for (const input of h.invalidateCalls) expect(input).toEqual({ lang: "en", date: today });
  });

  // Presence, not only the invalidate: a successful submit must fire
  // onSubmitted so the parent (DailyDuoRow) can advance to the deeds card —
  // Daa3iyah's sequential flow, review filled -> deeds opens. A failed submit
  // must NOT: a rejected save is not a completed review.
  it("fires onSubmitted on a successful submit, never on a failed one", () => {
    h.query = unanswered;
    let advanced = 0;

    DailyDiagnosticCard({ lang: "en", onSubmitted: () => { advanced++; } });
    h.submitOpts.onError();
    expect(advanced).toBe(0);
    h.submitOpts.onSuccess();
    expect(advanced).toBe(1);
  });

  // Presence, not only the refetch: an already-answered day must open straight
  // into the locked review. The compact "done" teaser this replaces would have
  // rendered a second «Personal review» line under the one just tapped.
  it("opens an already-answered day straight into the locked review", () => {
    h.query = {
      data: {
        date: today,
        questions,
        answers: [{ category: "prayer", label: "A", tone: "positive" }],
        source: "generated",
      },
      isError: false, isLoading: false, isFetching: false, error: undefined, refetch: () => {},
    };

    const text: string[] = [];
    const collect = (n: any) => {
      if (typeof n === "string") return void text.push(n);
      if (Array.isArray(n)) return void n.forEach(collect);
      if (n && typeof n === "object") collect(n.props?.children);
    };
    collect(DailyDiagnosticCard({ lang: "en" }));

    expect(text).toContain("Your answers today");
    expect(text).not.toContain("Personal review");
  });
});

/**
 * Item B (haid tracker spec, decision 13-ب): choosing the women-only
 * "excused today" prayer option seeds the tracker with today's blood day —
 * but only with her consent (tracker enabled), never overwriting an existing
 * entry, and at the tracker's own LOCAL date (lib/haid.ts isoToday()), not
 * this card's UTC todayKey.
 */
describe("DailyDiagnosticCard — excused-answer hook writes to the cycle tracker with consent (item B)", () => {
  const today = new Date().toISOString().slice(0, 10);
  const excusedLabel = "معذورة اليوم";
  const questions = [
    {
      category: "prayer",
      text: "Q?",
      options: [
        { label: "A", tone: "positive" as const },
        { label: excusedLabel, tone: "neutral" as const, kind: "excused" as const },
      ],
    },
  ];
  const query = {
    data: { date: today, questions, answers: null, source: "generated" },
    isError: false, isLoading: false, isFetching: false, error: undefined, refetch: () => {},
  };

  beforeEach(() => {
    h.query = query;
    h.upsertCalls = [];
    h.selectedOverride = undefined;
    h.gender = "man";
    h.mine = { data: undefined, isSuccess: false };
    h.user = { id: 7 };
    h.freshMine = { enabled: true, settings: {}, days: [] };
    h.syncCalls = [];
    h.logBloodOnSuccess = undefined;
  });

  function tapSubmit() {
    const tree = DailyDiagnosticCard({ lang: "en" });
    const submit = collectOnPress(tree).find((fn) => fn.toString().includes("submitMutation.mutate"));
    submit?.();
  }

  it("woman, tracker enabled, excused option chosen: logs blood with ifAbsent at the tracker's local date", async () => {
    const { isoToday } = await import("@/lib/haid");
    h.gender = "vrouw";
    h.mine = { data: { enabled: true, settings: {}, days: [] }, isSuccess: true };
    h.selectedOverride = { prayer: { label: excusedLabel, tone: "neutral" } };

    tapSubmit();

    expect(h.upsertCalls).toEqual([{ date: isoToday(), flow: "blood", ifAbsent: true }]);
  });

  // C7: writing the day (or invalidating the cache) alone never touches
  // prayer alarms already scheduled with the OS — only syncHaidNotifications
  // actually cancels and reschedules them, from a freshly-fetched, real
  // cycle state (never from the write attempt itself).
  it("C7: after logging blood, awaits a fresh fetch and runs syncHaidNotifications so prayer alarms actually pause", async () => {
    const { isoToday } = await import("@/lib/haid");
    h.gender = "vrouw";
    h.mine = { data: { enabled: true, settings: {}, days: [] }, isSuccess: true };
    h.selectedOverride = { prayer: { label: excusedLabel, tone: "neutral" } };
    h.freshMine = { enabled: true, settings: { habitLength: 7 }, days: [{ date: isoToday(), flow: "blood" }] };

    tapSubmit();
    await h.logBloodOnSuccess;

    expect(h.syncCalls).toHaveLength(1);
    expect(h.syncCalls[0]).toMatchObject({ userId: 7, language: "en" });
    expect(h.syncCalls[0].days).toEqual([{ date: isoToday(), flow: "blood", color: undefined, ghusl: undefined }]);
    expect(h.syncCalls[0].settings).toMatchObject({ enabled: true, habitLength: 7 });
  });

  it("C7: the tracker reporting disabled by the time of the fresh fetch skips the sync entirely", async () => {
    h.gender = "vrouw";
    h.mine = { data: { enabled: true, settings: {}, days: [] }, isSuccess: true };
    h.selectedOverride = { prayer: { label: excusedLabel, tone: "neutral" } };
    h.freshMine = { enabled: false, settings: null, days: [] };

    tapSubmit();
    await h.logBloodOnSuccess;

    expect(h.syncCalls).toEqual([]);
  });

  it("woman, tracker NOT enabled: does not write", () => {
    h.gender = "vrouw";
    h.mine = { data: { enabled: false, settings: null, days: [] }, isSuccess: true };
    h.selectedOverride = { prayer: { label: excusedLabel, tone: "neutral" } };

    tapSubmit();

    expect(h.upsertCalls).toEqual([]);
  });

  it("man: does not write even if the excused option is somehow selected", () => {
    h.gender = "man";
    h.mine = { data: undefined, isSuccess: false };
    h.selectedOverride = { prayer: { label: excusedLabel, tone: "neutral" } };

    tapSubmit();

    expect(h.upsertCalls).toEqual([]);
  });

  it("woman, tracker enabled, excused option NOT chosen: does not write", () => {
    h.gender = "vrouw";
    h.mine = { data: { enabled: true, settings: {}, days: [] }, isSuccess: true };
    h.selectedOverride = { prayer: { label: "A", tone: "positive" } };

    tapSubmit();

    expect(h.upsertCalls).toEqual([]);
  });
});
