import { describe, it, expect } from "vitest";
import { toArabicDigits, formatHijriDate, formatDigits, resolveNumeralSystem } from "@/lib/prayer-data";

describe("toArabicDigits", () => {
  it("converts 0-9 to Arabic-Indic digits", () => {
    expect(toArabicDigits(1448)).toBe("١٤٤٨");
  });
});

describe("formatDigits", () => {
  it("returns Arabic-Indic digits for the arabic numeral system", () => {
    expect(formatDigits(24, "arabic")).toBe("٢٤");
  });

  it("returns plain Western digits for the western numeral system", () => {
    expect(formatDigits(24, "western")).toBe("24");
  });

  it("renders nothing (not 'undefined'/'null') for a nullish value in either system", () => {
    expect(formatDigits(undefined, "arabic")).toBe("");
    expect(formatDigits(null, "western")).toBe("");
  });
});

describe("formatHijriDate", () => {
  const hijri = { day: 24, monthName: "Rabi' al-Awwal", monthNameAR: "ربيع الأوّل", year: 1448 };

  it("uses the Arabic month + Arabic-Indic digits for ar, with no ASCII digit", () => {
    const result = formatHijriDate(hijri, "ar");
    expect(result).toContain("ربيع الأوّل");
    expect(result).toContain("٢٤");
    expect(result).not.toMatch(/[0-9]/);
  });

  it.each(["en", "nl"] as const)("returns the Latin form for %s", (lang) => {
    expect(formatHijriDate(hijri, lang)).toBe("24 Rabi' al-Awwal 1448");
  });

  it("an explicit western numeralSystem keeps the Arabic month but switches to Western digits", () => {
    expect(formatHijriDate(hijri, "ar", "western")).toBe("24 ربيع الأوّل 1448");
  });

  it("an explicit arabic numeralSystem keeps the Latin month but switches to Arabic-Indic digits", () => {
    expect(formatHijriDate(hijri, "nl", "arabic")).toBe("٢٤ Rabi' al-Awwal ١٤٤٨");
  });
});

describe("resolveNumeralSystem", () => {
  it("an explicit valid raw value wins regardless of language", () => {
    expect(resolveNumeralSystem("western", "ar")).toBe("western");
    expect(resolveNumeralSystem("arabic", "nl")).toBe("arabic");
  });

  it.each([null, undefined, "", "invalid"])("falls back to arabic for lang ar when raw is %s", (raw) => {
    expect(resolveNumeralSystem(raw, "ar")).toBe("arabic");
  });

  it.each([null, undefined, "", "invalid"])("falls back to western for non-ar lang when raw is %s", (raw) => {
    expect(resolveNumeralSystem(raw, "nl")).toBe("western");
    expect(resolveNumeralSystem(raw, "en")).toBe("western");
    expect(resolveNumeralSystem(raw, null)).toBe("western");
  });
});
