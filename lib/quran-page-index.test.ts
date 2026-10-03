import { describe, it, expect } from "vitest";
import { PAGE_TO_JUZ, PAGE_TO_EIGHTH, RUB_STARTS, SAJDAS, getJuzStartPage } from "./quran-page-index";

const TOTAL_PAGES = 604;

describe("quran-page-index — PAGE_TO_JUZ", () => {
  it("covers pages 1-604 with a juz number in range 1-30, all 30 present", () => {
    const juzSet = new Set<number>();
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const juz = PAGE_TO_JUZ[page];
      expect(juz).toBeGreaterThanOrEqual(1);
      expect(juz).toBeLessThanOrEqual(30);
      juzSet.add(juz);
    }
    expect(juzSet.size).toBe(30);
  });

  it("page 1 is juz 1", () => {
    expect(PAGE_TO_JUZ[1]).toBe(1);
  });

  it("is monotonic non-decreasing across all pages", () => {
    for (let page = 1; page < TOTAL_PAGES; page++) {
      expect(PAGE_TO_JUZ[page + 1]).toBeGreaterThanOrEqual(PAGE_TO_JUZ[page]);
    }
  });
});

describe("quran-page-index — PAGE_TO_EIGHTH", () => {
  it("covers pages 1-604 with an eighth-of-juz in range 1-8", () => {
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      expect(PAGE_TO_EIGHTH[page]).toBeGreaterThanOrEqual(1);
      expect(PAGE_TO_EIGHTH[page]).toBeLessThanOrEqual(8);
    }
  });
});

describe("quran-page-index — RUB_STARTS", () => {
  it("has exactly 240 rub' al-hizb starts, numbered sequentially 1-240", () => {
    expect(RUB_STARTS.length).toBe(240);
    expect(RUB_STARTS.map((r) => r.rub)).toEqual(
      Array.from({ length: 240 }, (_, i) => i + 1),
    );
  });

  it("derives eighthOfJuz (1-8) consistently from rub and keeps hizb/juz in range", () => {
    for (const r of RUB_STARTS) {
      expect(r.eighthOfJuz).toBe(((r.rub - 1) % 8) + 1);
      expect(r.hizb).toBeGreaterThanOrEqual(1);
      expect(r.hizb).toBeLessThanOrEqual(60);
      expect(r.juz).toBeGreaterThanOrEqual(1);
      expect(r.juz).toBeLessThanOrEqual(30);
      expect(r.page).toBeGreaterThanOrEqual(1);
      expect(r.page).toBeLessThanOrEqual(TOTAL_PAGES);
      expect(r.verseKey).toMatch(/^\d+:\d+$/);
    }
  });

  it("rub 1 starts at the Qur'an's first verse", () => {
    expect(RUB_STARTS[0]).toMatchObject({ page: 1, verseKey: "1:1", juz: 1, hizb: 1, eighthOfJuz: 1 });
  });
});

describe("quran-page-index — SAJDAS", () => {
  it("has exactly 15 sajda verses, each a valid verse key", () => {
    expect(SAJDAS.length).toBe(15);
    const seen = new Set<string>();
    for (const s of SAJDAS) {
      expect(s.verseKey).toMatch(/^\d+:\d+$/);
      expect(s.page).toBeGreaterThanOrEqual(1);
      expect(s.page).toBeLessThanOrEqual(TOTAL_PAGES);
      seen.add(s.verseKey);
    }
    expect(seen.size).toBe(15); // no duplicates
  });
});

describe("quran-page-index — getJuzStartPage", () => {
  it("returns the page each juz actually starts on (its first rub), not the page PAGE_TO_JUZ first tags with it", () => {
    expect(getJuzStartPage(1)).toBe(1);
    expect(getJuzStartPage(4)).toBe(62);
    expect(getJuzStartPage(7)).toBe(121);
    expect(getJuzStartPage(11)).toBe(201);
    expect(getJuzStartPage(26)).toBe(502);
    expect(getJuzStartPage(30)).toBe(582);
  });
});
