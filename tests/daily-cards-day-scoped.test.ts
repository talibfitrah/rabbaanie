import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Bug: on a new calendar day, both the daily review (DailyDiagnosticCard)
 * and the daily deeds checklist (DailyDeedsCard) showed YESTERDAY's
 * answers/checks instead of resetting. Root cause: their getToday query's
 * input was `{ lang }` only, so react-query's cache KEY never changed across
 * a day boundary — a persisted-cache restore on app boot (lib/
 * query-persistence.ts) stamps a fresh `dataUpdatedAt` on the restored
 * (yesterday's) data, which defeats the 5-minute staleTime check and skips
 * the network fetch entirely, silently serving yesterday's response as if it
 * were today's.
 *
 * Fix: fold today's UTC date into the query input, so it's also part of the
 * cache key — a new day is then a genuine cache MISS, not a same-key
 * overwrite. Every call site that reads/writes that same cache entry
 * (getData/setData/cancel, both mutation call sites) must carry the same
 * `date` or the optimistic-update UX silently breaks against an entry
 * nobody reads. Anchored on identifiers, not full-file search or exact
 * formatting — a reformat must not defeat this; only removing `date` from
 * the actual call should.
 */
const DIAGNOSTIC = readFileSync(
  join(__dirname, "..", "components", "daily-diagnostic-card.tsx"),
  "utf8",
);
const DEEDS = readFileSync(
  join(__dirname, "..", "components", "daily-deeds-card.tsx"),
  "utf8",
);

/** The argument list of the call whose `(` starts right after `from`, by paren depth. */
function callArgsAfter(src: string, from: number): string {
  const start = src.indexOf("(", from);
  if (start === -1) return "";
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

describe("DailyDiagnosticCard.getToday — query input is day-scoped", () => {
  it("useQuery's input includes `date` alongside `lang`", () => {
    const at = DIAGNOSTIC.indexOf("trpc.dailyDiagnostic.getToday.useQuery");
    expect(at).toBeGreaterThan(-1);
    const args = callArgsAfter(DIAGNOSTIC, at);
    expect(args).toMatch(/\blang\b/);
    expect(args).toMatch(/\bdate\s*:/);
  });
});

describe("DailyDeedsCard.getToday — query input and every cache read/write it shares are day-scoped", () => {
  it("useQuery's input includes `date` alongside `lang`", () => {
    const at = DEEDS.indexOf("dailyDeeds.dailyDeeds.getToday.useQuery");
    expect(at).toBeGreaterThan(-1);
    const args = callArgsAfter(DEEDS, at);
    expect(args).toMatch(/\blang\b/);
    expect(args).toMatch(/\bdate\s*:/);
  });

  it("the optimistic-update onMutate handler's cancel/getData/setData all target the same dated key", () => {
    const at = DEEDS.indexOf("onMutate: async ({ deedId, done }) => {");
    expect(at).toBeGreaterThan(-1);
    const cancelAt = DEEDS.indexOf("getToday.cancel", at);
    const getDataAt = DEEDS.indexOf("getToday.getData", at);
    const setDataAt = DEEDS.indexOf("getToday.setData", at);
    expect(cancelAt).toBeGreaterThan(at);
    expect(getDataAt).toBeGreaterThan(cancelAt);
    expect(setDataAt).toBeGreaterThan(getDataAt);
    expect(callArgsAfter(DEEDS, cancelAt)).toMatch(/\bdate\s*:/);
    expect(callArgsAfter(DEEDS, getDataAt)).toMatch(/\bdate\s*:/);
    expect(callArgsAfter(DEEDS, setDataAt)).toMatch(/\bdate\s*:/);
  });

  // Presence in BOTH mutation outcomes, not just the happy path: a fix that
  // dates onMutate's setData but not onError's rollback would leave the
  // rollback silently writing into a cache entry nobody reads.
  it("the onError rollback's setData also targets the same dated key", () => {
    const onErrorAt = DEEDS.indexOf("onError: (_err, _vars, ctx) => {");
    expect(onErrorAt).toBeGreaterThan(-1);
    const setDataAt = DEEDS.indexOf("getToday.setData", onErrorAt);
    expect(setDataAt).toBeGreaterThan(onErrorAt);
    expect(callArgsAfter(DEEDS, setDataAt)).toMatch(/\bdate\s*:/);
  });
});
