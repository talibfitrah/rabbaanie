import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * app/onboarding/parent-profile.tsx's "basis" phase asked gender and marital
 * status unconditionally, even though the wizard prefills `profile` from
 * state.parentProfile (so a returning/linked user already has both answered)
 * and the file already supports per-question `conditional: (p) => …` for
 * exactly this purpose (see hijab/hijabPartner, the "band" phase, etc.). A
 * user who had already answered "Bent u een man of een vrouw?" saw it again
 * every time she re-entered onboarding.
 *
 * A source scan, not a behavioural test: the wizard's phase/question state
 * lives inside a component (useState/useMemo), not exported for a unit test
 * to drive without mounting React. Whitespace is collapsed first so the
 * match survives a reformat — see tests/app-context-sync.test.ts's
 * syncFromServer guard for the same pattern and why it matters more than it
 * sounds.
 */
describe("the profile wizard does not re-ask gender or marital status already given", () => {
  it("has a conditional on the gender and maritalStatus questions", () => {
    const src = readFileSync(
      join(__dirname, "..", "app/onboarding/parent-profile.tsx"),
      "utf8",
    ).replace(/\s+/g, " ");

    // Gate on a MOUNT snapshot (`known`), not live `p`: referencing live state
    // hid a question the instant it was answered inside the wizard. `known` is
    // captured from state.parentProfile at mount, so a prefilled answer is
    // skipped while an answer given in the wizard never vanishes.
    expect(
      src,
      "gender question is not skip-if-prefilled via the mount snapshot",
    ).toMatch(/conditional:\s*\(\)\s*=>\s*!known\?\.gender/);

    expect(
      src,
      "maritalStatus question is not skip-if-prefilled via the mount snapshot",
    ).toMatch(/conditional:\s*\(\)\s*=>\s*!known\?\.maritalStatus/);

    expect(
      src,
      "the mount snapshot is not captured from state.parentProfile",
    ).toMatch(/knownAtMount\s*=\s*useRef/);
  });
});
