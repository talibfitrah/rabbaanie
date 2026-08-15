import { describe, it, expect } from "vitest";
import {
  isArabicSectionHeading,
  isLatinSectionHeading,
} from "../lib/plan-heading";

describe("arabic plan section headers", () => {
  // Every heading the Arabic advisor is told to write must open its own section,
  // or it is swallowed into the body of the section above it.
  const HEADERS = [
    "التشخيص:",
    "علاج في التصفية:",
    "مهام الوالد:",
    "مهام الابن:",
    "الجدول الزمني والتقييم:",
  ];

  for (const header of HEADERS) {
    it(`treats "${header}" as a section header`, () => {
      expect(isArabicSectionHeading(header)).toBe(true);
    });
  }

  // Both the renderer and the step parser ask this, and the advisor bolds its
  // headings often. A bolded heading that is not recognised is the original
  // defect: it gets folded into the section above instead of opening its own.
  it("recognises a heading the advisor wrote in bold", () => {
    expect(isArabicSectionHeading("**علاج في التزكية:**")).toBe(true);
    expect(isArabicSectionHeading("**مهام الوالد:**")).toBe(true);
  });

  it("does not promote an ordinary task line", () => {
    expect(
      isArabicSectionHeading("اغرس في عقله أن الرزق من عند الله وحده لا شريك له"),
    ).toBe(false);
  });
});

// Regression guard: before this, an en/nl plan produced no heading1 at all, so
// groupIntoSections put the whole plan in one collapsed section titled "مقدمة"
// and every section header rendered as a tickable checkbox.

describe("english plan section headers", () => {
  // Titles as they arrive after the leading "N. " is stripped by cleanMarkdown.
  const HEADERS = [
    "DIAGNOSIS & ANALYSIS",
    "WHAT MUST THE PARENT CHANGE FIRST?",
    "TREATMENT PLAN - FOUNDATION: 'AQEEDAH",
    "FIVE STEPS OF ERROR CORRECTION",
    "TIMELINE & EVALUATION",
  ];

  for (const header of HEADERS) {
    it(`treats "${header}" as a section header`, () => {
      expect(isLatinSectionHeading(header)).toBe(true);
    });
  }

  it("still recognises a header whose parenthetical is lower-case", () => {
    expect(
      isLatinSectionHeading("TREATMENT PLAN - TASFIYA (correcting child's mind)"),
    ).toBe(true);
  });
});

describe("dutch plan section headers", () => {
  it("recognises the Dutch parent section", () => {
    expect(isLatinSectionHeading("WAT MOET DE OUDER ZELF EERST VERANDEREN?")).toBe(
      true,
    );
  });

  it("recognises the Dutch treatment section", () => {
    expect(isLatinSectionHeading("BEHANDELPLAN - FUNDAMENT: 'AQIEDAH")).toBe(true);
  });
});

describe("ordinary task lines are not promoted to headings", () => {
  it("rejects a sentence-case English task", () => {
    expect(
      isLatinSectionHeading("Read one page of Qur'aan with him after Fajr"),
    ).toBe(false);
  });

  it("rejects a Dutch sentence-case task", () => {
    expect(isLatinSectionHeading("Lees elke dag een pagina met hem")).toBe(false);
  });
});

describe("arabic lines are never treated as latin headings", () => {
  // Arabic has no letter case, so a naive toUpperCase() check would match every
  // Arabic task line and shatter the Arabic plan into bogus sections.
  it("rejects an Arabic task line", () => {
    expect(isLatinSectionHeading("صلِّ معه ركعتين كل يوم بعد المغرب")).toBe(false);
  });

  it("rejects an Arabic section title", () => {
    expect(isLatinSectionHeading("مهام الوالد - التربية البعيدة المدى")).toBe(false);
  });

  it("rejects a digits-only line", () => {
    expect(isLatinSectionHeading("2026")).toBe(false);
  });
});

describe("an Arabic task line is never promoted to a heading", () => {
  // Arabic has no letter case, so `head === head.toUpperCase()` is true for any
  // Arabic line whose only Latin characters are already capitals — and parents
  // write plenty of those: TV, PC, AI, SMS, QR, WhatsApp abbreviations. The
  // line then parses as heading1 instead of a task, so the step disappears from
  // the checklist AND from that section's completed/total count. The doc
  // comment claimed the Latin-letter requirement prevented exactly this.
  for (const line of [
    "راقب استخدام TV يوميًا",
    "اضبط إعدادات PC للطفل",
    "امنع تطبيقات AI عن الطفل",
    "أرسل SMS للمعلّم",
  ]) {
    it(`treats "${line}" as a task, not a heading`, () => {
      expect(isLatinSectionHeading(line)).toBe(false);
    });
  }

  it("still recognises a genuine Latin ALL-CAPS heading", () => {
    // The capability this exists for must not vanish with the fix.
    expect(isLatinSectionHeading("WHAT MUST THE PARENT CHANGE FIRST?")).toBe(true);
    expect(isLatinSectionHeading("TREATMENT PLAN - TASFIYA (correcting the mind)")).toBe(true);
    expect(isLatinSectionHeading("ADVIES VOOR DE OUDER")).toBe(true);
  });

  it("still rejects a lower-case Latin line", () => {
    expect(isLatinSectionHeading("teach him to pray on time")).toBe(false);
  });
});
