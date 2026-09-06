import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * app/onboarding/parent-profile.tsx's "basis" phase asked gender, marital
 * status AND birth date unconditionally, even though the wizard prefills
 * `profile` from state.parentProfile — so a user who just finished the short
 * onboarding (app/onboarding/index.tsx, which collects exactly those three
 * before handing off here) already has all of them answered. Worse, the
 * phase kept the "Step 1: Basic information" heading regardless — the SAME
 * wording the short onboarding's own first screen uses — so landing on it
 * right after finishing that screen read as the whole flow restarting
 * (Daa3iyah, "دوامة" / goes in a loop, 2026-09-06), even on the questions
 * that WERE correctly skipped. Separately, "Stap 7: Onderwijs kinderen"
 * (children's education) had no phase-level gate at all, so a user who had
 * just declared "no children" was still asked what school their children
 * attend.
 *
 * A source scan, not a behavioural test: the wizard's phase/question state
 * lives inside a component (useState/useMemo) whose module pulls in
 * react-native/expo-router/etc. at module scope. Vitest's plain Vite/Rollup
 * pipeline cannot parse react-native's own source directly (confirmed by
 * import probe: `import "react-native"` alone throws "Expected 'from', got
 * 'typeOf'" even on this file unmodified), so driving the real component
 * needs a `vi.mock` for every such import — the recipe
 * tests/admin-user-delete-invalidates-list.test.ts uses for a full screen.
 * That's disproportionate for one pure phase-list function, so — like the
 * rest of this file's existing checks — these stay source scans. Whitespace
 * is collapsed first so matches survive a reformat; each regex still targets
 * the actual code shape, not incidental formatting (see
 * tests/app-context-sync.test.ts's syncFromServer guard for the same
 * pattern and why it matters more than it sounds).
 */
const src = readFileSync(
  join(__dirname, "..", "app/onboarding/parent-profile.tsx"),
  "utf8",
).replace(/\s+/g, " ");

describe("the profile wizard does not re-ask gender, marital status or birth date already given", () => {
  // Gate on a MOUNT snapshot (`known`), not live `p`: referencing live state
  // hid a question the instant it was answered inside the wizard. `known` is
  // captured from state.parentProfile at mount, so a prefilled answer is
  // skipped while an answer given in the wizard never vanishes.
  it("has a conditional on the gender and maritalStatus questions", () => {
    expect(src, "gender question is not skip-if-prefilled via the mount snapshot").toMatch(
      /conditional:\s*\(\)\s*=>\s*!known\?\.gender/,
    );
    expect(src, "maritalStatus question is not skip-if-prefilled via the mount snapshot").toMatch(
      /conditional:\s*\(\)\s*=>\s*!known\?\.maritalStatus/,
    );
  });

  it("has a conditional on the birthDate question — it was already collected by the short onboarding", () => {
    expect(src, "birthDate question is not skip-if-prefilled via the mount snapshot").toMatch(
      /conditional:\s*\(\)\s*=>\s*!known\?\.birthDate/,
    );
  });

  it("the mount snapshot captures gender, maritalStatus AND birthDate from state.parentProfile", () => {
    const ref = src.match(/knownAtMount\s*=\s*useRef\(\{([^}]*)\}\)/);
    expect(ref, "knownAtMount ref not found").toBeTruthy();
    const body = ref![1];
    expect(body).toMatch(/gender:\s*!!state\.parentProfile\.gender/);
    expect(body).toMatch(/maritalStatus:\s*!!state\.parentProfile\.maritalStatus/);
    expect(body).toMatch(/birthDate:\s*!!state\.parentProfile\.birthDate/);
  });

  it("never gates previousMethodology on `known` — it's a new question, the short onboarding never asks it", () => {
    // Sliced up to the next question's key (not a brace-count match: the
    // options array inside this question has its own nested `}`s).
    const q = src.slice(src.indexOf('key: "previousMethodology"'), src.indexOf('key: "birthDate"'));
    expect(q, "previousMethodology question not found or out of order").not.toBe("");
    expect(q).not.toMatch(/known/);
  });
});

describe("the wizard does not restart at 'Step 1: Basic information' after the short onboarding", () => {
  it("relabels phase 1's title/subtitle once gender, maritalStatus and birthDate are all already known", () => {
    expect(src).toMatch(/isContinuing\s*=\s*!!\(known\?\.gender\s*&&\s*known\?\.maritalStatus\s*&&\s*known\?\.birthDate\)/);
    // The ternary must live on the "basis" phase's title, not somewhere unrelated.
    const basis = src.slice(src.indexOf('id: "basis"'), src.indexOf('id: "gebed"'));
    expect(basis).toMatch(/title:\s*isContinuing\s*\?/);
    expect(basis).toMatch(/subtitle:\s*isContinuing\s*\?/);
  });

  it("keeps the original 'Step 1: Basic information' wording as the non-continuing fallback", () => {
    expect(src).toMatch(/Step 1: Basic information/);
  });
});

describe("a childless user skips every child-specific question", () => {
  it("gates the 'onderwijs' (children's education) phase on hasNoChildren, like 'band' gates on maritalStatus", () => {
    const onderwijs = src.slice(src.indexOf('id: "onderwijs"'), src.indexOf('id: "denken"'));
    expect(onderwijs, "'onderwijs' phase not found or out of order").not.toBe("");
    expect(onderwijs).toMatch(/conditional:\s*\(p\)\s*=>\s*!p\.hasNoChildren/);
  });

  // Every question asking specifically about the user's OWN children must be
  // hidden for a hasNoChildren user — otherwise a childless parent is still
  // asked "how do you feel towards your children?" etc. (Daa3iyah's complaint).
  // psychologistChildrenDetails + speakingToPartner keep their prior gate too
  // (AND-ed), which their per-question test below also proves.
  const CHILD_QUESTION_KEYS = [
    "psychologistChildren",
    "psychologistChildrenDetails",
    "thinkingAboutChildren",
    "feelingAboutChildren",
    "speakingToPartner", // "...over de kinderen"
    "speakingToChildren",
    "speakingWhenAngry", // "...boos op uw kinderen"
    "speakingWhenCorrecting", // "...uw kinderen corrigeert"
    "doingWithChildren",
    "doingDailyRoutine", // "...routine met de kinderen"
  ];
  for (const key of CHILD_QUESTION_KEYS) {
    it(`gates the '${key}' question on hasNoChildren`, () => {
      const start = src.indexOf(`key: "${key}"`);
      expect(start, `question '${key}' not found`).toBeGreaterThan(-1);
      // Slice to the NEXT question's key — options carry `value:`, not `key:`,
      // so this bounds the block to exactly this one question object.
      const next = src.indexOf('key: "', start + 10);
      const block = src.slice(start, next === -1 ? start + 800 : next);
      expect(block, `'${key}' is not gated on !p.hasNoChildren`).toMatch(/!p\.hasNoChildren/);
    });
  }

  it("keeps the existing AND-ed gates on the two questions that already had one", () => {
    expect(src).toContain("!p.hasNoChildren && (p.psychologistChildren ===");
    expect(src).toContain('!p.hasNoChildren && p.maritalStatus === "getrouwd"');
  });

  it("does NOT gate parent-only questions (prayer, own psychologist) on hasNoChildren", () => {
    const psychologistSelf = src.slice(src.indexOf('key: "psychologist"'), src.indexOf('key: "psychologistDetails"'));
    expect(psychologistSelf).not.toMatch(/!p\.hasNoChildren/);
  });
});
