import { describe, expect, it } from "vitest";
import { adviceDiagnosticSig, adviceStillFresh, ADVICE_TTL_MS, currentWeekKey } from "./advice-period";

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
