import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Extends the same guard added to server/advice.ts (see tests/advice-safety.test.ts)
// to the two remaining scripture-fabrication vectors that sibling change flagged
// but could not edit: routers.ts's admin article generator, and every LLM prompt
// in child-monitoring-router.ts. Presence assertions against the actual prompt
// source text, sliced per procedure/branch, so a future edit that silently drops
// the guard from one prompt (but not another) fails this test.

// The rule encodes TWO separate guarantees, asserted as two short distinctive
// phrases rather than one ~400-char verbatim blob. Matching the whole sentence
// would break CI on a harmless copyedit, and the tempting fix for that is to
// loosen the assertion — which silently removes the guard. Splitting it keeps
// both guarantees enforced while surviving rewording elsewhere in the rule:
//   1. no recall      — never cite scripture from memory
//   2. only verbatim  — cite only text supplied inside the prompt
// Deleting EITHER guarantee still fails these tests.
const NO_RECALL_EN =
  "Never quote, paraphrase, or attribute any hadith or Qur'anic ayah from memory";
const ONLY_VERBATIM_EN =
  "Only use hadith or ayah text that was given to you verbatim elsewhere in this prompt";

const NO_RECALL_NL =
  "Citeer, parafraseer of schrijf nooit uit het geheugen een hadith of Koranvers (ayah) toe";
const ONLY_VERBATIM_NL =
  "Gebruik uitsluitend hadith- of ayah-tekst die je letterlijk elders in deze prompt is aangereikt";

const expectScriptureGuardEN = (block: string) => {
  expect(block).toContain(NO_RECALL_EN);
  expect(block).toContain(ONLY_VERBATIM_EN);
};

const expectScriptureGuardNL = (block: string) => {
  expect(block).toContain(NO_RECALL_NL);
  expect(block).toContain(ONLY_VERBATIM_NL);
};

describe("routers.ts generateArticle prompt safety guard", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/routers.ts"), "utf-8");
  const start = source.indexOf("generateArticle: adminProcedure");
  const end = source.indexOf("saveTemplate: adminProcedure");
  if (start === -1) throw new Error("generateArticle: adminProcedure marker not found in server/routers.ts");
  if (end === -1) throw new Error("saveTemplate: adminProcedure marker not found in server/routers.ts");
  const block = source.slice(start, end);

  it("contains the scripture citation rule", () => {
    expectScriptureGuardEN(block);
  });

  it("hadith inclusion is conditioned on the supplied source material, not memory", () => {
    expect(block).toContain("never invent a hadith or reference from memory");
  });

  it("Qur'aan inclusion is conditioned on the supplied source material, not memory", () => {
    expect(block).toContain("never invent a verse or reference from memory");
  });

  it("no longer unconditionally invites hadith references", () => {
    expect(block).not.toContain("Include relevant authentic hadieth with references.");
  });

  it("no longer unconditionally invites Qur'aan references", () => {
    expect(block).not.toContain("Include relevant Qur'aan verses with surah/ayah references.");
  });

  it("the JSON output schema requires the reference to come from the supplied source material", () => {
    expect(block).toContain(
      '"source": "Primary hadith/Qur\'aan reference literally present in the source material, or empty string if none (Dutch)"',
    );
    expect(block).toContain(
      '"sourceEn": "Primary hadith/Qur\'aan reference literally present in the source material, or empty string if none (English)"',
    );
    expect(block).toContain(
      '"sourceAr": "Primary hadith/Qur\'aan reference literally present in the source material, or empty string if none (Arabic)"',
    );
  });
});

describe("child-monitoring-router.ts prompt safety guards", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server/child-monitoring-router.ts"), "utf-8");

  // childAiChatRouter.sendMessage: the child-facing conversational prompt.
  const childChatStart = source.indexOf("export const childAiChatRouter");
  const childChatEnd = source.indexOf("export const childAppUsageRouter");
  if (childChatStart === -1) throw new Error("export const childAiChatRouter marker not found");
  if (childChatEnd === -1) throw new Error("export const childAppUsageRouter marker not found");
  const childChatBlock = source.slice(childChatStart, childChatEnd);

  it("childAiChatRouter: contains the scripture citation rule", () => {
    expectScriptureGuardNL(childChatBlock);
  });

  it("childAiChatRouter: no longer invites a source reference with no material to ground it", () => {
    expect(childChatBlock).not.toContain("(met verwijzing naar de bron)");
  });

  // parentAiConsultRouter.sendMessage has two branches (child / spouse advice),
  // each building its own systemPrompt; isolate each one.
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

  it("parentAiConsultRouter (child branch): contains the scripture citation rule", () => {
    expectScriptureGuardNL(childBranch);
  });

  it("parentAiConsultRouter (child branch): no longer invites unverified soerah/ayah/hadith references", () => {
    expect(childBranch).not.toContain("(vermeld bronnen: soerah/ayah of hadith collectie)");
  });

  it("parentAiConsultRouter (spouse branch): contains the scripture citation rule", () => {
    expectScriptureGuardNL(spouseBranch);
  });

  it("parentAiConsultRouter (spouse branch): no longer invites unverified references", () => {
    expect(spouseBranch).not.toContain("- Baseer al je adviezen op de Qur'aan en Sunnah (vermeld bronnen)");
  });
});
