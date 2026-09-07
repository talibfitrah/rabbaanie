import { describe, it, expect } from "vitest";
import { toArabicDigits, formatHijriDate } from "@/lib/prayer-data";

describe("toArabicDigits", () => {
  it("converts 0-9 to Arabic-Indic digits", () => {
    expect(toArabicDigits(1448)).toBe("١٤٤٨");
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
});
