import { describe, it, expect } from "vitest";
import { buildQuestionsForToday } from "../server/daily-diagnostic";

// buildQuestionsForToday's real parameter order in this repo is
// (gender, lang, date, hasPartner) — not (date, gender, lang, hasPartner)
// as in the server plan's illustrative test; server/daily-diagnostic.ts:321.
describe("daily review prayer question — excused option", () => {
  it("offers a 4th neutral 'excused' option to women on every variant", () => {
    for (const date of ["2026-09-01", "2026-09-02", "2026-09-03"]) {
      const qs = buildQuestionsForToday("vrouw", "ar", date, false);
      const prayer = qs.find((q) => q.category === "prayer")!;
      const excused = prayer.options.filter((o) => o.kind === "excused");
      expect(excused).toHaveLength(1);
      expect(excused[0].tone).toBe("neutral");
      expect(prayer.options).toHaveLength(4);
    }
  });

  it("never offers it to men", () => {
    for (const date of ["2026-09-01", "2026-09-02", "2026-09-03"]) {
      const prayer = buildQuestionsForToday("man", "ar", date, false).find((q) => q.category === "prayer")!;
      expect(prayer.options.some((o) => o.kind === "excused")).toBe(false);
      expect(prayer.options).toHaveLength(3);
    }
  });
});
