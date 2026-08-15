import { describe, it, expect } from "vitest";
import { buildConsultationRtf, rtfEscape } from "../lib/consultation-rtf";

// The first "real Word file" was Word-flavoured HTML named .doc. Desktop Word
// takes it; Word on Android refused to open it at all, so Daa3iyah got a file he
// could not read — worse than the plain text it replaced. RTF is what every Word
// build opens, but it is 7-bit, and Arabic is entirely non-ASCII: get the
// escaping wrong and the document opens to a blank page. tsc cannot see that,
// so it is checked here.

const PLAN = [
  "خطة علاج",
  "1. تشخيص المشكلة",
  "- اجلس مع ابنك بعد صلاة الفجر كلّ يوم",
].join("\n");

describe("Arabic survives the 7-bit encoding", () => {
  it("escapes non-ASCII as \\uNNNN with an ASCII fallback", () => {
    // ا = U+0627 = 1575.
    expect(rtfEscape("ا")).toBe("\\u1575?");
  });

  it("leaves ASCII alone", () => {
    expect(rtfEscape("Week 1")).toBe("Week 1");
  });

  it("escapes the three characters that would otherwise be RTF syntax", () => {
    // Unescaped, a brace or backslash truncates the document at that point.
    expect(rtfEscape("{a}\\b")).toBe("\\{a\\}\\\\b");
  });

  it("emits no raw non-ASCII byte anywhere in the document", () => {
    // The actual failure: a stray UTF-8 byte makes Word show mojibake or stop.
    const doc = buildConsultationRtf({
      title: "استشارة عبد الرؤوف",
      childName: "عبد الرؤوف",
      date: "2026-08-16",
      messages: [
        { role: "user", content: "يصرخ قبل الاستيقاظ" },
        { role: "assistant", content: PLAN },
      ],
      isArabic: true,
    });
    // eslint-disable-next-line no-control-regex
    expect(doc).toMatch(/^[\x00-\x7F]*$/);
  });
});

describe("the document is well formed and complete", () => {
  const doc = buildConsultationRtf({
    title: "استشارة",
    childName: "عبد الرؤوف",
    date: "2026-08-16",
    messages: [
      { role: "user", content: "يصرخ قبل الاستيقاظ" },
      { role: "assistant", content: PLAN },
    ],
    isArabic: true,
  });

  it("opens and closes as an RTF file", () => {
    expect(doc.startsWith("{\\rtf1")).toBe(true);
    expect(doc.endsWith("}")).toBe(true);
  });

  it("balances its braces, which is what truncates a document when it fails", () => {
    let depth = 0;
    for (let i = 0; i < doc.length; i++) {
      if (doc[i] === "\\") { i++; continue; } // escaped char, not syntax
      if (doc[i] === "{") depth++;
      if (doc[i] === "}") depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it("lays the page out right-to-left for an Arabic consultation", () => {
    expect(doc).toContain("\\rtlpar");
    expect(buildConsultationRtf({ title: "x", messages: [], isArabic: false })).toContain("\\ltrpar");
  });

  it("carries the plan's headings as headings, not as body text", () => {
    // "خطة علاج" and "1. تشخيص المشكلة" are headings to parsePlanText, so they
    // must come out bold and larger — the whole reason for the format.
    const headingRuns = doc.match(/\\fs(32|28)\\b /g) ?? [];
    expect(headingRuns.length).toBeGreaterThan(0);
  });

  it("includes every turn of the conversation", () => {
    // 3 escaped Arabic words that only appear in the user's message.
    expect(doc).toContain(rtfEscape("يصرخ قبل الاستيقاظ"));
    expect(doc).toContain(rtfEscape("اجلس مع ابنك بعد صلاة الفجر كلّ يوم"));
  });
});
