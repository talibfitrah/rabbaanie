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
 * Native RTL is forced app-wide (I18nManager.forceRTL in lib/i18n.tsx), so a
 * plain `flexDirection: "row"` ALREADY lays out right-to-left; conditioning it
 * on `isRTL` and switching to "row-reverse" double-flips and puts icons on the
 * wrong side. The tab copy was converted to plain "row"; the details copy was
 * not, so the same advice was mirrored differently depending on whether the
 * user arrived from the tab or from the notification.
 *
 * Asserted on the two files together: a rule applied to one twin and not the
 * other is exactly the defect, so a guard on one file alone cannot catch it.
 */
const SCREENS = ["app/(tabs)/personal-advice.tsx", "app/details/personal-advice.tsx"];
const src = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

/** Row layouts each screen has today. A drop below this is a real removal to
 *  look at, not a formatting change — raise it deliberately, never to go green. */
const ROW_LAYOUTS: Record<string, number> = {
  "app/(tabs)/personal-advice.tsx": 15,
  "app/details/personal-advice.tsx": 15,
};

describe("personal-advice twins agree on layout direction", () => {
  for (const rel of SCREENS) {
    // Matches the ternary regardless of whitespace, quote style or branch
    // order — it is the isRTL-conditioned flexDirection that is wrong, not any
    // particular spelling of it.
    it(`${rel}: never conditions flexDirection on isRTL`, () => {
      expect(src(rel)).not.toMatch(/flexDirection:\s*isRTL\s*\?/);
    });

    // Presence, not only absence: without this, deleting the row layouts
    // outright would satisfy the assertion above while destroying the screen.
    // COUNTED, not merely present — `toMatch(/flexDirection: "row"/)` is
    // satisfied by a single survivor, so it passes on a screen with 14 of its
    // 15 rows deleted and cannot detect the removal it exists to catch.
    it(`${rel}: still lays out all of its rows with a plain "row"`, () => {
      const rows = (src(rel).match(/flexDirection:\s*"row"/g) || []).length;
      expect(rows).toBeGreaterThanOrEqual(ROW_LAYOUTS[rel]);
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
