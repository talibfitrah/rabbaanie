import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The personal-advice screen exists twice — the tab (app/(tabs)/personal-advice.tsx)
 * and the deep-link target the daily-advice notification opens
 * (app/details/personal-advice.tsx, see lib/daily-advice-notification.ts:78).
 * They render the same advice through near-identical renderFormattedText /
 * AdviceSection code.
 *
 * Direction is JS-gated app-wide (lib/i18n.tsx); native RTL is off. A plain
 * `flexDirection: "row"` therefore lays out left-to-right for Arabic too, so
 * every row that puts an icon, bullet or badge beside text must be
 * `isRTL ? "row-reverse" : "row"`. Commits 6299ea2 / 4657009 / bbdd214
 * stripped that gate on the false premise that I18nManager.forceRTL was on.
 *
 * Asserted on the two files together: a rule applied to one twin and not the
 * other is exactly the defect (1ed494f stripped the details copy alone), so a
 * guard on one file cannot catch it.
 */
const SCREENS = ["app/(tabs)/personal-advice.tsx", "app/details/personal-advice.tsx"];
const src = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

/** Gated icon-beside-text rows each screen has today. COUNTED, not merely
 *  present — a single survivor would satisfy `toMatch`, so it could not catch
 *  the rows being stripped again. A drop below this is a real removal to look
 *  at — raise it deliberately, never lower it to go green. */
const GATED_ROWS: Record<string, number> = {
  "app/(tabs)/personal-advice.tsx": 14,
  "app/details/personal-advice.tsx": 14,
};

describe("personal-advice gates its icon rows on isRTL", () => {
  for (const [rel, min] of Object.entries(GATED_ROWS)) {
    it(`${rel}: lays out its icon rows with isRTL ? "row-reverse" : "row"`, () => {
      const gated = (src(rel).match(/flexDirection:\s*isRTL\s*\?\s*"row-reverse"\s*:\s*"row"/g) || []).length;
      expect(gated).toBeGreaterThanOrEqual(min);
    });
  }
});

/**
 * Same twin-divergence defect, different field: the tab copy sorts children
 * oldest-first before building `childrenSummary`, the deep-link copy did not,
 * so the same family listed in a different order depending on which route the
 * user arrived by — and the notification lands on the copy that was missed.
 *
 * Anchored on the `childrenSummary` identifier and then scanned, not on the
 * sort's exact text: a reformat or a comparator rewrite must not fail this,
 * only actually dropping the ordering should.
 */
describe("personal-advice twins agree on child ordering", () => {
  for (const rel of SCREENS) {
    it(`${rel}: orders children by birthDate before building childrenSummary`, () => {
      const text = src(rel);
      const at = text.indexOf("const childrenSummary");
      expect(at).toBeGreaterThan(-1);
      const block = text.slice(at, at + 800);
      expect(block).toMatch(/\.sort\(/);
      expect(block).toMatch(/birthDate/);
    });
  }
});
