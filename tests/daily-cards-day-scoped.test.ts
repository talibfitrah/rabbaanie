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
 * overwrite. Every call site that addresses that same cache entry
 * (cancel/getData/setData) must carry the same `date` or the
 * optimistic-update UX silently breaks against an entry nobody reads.
 * Anchored on identifiers, not full-file search or exact formatting — a
 * reformat must not defeat this; only removing `date` from the actual call
 * should.
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

  // Anchored on the mutation call's own identifier chain and then scanned for
  // whatever cache operations it contains — not on handler source text like
  // `onError: (_err, _vars, ctx) => {`, which a prettier pass or a parameter
  // rename turns into a -1 and a failure that says nothing about dating.
  // Scanning the whole block also covers operations added later for free.
  it("every keyed cache operation inside the toggle mutation targets the same dated key", () => {
    const at = DEEDS.indexOf("dailyDeeds.dailyDeeds.toggle.useMutation");
    expect(at).toBeGreaterThan(-1);
    const block = callArgsAfter(DEEDS, at);

    // Presence, not only dating: the optimistic write and the post-failure
    // refetch are the two halves of this cache contract, and a mutation that
    // quietly lost either would otherwise satisfy the loop below vacuously.
    expect(block).toMatch(/getToday\.setData/);
    expect(block).toMatch(/getToday\.invalidate/);

    // `invalidate()` deliberately takes no input (it clears the procedure,
    // every day's key); every operation that DOES address one entry must
    // address today's.
    const keyed = [...block.matchAll(/getToday\.(?:cancel|getData|setData)\b/g)];
    expect(keyed.length).toBeGreaterThan(0);
    for (const m of keyed) {
      expect(callArgsAfter(block, m.index!)).toMatch(/\bdate\s*:/);
    }
  });
});
