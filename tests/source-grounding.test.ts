import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Guard for the source-grounding standard (server/source-grounding.ts): the
// AI must base every religious ruling/claim/citation only on the passages
// provided in the prompt, never on general knowledge or the open web.
// Mirrors tests/name-fidelity.test.ts's pattern — presence assertions
// against the raw source, sliced per procedure/branch, so a future edit
// that silently drops the reference from one surface (but not another)
// fails this test. Asserting the constant is REFERENCED (e.g.
// "SOURCE_GROUNDING_RULE.ar" literally appears) rather than pinning the
// expanded rule prose, so a wording tweak in server/source-grounding.ts
// can't desync this test.
//
// Unlike name-fidelity, this rule DOES apply to getSpouseAdvice and to the
// parentAiConsultRouter spouse branch — it is wired everywhere the
// SCRIPTURE CITATION RULE already exists, plus generateTreatmentPlan's
// three short diagnostic sub-prompts, which never had that anchor.

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe("advice.ts: source-grounding rule wired into every religious-content prompt", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/advice.ts"), "utf-8");

  it("imports the shared SOURCE_GROUNDING_RULE constant", () => {
    expect(source).toContain('import { SOURCE_GROUNDING_RULE } from "./source-grounding";');
  });

  // Same procedure markers/slicing as tests/advice-safety.test.ts and
  // tests/name-fidelity.test.ts.
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

  it("getGeneralAdvice: references the rule in all three languages", () => {
    const block = blocks["getGeneralAdvice: publicProcedure"];
    expect(block).toContain("SOURCE_GROUNDING_RULE.ar");
    expect(block).toContain("SOURCE_GROUNDING_RULE.en");
    expect(block).toContain("SOURCE_GROUNDING_RULE.nl");
  });

  it("getWeekPlan: references the rule in all three languages", () => {
    const block = blocks["getWeekPlan: publicProcedure"];
    expect(block).toContain("SOURCE_GROUNDING_RULE.ar");
    expect(block).toContain("SOURCE_GROUNDING_RULE.en");
    expect(block).toContain("SOURCE_GROUNDING_RULE.nl");
  });

  it("getQuickTips: deliberately does NOT reference the rule — it must name real local mosques (general knowledge) and injects no corpus; the scripture guard still applies", () => {
    const block = blocks["getQuickTips: publicProcedure"];
    expect(block).not.toContain("SOURCE_GROUNDING_RULE");
    // Presence assertion: the scripture guard must remain even though source-grounding is intentionally excluded here.
    expect(block).toContain("SCRIPTURE CITATION RULE");
  });

  // Unlike name-fidelity, source-grounding DOES apply to getSpouseAdvice —
  // its religious-advice output is exactly the kind of content this rule
  // guards, and the owner explicitly asked for it here this time.
  it("getSpouseAdvice: references the rule in all three languages (unlike name-fidelity, this rule applies here)", () => {
    const block = blocks["getSpouseAdvice: protectedProcedure"];
    expect(block).toContain("SOURCE_GROUNDING_RULE.ar");
    expect(block).toContain("SOURCE_GROUNDING_RULE.en");
    expect(block).toContain("SOURCE_GROUNDING_RULE.nl");
  });

  // generateTreatmentPlan builds FOUR separate prompts (questions,
  // refine_question, check_root_cause, and the final plan), each in three
  // languages — the rule must appear 4 times per language, not just once
  // somewhere in the procedure.
  it("generateTreatmentPlan: references the rule in all four sub-prompts, all three languages", () => {
    const block = blocks["generateTreatmentPlan: publicProcedure"];
    expect(countOccurrences(block, "SOURCE_GROUNDING_RULE.ar")).toBe(4);
    expect(countOccurrences(block, "SOURCE_GROUNDING_RULE.en")).toBe(4);
    expect(countOccurrences(block, "SOURCE_GROUNDING_RULE.nl")).toBe(4);
  });
});

describe("ai-chat.ts: source-grounding rule", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/ai-chat.ts"), "utf-8");

  it("imports the shared SOURCE_GROUNDING_RULE constant", () => {
    expect(source).toContain('import { SOURCE_GROUNDING_RULE } from "./source-grounding";');
  });

  it("SYSTEM_PROMPTS references the rule in all three languages (shared by startConversation/sendMessage/getLiveAdvice)", () => {
    expect(source).toContain("SOURCE_GROUNDING_RULE.ar");
    expect(source).toContain("SOURCE_GROUNDING_RULE.en");
    expect(source).toContain("SOURCE_GROUNDING_RULE.nl");
  });
});

describe("child-monitoring-router.ts: source-grounding rule", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/child-monitoring-router.ts"), "utf-8");

  it("imports the shared SOURCE_GROUNDING_RULE constant", () => {
    expect(source).toContain('import { SOURCE_GROUNDING_RULE } from "./source-grounding";');
  });

  // Same boundary markers as tests/scripture-citation-guard.test.ts and
  // tests/name-fidelity.test.ts.
  const childChatStart = source.indexOf("export const childAiChatRouter");
  const childChatEnd = source.indexOf("export const childAppUsageRouter");
  if (childChatStart === -1) throw new Error("export const childAiChatRouter marker not found");
  if (childChatEnd === -1) throw new Error("export const childAppUsageRouter marker not found");
  const childChatBlock = source.slice(childChatStart, childChatEnd);

  it("childAiChatRouter: references the rule", () => {
    expect(childChatBlock).toContain("SOURCE_GROUNDING_RULE.nl");
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

  it("parentAiConsultRouter (child branch): references the rule", () => {
    expect(childBranch).toContain("SOURCE_GROUNDING_RULE.nl");
  });

  // Unlike name-fidelity (which has nothing to guard here, since no name
  // enters this branch), source-grounding DOES apply: this branch gives
  // religious marital advice and already carries its own scripture-citation
  // rule, so source-grounding follows it there too.
  it("parentAiConsultRouter (spouse branch): references the rule too (unlike name-fidelity, this branch is in scope)", () => {
    expect(spouseBranch).toContain("SOURCE_GROUNDING_RULE.nl");
  });
});

describe("server/source-grounding.ts", () => {
  it("exports ar, en, and nl variants, each a non-trivial binding rule", () => {
    return import("../server/source-grounding").then(({ SOURCE_GROUNDING_RULE }) => {
      expect(SOURCE_GROUNDING_RULE.ar.length).toBeGreaterThan(20);
      expect(SOURCE_GROUNDING_RULE.en.length).toBeGreaterThan(20);
      expect(SOURCE_GROUNDING_RULE.nl.length).toBeGreaterThan(20);
    });
  });

  it("never names a specific external source (e.g. an un-ingested site) — that would invite fabricated citations to it", () => {
    return import("../server/source-grounding").then(({ SOURCE_GROUNDING_RULE }) => {
      const all = SOURCE_GROUNDING_RULE.ar + SOURCE_GROUNDING_RULE.en + SOURCE_GROUNDING_RULE.nl;
      expect(all.toLowerCase()).not.toContain("durar");
      expect(all.toLowerCase()).not.toContain("alukah");
      expect(all.toLowerCase()).not.toContain("islamqa");
      expect(all).not.toContain(".com");
      expect(all).not.toContain(".net");
    });
  });
});
