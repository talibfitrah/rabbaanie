import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { adviceDiagnosticSig, adviceStillFresh, ADVICE_TTL_MS, checkinsLast7Days, currentWeekKey } from "./advice-period";

describe("adviceDiagnosticSig", () => {
  const base = {
    parentProfile: { style: "gentle" },
    environments: [{ childId: "c1", media: "some" }],
    issues: [
      { id: "i1", description: "lying" },
      { id: "i2", description: "prayer" },
    ],
    children: [{ id: "c1", name: "Yusuf", birthDate: "2018-01-01" }],
  };

  it("is stable for identical diagnostic input", () => {
    expect(adviceDiagnosticSig(base)).toBe(adviceDiagnosticSig({ ...base }));
  });

  it("changes when a child is added (count/name/age feed advice)", () => {
    const withChild = {
      ...base,
      children: [...base.children, { id: "c2", name: "Aisha", birthDate: "2020-05-05" }],
    };
    expect(adviceDiagnosticSig(withChild)).not.toBe(adviceDiagnosticSig(base));
  });

  it("changes when a child's birthDate (age) changes", () => {
    const olderAge = {
      ...base,
      children: [{ id: "c1", name: "Yusuf", birthDate: "2017-01-01" }],
    };
    expect(adviceDiagnosticSig(olderAge)).not.toBe(adviceDiagnosticSig(base));
  });

  it("changes when an environment field changes", () => {
    const changedEnv = { ...base, environments: [{ childId: "c1", media: "heavy" }] };
    expect(adviceDiagnosticSig(changedEnv)).not.toBe(adviceDiagnosticSig(base));
  });

  it("is NOT affected by volatile sync metadata (weekly stability)", () => {
    const withMeta = {
      ...base,
      issues: [
        { id: "i1", description: "lying", updatedAt: "2026-07-26T10:00:00Z", syncedFromPartner: true },
        { id: "i2", description: "prayer", updatedAt: "2026-07-26T11:00:00Z" },
      ],
    };
    expect(adviceDiagnosticSig(withMeta)).toBe(adviceDiagnosticSig(base));
  });

  it("is NOT affected by array reordering from a partner merge", () => {
    const reordered = {
      ...base,
      issues: [
        { id: "i2", description: "prayer" },
        { id: "i1", description: "lying" },
      ],
    };
    expect(adviceDiagnosticSig(reordered)).toBe(adviceDiagnosticSig(base));
  });

  it("does not throw on empty/undefined state", () => {
    expect(typeof adviceDiagnosticSig(undefined)).toBe("string");
    expect(typeof adviceDiagnosticSig({})).toBe("string");
  });
});

describe("currentWeekKey", () => {
  it("returns a YYYY-MM-DD date string", () => {
    expect(currentWeekKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("adviceStillFresh", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("keeps advice generated just now", () => {
    expect(adviceStillFresh({ generatedAt: Date.now() })).toBe(true);
  });

  it("keeps advice generated 6 days ago (still within the week from generation)", () => {
    expect(adviceStillFresh({ generatedAt: Date.now() - 6 * DAY })).toBe(true);
  });

  it("expires advice generated 8 days ago", () => {
    expect(adviceStillFresh({ generatedAt: Date.now() - 8 * DAY })).toBe(false);
  });

  it("expires at the one-week boundary", () => {
    expect(adviceStillFresh({ generatedAt: Date.now() - ADVICE_TTL_MS })).toBe(false);
  });

  it("rejects a future generatedAt (clock skew)", () => {
    expect(adviceStillFresh({ generatedAt: Date.now() + DAY })).toBe(false);
  });

  it("honors a legacy entry keyed to the current week (back-compat, no generatedAt)", () => {
    expect(adviceStillFresh({ date: currentWeekKey() })).toBe(true);
  });

  it("expires a legacy entry from an older week", () => {
    expect(adviceStillFresh({ date: "2000-01-01" })).toBe(false);
  });

  it("returns false for empty/missing entries", () => {
    expect(adviceStillFresh(null)).toBe(false);
    expect(adviceStillFresh(undefined)).toBe(false);
    expect(adviceStillFresh({})).toBe(false);
  });
});

describe("checkinsLast7Days", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const dayKey = (daysAgo: number) =>
    new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);

  // The bug: nothing writes state.dailyCheckins any more, so the positional
  // `slice(-7)` the advice payloads used returned the last 7 entries EVER —
  // handed to the model labelled "last 7 days" / "laatste 7 dagen".
  it("drops entries older than 7 days even when they are the only entries left", () => {
    const stale = [
      { date: "2026-01-05", prayer: "p", mood: "m" },
      { date: "2026-01-06", prayer: "p", mood: "m" },
    ];
    expect(checkinsLast7Days(stale)).toEqual([]);
  });

  it("keeps today and the six days before it", () => {
    const entries = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ date: dayKey(d) }));
    expect(checkinsLast7Days(entries)).toEqual(entries);
  });

  // Filters by date, not by position: 10 in-window entries all survive. A
  // `slice(-7)` implementation returns 7 and fails here.
  it("returns every in-window entry, not just the last seven", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ date: dayKey(0), i }));
    expect(checkinsLast7Days(entries)).toHaveLength(10);
  });

  it("keeps a recent entry and drops a months-old one from the same array", () => {
    const recent = { date: dayKey(1) };
    const ancient = { date: "2025-11-01" };
    expect(checkinsLast7Days([ancient, recent])).toEqual([recent]);
  });

  it("returns an empty array for null/undefined instead of throwing", () => {
    expect(checkinsLast7Days(null)).toEqual([]);
    expect(checkinsLast7Days(undefined)).toEqual([]);
  });

  it("drops an entry whose date cannot be parsed rather than calling it recent", () => {
    expect(checkinsLast7Days([{ date: "not-a-date" }])).toEqual([]);
  });

  // The array is not guaranteed to be one. app-context.tsx:182 fills it with
  // `profileData.dailyCheckins || []` from the server's z.any() blob, and `||`
  // passes an object/number/boolean straight through — none of which is
  // nullish, so `?? []` inside would hand it to .filter and throw, taking down
  // the advice screen. Mirrors the Array.isArray guard in server/advice.ts.
  it.each([[{}], [5], [true], ["not-an-array"]])(
    "returns an empty array for a non-array input (%p) instead of throwing",
    (stored) => {
      expect(checkinsLast7Days(stored as any)).toEqual([]);
    },
  );

  // Same for the elements: the array comes from the same untyped blob, and
  // reading `.date` off a null entry throws.
  it("drops null entries instead of throwing, keeping the real ones", () => {
    const real = { date: dayKey(1) };
    expect(checkinsLast7Days([null, undefined, real, 42] as any)).toEqual([real]);
  });
});

/**
 * checkinsLast7Days exists because app-context.tsx:182 fills state.dailyCheckins
 * with `profileData.dailyCheckins || []` from the server's z.any() blob, and
 * `||` passes a non-array straight through. Guarding the `.filter` path alone
 * left the `.find` for "today's check-in" on the very next line reading the raw
 * value — and `?.` does not help a non-nullish non-array, so `find is not a
 * function` still blanked the advice screens.
 */
describe("advice screens never hand a raw state.dailyCheckins to .find", () => {
  const FILES = ["app/(tabs)/personal-advice.tsx", "app/details/personal-advice.tsx"];
  const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  /** Check-in reads each screen routes through the helper today (find + the
   *  recentCheckins payload field). Raise deliberately, never to go green. */
  const HELPER_USES: Record<string, number> = {
    "app/(tabs)/personal-advice.tsx": 4,
    "app/details/personal-advice.tsx": 3,
  };

  for (const rel of FILES) {
    it(`${rel}: never calls .find directly on state.dailyCheckins`, () => {
      expect(read(rel)).not.toMatch(/state\.dailyCheckins\s*\??\.\s*find/);
    });

    // Presence: the payloads must still carry the check-in data, not just stop
    // crashing by dropping the field. COUNTED — a bare toMatch is satisfied by
    // one survivor, so it would pass with every other call site deleted.
    it(`${rel}: still resolves every check-in read through the guarded helper`, () => {
      const uses = (read(rel).match(/checkinsLast7Days\(state\.dailyCheckins\)/g) || []).length;
      expect(uses).toBeGreaterThanOrEqual(HELPER_USES[rel]);
    });
  }
});
