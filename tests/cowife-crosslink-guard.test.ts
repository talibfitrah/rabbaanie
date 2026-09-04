import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// 2026-09-04: a childless co-wife (Yamina) showed the husband's 9 children as
// "shared" on his family screen. Cause: syncWithPartner merged the husband's
// household children into ANY wife who synced with him. Guard: when the partner
// is a polygynous husband (getPartnersOfUser(partner) > 1, so the caller is a
// co-wife), merge NONE of his children — in polygyny a child's mother is
// assigned explicitly (per-child motherId at profile.save), never inferred by
// "sync everything". A monogamous husband->one-wife sync is unaffected.
//
// Static-source assertion (same pattern as the other cowife tests), tolerant of
// whitespace so a reformat can't silently drop the guard (assert the invariant).
describe("syncWithPartner co-wife crosslink guard", () => {
  const src = readFileSync("server/routers.ts", "utf8");
  it("computes the polygynous-husband flag from the PARTNER's partner count", () => {
    expect(src).toMatch(
      /partnerIsPolygynousHusband\s*=\s*\(await db\.getPartnersOfUser\(partner\.id\)\)\.length\s*>\s*1/,
    );
  });
  it("routes EVERY household array through a polygyny-gated helper — not just children (issues/plans don't ride on children)", () => {
    // the gate helper returns [] for a co-wife
    expect(src).toMatch(/mergeable\s*=\s*\(rows: any\)\s*=>\s*\(?\s*partnerIsPolygynousHusband\s*\?\s*\[\]/);
    // all four of his household arrays go through it, so none can leak
    for (const field of ["children", "environments", "issues", "actionPlans"]) {
      expect(src).toMatch(new RegExp(field + ":\\s*mergeable\\(partnerData\\." + field + "\\)"));
    }
  });
});
