import { describe, it, expect } from "vitest";
import { analyzeWord } from "./quran-morphology";

describe("quran-morphology — analyzeWord", () => {
  it("بِسْمِ: a prefix particle segment + a noun segment with root/gender/case", () => {
    const result = analyzeWord([
      ["بِ", "P", "P|PREF|LEM:ب"],
      ["سْمِ", "N", "ROOT:سمو|LEM:اسْم|M|GEN"],
    ]);
    const particleSeg = result.segments.find((s) => s.kind === "حرف جر");
    expect(particleSeg).toBeTruthy();
    expect(particleSeg!.details).toContain("بادئة"); // PREF
    const nounSeg = result.segments.find((s) => s.kind === "اسم");
    expect(nounSeg).toBeTruthy();
    expect(nounSeg!.root).toBe("سمو");
    expect(nounSeg!.details).toContain("مذكر");
    expect(nounSeg!.details).toContain("مجرور");
    // word-level root/lemma come from the content-bearing segment, not the prefix
    expect(result.root).toBe("سمو");
    expect(result.lemma).toBe("اسْم");
  });

  it("نَعْبُدُ: IMPF verb — kind فعل, tense, root, fused 1st-person-plural, mood", () => {
    const result = analyzeWord([["نَعْبُدُ", "V", "IMPF|VF:1|ROOT:عبد|LEM:عَبَدَ|1P|MOOD:IND"]]);
    const seg = result.segments[0];
    expect(seg.kind).toBe("فعل");
    expect(seg.details).toContain("مضارع"); // IMPF tense
    expect(seg.details).toContain("متكلم"); // person 1
    expect(seg.details).toContain("جمع"); // number P
    expect(seg.details).toContain("مرفوع"); // MOOD:IND
    expect(result.root).toBe("عبد");
    expect(seg.verbForm).toBe("فَعَلَ"); // VF:1 -> verb_forms_tri[0]
  });

  it("decodes a fused person+gender+number token char-by-char: 3FP -> غائب + مؤنث + جمع", () => {
    const result = analyzeWord([["هُنَّ", "N", "PRON|SUFF|3FP"]]);
    expect(result.segments[0].details).toEqual(
      expect.arrayContaining(["غائب", "مؤنث", "جمع"]),
    );
  });

  it("does not drop person on a gendered-singular fused token (the documented substring bug: '2MS'.includes('2P') is false)", () => {
    const result = analyzeWord([["تَ", "N", "PRON|SUFF|2MS"]]);
    const details = result.segments[0].details;
    expect(details).toContain("مخاطب"); // 2nd person — a substring check for "2P" would miss this
    expect(details).toContain("مذكر");
    expect(details).toContain("مفرد");
    expect(details).not.toContain("متكلم"); // not 1st person
    expect(details).not.toContain("غائب"); // not 3rd person
  });

  it("the definite article (DET) is its own kind «ال»; PREF is a separate detail, not folded into kind", () => {
    const result = analyzeWord([["ٱلْ", "P", "DET|PREF|LEM:ال"]]);
    const seg = result.segments[0];
    expect(seg.kind).toBe("ال");
    expect(seg.details).toContain("بادئة");
  });

  it("resolves the ACC collision by position: particle-subtype at the head, grammatical case elsewhere", () => {
    const particle = analyzeWord([["إِنَّ", "P", "ACC|LEM:إِنّ"]]).segments[0];
    expect(particle.kind).toBe("حرف نصب");
    const noun = analyzeWord([["صِرَٰطَ", "N", "ROOT:صرط|LEM:صِراط|M|ACC"]]).segments[0];
    expect(noun.kind).toBe("اسم");
    expect(noun.details).toContain("منصوب");
  });

  it("a bare plural-number token ('P') after a subtype is not re-read as the حرف جر particle code", () => {
    const result = analyzeWord([["أُو۟لَٰٓئِ", "N", "DEM|LEM:ذا|P"]]);
    const seg = result.segments[0];
    expect(seg.kind).toBe("اسم اشارة"); // DEM, not overwritten by the later bare "P"
    expect(seg.details).toContain("جمع");
  });

  it("maps VF to the quadriliteral verb-form table when the root has 4 consonants", () => {
    const seg = analyzeWord([["يُزَلْزِلُ", "V", "IMPF|VF:1|ROOT:زلزل|LEM:زَلْزَلَ|3MS|MOOD:IND"]]).segments[0];
    expect(seg.verbForm).toBe("فَعْلَلَ"); // verb_forms_quad[0], not tri[0]
  });

  it("keeps a SECOND subtype/tense token as a detail instead of dropping it", () => {
    // PN|ACT_PCPL (e.g. مُسْلِمِينَ): head PN sets kind «علم»; ACT_PCPL must survive.
    const pcpl = analyzeWord([
      ["مُسْلِمِينَ", "N", "PN|ACT_PCPL|ROOT:سلم|LEM:مُسْلِم|MP|GEN"],
    ]).segments[0];
    expect(pcpl.kind).toBe("علم");
    expect(pcpl.details).toContain("اسم فاعل");
    // NV|IMPV (e.g. هَلُمَّ): head NV sets kind «اسم فعل»; trailing IMPV must read as
    // the tense «أمر» (verb_tenses), NOT «لام الامر» (the particle sense).
    const nv = analyzeWord([["هَلُمَّ", "N", "NV|IMPV|LEM:هَلُمّ"]]).segments[0];
    expect(nv.kind).toBe("اسم فعل");
    expect(nv.details).toContain("أمر");
    expect(nv.details).not.toContain("لام الامر");
  });

  it("surfaces ADJ/INDEF/PASS attrs and never leaks a raw/unknown code", () => {
    const seg = analyzeWord([["x", "N", "TOTALLY_UNKNOWN|ROOT:xyz|ADJ|INDEF"]]).segments[0];
    expect(seg.kind).toBe("اسم"); // unknown head token: falls back to the plain noun kind
    expect(seg.details).toContain("نعت"); // ADJ
    expect(seg.details).toContain("نكرة"); // INDEF
    expect(seg.details.join(" ")).not.toMatch(/TOTALLY_UNKNOWN/);
  });
});
