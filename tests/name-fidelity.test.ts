import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Guard for the name-fidelity standard (server/name-fidelity.ts): every
// AI-generation surface that puts a parent/spouse/child name into its prompt
// must reference the shared NAME_FIDELITY_RULE constant. Mirrors
// tests/scripture-citation-guard.test.ts's pattern — presence assertions
// against the raw source, sliced per procedure/branch, so a future edit that
// silently drops the reference from one surface (but not another) fails
// this test. Asserting the constant is REFERENCED (e.g. "NAME_FIDELITY_RULE.ar"
// literally appears) rather than pinning the expanded rule prose, so a
// wording tweak in server/name-fidelity.ts can't desync this test — this
// repo's rule: a gate must assert what must be PRESENT, not only what must
// be absent.
//
// getSpouseAdvice is deliberately excluded everywhere below: it already
// solves name fidelity by never emitting a name at all (see
// tests/advice-safety.test.ts's "prompt no longer embeds ctx.user.name"
// block) — this test locks that exclusion in too, so it isn't reopened by
// accident.

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe("advice.ts: name-fidelity rule wired into every name-bearing prompt", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/advice.ts"), "utf-8");

  it("imports the shared NAME_FIDELITY_RULE constant", () => {
    expect(source).toContain('import { NAME_FIDELITY_RULE } from "./name-fidelity";');
  });

  // Same procedure markers/slicing as tests/advice-safety.test.ts, so this
  // test's blocks line up with the ones already proven correct there.
  const PROCEDURE_MARKERS = [
    "getGeneralAdvice: publicProcedure",
    "getWeekPlan: publicProcedure",
    "generateTreatmentPlan: publicProcedure",
    "getSpouseAdvice: protectedProcedure",
    "getQuickTips: publicProcedure",
  ];
  const indices = PROCEDURE_MARKERS.map((m) => {
    const i = source.indexOf(m);
    if (i === -1) throw new Error(`procedure marker not found in server/advice.ts: ${m}`);
    return i;
  });
  const blocks: Record<string, string> = {};
  PROCEDURE_MARKERS.forEach((m, idx) => {
    const start = indices[idx];
    const end = idx + 1 < indices.length ? indices[idx + 1] : source.length;
    blocks[m] = source.slice(start, end);
  });

  it("getGeneralAdvice: references the rule in all three languages (child names are kept — the prompt personalizes per named child)", () => {
    const block = blocks["getGeneralAdvice: publicProcedure"];
    expect(block).toContain("NAME_FIDELITY_RULE.ar");
    expect(block).toContain("NAME_FIDELITY_RULE.en");
    expect(block).toContain("NAME_FIDELITY_RULE.nl");
  });

  it("getWeekPlan: references the rule in all three languages (the whole plan addresses one named child)", () => {
    const block = blocks["getWeekPlan: publicProcedure"];
    expect(block).toContain("NAME_FIDELITY_RULE.ar");
    expect(block).toContain("NAME_FIDELITY_RULE.en");
    expect(block).toContain("NAME_FIDELITY_RULE.nl");
  });

  it("getQuickTips: references the rule in all three languages (prompt explicitly instructs using the children's real names)", () => {
    const block = blocks["getQuickTips: publicProcedure"];
    expect(block).toContain("NAME_FIDELITY_RULE.ar");
    expect(block).toContain("NAME_FIDELITY_RULE.en");
    expect(block).toContain("NAME_FIDELITY_RULE.nl");
  });

  // generateTreatmentPlan builds FOUR separate prompts (questions,
  // refine_question, check_root_cause, and the final plan), each in three
  // languages, and all four interpolate input.childName — so the rule must
  // appear 4 times per language, not just once somewhere in the procedure.
  it("generateTreatmentPlan: references the rule in all four sub-prompts, all three languages", () => {
    const block = blocks["generateTreatmentPlan: publicProcedure"];
    expect(countOccurrences(block, "NAME_FIDELITY_RULE.ar")).toBe(4);
    expect(countOccurrences(block, "NAME_FIDELITY_RULE.en")).toBe(4);
    expect(countOccurrences(block, "NAME_FIDELITY_RULE.nl")).toBe(4);
  });

  it("getSpouseAdvice: NOT touched — it already solves name fidelity by never emitting a name", () => {
    expect(blocks["getSpouseAdvice: protectedProcedure"]).not.toContain("NAME_FIDELITY_RULE");
  });
});

describe("ai-chat.ts: name-fidelity rule + spouse-name drop", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/ai-chat.ts"), "utf-8");

  it("imports the shared NAME_FIDELITY_RULE constant", () => {
    expect(source).toContain('import { NAME_FIDELITY_RULE } from "./name-fidelity";');
  });

  it("SYSTEM_PROMPTS references the rule in all three languages (shared by startConversation/sendMessage/getLiveAdvice)", () => {
    expect(source).toContain("NAME_FIDELITY_RULE.ar");
    expect(source).toContain("NAME_FIDELITY_RULE.en");
    expect(source).toContain("NAME_FIDELITY_RULE.nl");
  });

  // startConversation/sendMessage's spouse branch used to interpolate the
  // spouse's name directly ("اسم الزوجة: ${input.childName}" etc.) — the
  // same bug class getSpouseAdvice was fixed for (server/advice.ts: a name
  // fed into an Arabic prompt got re-transliterated and mis-spelled). Dropped
  // rather than relying on the rule, mirroring that precedent. Locked in so
  // it can't silently come back.
  it("no longer interpolates the spouse's name in either spousal-consultation branch", () => {
    expect(source).not.toContain('اسم ${input.parentGender === "male" ? "الزوجة" : "الزوج"}');
    expect(source).not.toContain('Husband"}\'s name: ${input.childName');
    expect(source).not.toContain("Naam van ${input.parentGender");
  });

  it("still personalizes the child-consultation branch with the child's name (unchanged, kept)", () => {
    expect(countOccurrences(source, 'Child info: ${input.childName')).toBe(2);
  });
});

describe("child-monitoring-router.ts: name-fidelity rule", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/child-monitoring-router.ts"), "utf-8");

  it("imports the shared NAME_FIDELITY_RULE constant", () => {
    expect(source).toContain('import { NAME_FIDELITY_RULE } from "./name-fidelity";');
  });

  // Same boundary markers as tests/scripture-citation-guard.test.ts.
  const childChatStart = source.indexOf("export const childAiChatRouter");
  const childChatEnd = source.indexOf("export const childAppUsageRouter");
  if (childChatStart === -1) throw new Error("export const childAiChatRouter marker not found");
  if (childChatEnd === -1) throw new Error("export const childAppUsageRouter marker not found");
  const childChatBlock = source.slice(childChatStart, childChatEnd);

  it("childAiChatRouter: the child-facing chat references the rule (it addresses the child by name throughout)", () => {
    expect(childChatBlock).toContain("NAME_FIDELITY_RULE.nl");
  });

  const consultStart = source.indexOf("export const parentAiConsultRouter");
  if (consultStart === -1) throw new Error("export const parentAiConsultRouter marker not found");
  const childBranchStart = source.indexOf('if (input.consultationType === "child")', consultStart);
  const spouseBranchStart = source.indexOf("// Spouse consultation", childBranchStart);
  const spouseBranchEnd = source.indexOf("const llmMessages: any[] = [", spouseBranchStart);
  if (childBranchStart === -1) throw new Error('if (input.consultationType === "child") marker not found');
  if (spouseBranchStart === -1) throw new Error("// Spouse consultation marker not found");
  if (spouseBranchEnd === -1) throw new Error("const llmMessages: any[] = [ marker not found after spouse branch");
  const childBranch = source.slice(childBranchStart, spouseBranchStart);
  const spouseBranch = source.slice(spouseBranchStart, spouseBranchEnd);

  it("parentAiConsultRouter (child branch): references the rule (the parent names the child being discussed)", () => {
    expect(childBranch).toContain("NAME_FIDELITY_RULE.nl");
  });

  it("parentAiConsultRouter (spouse branch): no name enters this branch (targetName is never read here) — nothing to guard", () => {
    expect(spouseBranch).not.toContain("targetName");
    expect(spouseBranch).not.toContain("NAME_FIDELITY_RULE");
  });
});

describe("server/name-fidelity.ts", () => {
  it("exports ar, en, and nl variants, each a non-trivial binding rule", () => {
    // Import rather than re-reading the source: this is the one place a
    // round-trip through the real module is cheap and worth it, since it
    // also confirms the file has no syntax errors of its own.
    return import("../server/name-fidelity").then(({ NAME_FIDELITY_RULE }) => {
      expect(NAME_FIDELITY_RULE.ar.length).toBeGreaterThan(20);
      expect(NAME_FIDELITY_RULE.en.length).toBeGreaterThan(20);
      expect(NAME_FIDELITY_RULE.nl.length).toBeGreaterThan(20);
    });
  });
});
