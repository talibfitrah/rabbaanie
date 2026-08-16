import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// The bug this file guards against (cubic round-6, 2x P1):
// links.getPartnerProfile returns a union — a restricted payload omits
// parentProfile/children/issues/dailyCheckins/etc. entirely (the security
// boundary; see server/routers.ts's getPartnerProfile and
// tests/partner-profile-access.test.ts, which proves the restricted branch
// truly lacks these keys). Reading those fields straight off
// `partnerProfileQuery.data` compiled without error even before the fix,
// because the `profileData as any` cast upstream widens full-only fields to
// `any` across the whole union — TypeScript enforced nothing. Both screens
// must narrow through a local isFullPartnerProfile guard before reading any
// full-only field, so a future edit that bypasses the guard is a compile
// error, not a runtime crash for exactly the restricted-access user the
// boundary protects.
//
// Neither screen can be imported directly here — they pull in
// react-native/expo-router, which this project's plain-node vitest
// environment can't run (see tests/bugfixes-batch.test.ts for the same
// fs.readFileSync-based constraint) — so this asserts against the source
// text, normalized to collapse whitespace/line-wrapping so it isn't coupled
// to formatting, only to the actual guard/field names.

function normalizedSource(relativePath: string): string {
  const content = fs.readFileSync(
    path.join(__dirname, "..", relativePath),
    "utf-8",
  );
  return content.replace(/\s+/g, " ");
}

const FULL_ONLY_FIELDS_BY_FILE: Record<string, string[]> = {
  "app/(tabs)/family.tsx": ["dailyCheckins", "dailyTipCompletions", "parentProfile"],
  "app/spouse-profile.tsx": ["children", "issues", "parentProfile"],
};

const GUARD_VAR_BY_FILE: Record<string, string> = {
  "app/(tabs)/family.tsx": "fullPartnerProfile",
  "app/spouse-profile.tsx": "full",
};

describe("getPartnerProfile union narrowing (cubic round-6 P1 fix)", () => {
  for (const file of Object.keys(FULL_ONLY_FIELDS_BY_FILE)) {
    const guardVar = GUARD_VAR_BY_FILE[file];

    it(`${file}: defines isFullPartnerProfile narrowing on access === "full"`, () => {
      const src = normalizedSource(file);
      expect(src).toContain("function isFullPartnerProfile(");
      expect(src).toContain('data.access === "full"');
    });

    for (const field of FULL_ONLY_FIELDS_BY_FILE[file]) {
      it(`${file}: reads .${field} through ${guardVar}, never off the raw union`, () => {
        const src = normalizedSource(file);
        // Old, unguarded pattern (reachable inside IIFE closures in
        // family.tsx, and with zero narrowing at all in spouse-profile.tsx)
        // must be gone.
        expect(src).not.toMatch(
          new RegExp(`partnerProfileQuery\\.data\\??\\.${field}\\b`),
        );
        // New, narrowed pattern must be there in its place — a full-only
        // field must still be reachable, just only through the guard.
        expect(src).toMatch(new RegExp(`${guardVar}\\??\\.${field}\\b`));
      });
    }
  }

  it("spouse-profile.tsx: no longer erases the whole union to `any`", () => {
    const src = normalizedSource("app/spouse-profile.tsx");
    expect(src).not.toContain("const data: any = partnerProfileQuery.data");
  });
});
