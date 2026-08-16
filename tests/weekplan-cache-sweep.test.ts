import { describe, expect, it } from "vitest";
import { weekPlanCachePrefix } from "@/lib/weekplan-cache";

/**
 * The sweep that deletes a child's superseded week plans must not reach into
 * another week.
 *
 * Two bugs lived here in one day. First the prefix gained a trailing "_" when
 * issuesSig was appended, so the pre-issuesSig keys — `..._w<week>` with nothing
 * after — no longer matched and leaked in AsyncStorage forever. Then the fix for
 * that trimmed the underscore, which made `..._w3` a PREFIX of `..._w30`..`_w39`:
 * generating week 3's plan deleted the cached plans for weeks 30-39, and a
 * parent correcting a birth date moves weekInYear backwards and pays to
 * regenerate them.
 *
 * This reproduces the second, which shipped with no regression test at all.
 */
const sweepMatches = (prefix: string, key: string, cacheKey: string) => {
  const legacyKey = prefix.slice(0, -1);
  return (key === legacyKey || key.startsWith(prefix)) && key !== cacheKey;
};

describe("week-plan cache sweep", () => {
  const P = (week: number) => weekPlanCachePrefix("child1", "nl", week, "2026");

  it("never deletes another week's plans", () => {
    const week3 = P(3);
    for (const other of [30, 31, 39]) {
      const otherKey = P(other) + "sig";
      expect(
        sweepMatches(week3, otherKey, week3 + "current"),
        `week 3's sweep must not match week ${other}`,
      ).toBe(false);
    }
  });

  it("still removes this week's superseded plans", () => {
    const week3 = P(3);
    expect(sweepMatches(week3, week3 + "oldsig", week3 + "newsig")).toBe(true);
  });

  it("still removes the pre-issuesSig key, which is what started this", () => {
    const week3 = P(3);
    expect(sweepMatches(week3, week3.slice(0, -1), week3 + "newsig")).toBe(true);
  });

  it("leaves another child and another language alone", () => {
    const week3 = P(3);
    expect(sweepMatches(week3, weekPlanCachePrefix("child2", "nl", 3, "2026") + "s", "x")).toBe(false);
    expect(sweepMatches(week3, weekPlanCachePrefix("child1", "ar", 3, "2026") + "s", "x")).toBe(false);
  });
});
