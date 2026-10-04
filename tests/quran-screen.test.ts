import { describe, it, expect } from "vitest";
import { SURAH_LIST } from "@/lib/surah-list";

describe("Quran Screen - Surah List", () => {
  it("has exactly 114 surahs, Al-Faatihah first and An-Naas last", () => {
    // Real data import, not a string search — passes only if the list is
    // actually complete (a missing/duplicated surah changes the count).
    expect(SURAH_LIST.length).toBe(114);
    expect(SURAH_LIST[0]).toMatchObject({ number: 1, name: "الفاتحة" });
    expect(SURAH_LIST[113]).toMatchObject({ number: 114, name: "الناس" });
    const numbers = SURAH_LIST.map((s) => s.number);
    expect(new Set(numbers).size).toBe(114); // no duplicates
    expect(Math.min(...numbers)).toBe(1);
    expect(Math.max(...numbers)).toBe(114);
  });

  it("renders the Madinah-print markers from real page-index calls, not just mentions of them", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/concepts.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    // Real juz + rub'/sajda markers come from lib/quran-page-index; full-page
    // RTL turning uses a virtualized FlatList whose page math lives in the
    // testable lib/mushaf-paging (see tests/mushaf-paging.test.ts).
    expect(content).toContain("@/lib/quran-page-index");
    expect(content).toContain("@/lib/mushaf-paging");
    // Paging-specific props — present ONLY on the horizontal page FlatList, not
    // the vertical surah/juz index lists, so this fails if the pager is removed
    // (unlike a bare toContain("FlatList"), which the index lists also satisfy).
    expect(content).toContain("pagingEnabled");
    expect(content).toContain("onMomentumScrollEnd");
    expect(content).toMatch(/getItemLayout=/);
    // Actual function CALLS (name followed by a real argument) — a bare
    // `toContain("getRubMarksForPage")` would also pass if the name only
    // appeared in a comment.
    expect(content).toMatch(/getRubMarksForPage\([a-zA-Z_]\w*\)/);
    expect(content).toMatch(/getSajdasForPage\([a-zA-Z_]\w*\)/);
    // The header renders both marker glyphs. The gating logic is exercised by the
    // page-index + paging unit tests; asserting glyph presence here avoids a
    // byte-distance check that a reformat would break.
    expect(content).toContain("۞");
    expect(content).toContain("۩");
  });

  it("should use quran.com CDN fonts for mushaf rendering", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/concepts.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Verify CDN font usage and WebView approach
    expect(content).toContain("qurancdn.com/fonts");
    expect(content).toContain("woff2");
    expect(content).toContain("code_v1");
  });

  it("should use WebView for high-quality rendering", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/concepts.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain("WebView");
    expect(content).toContain("generateMushafHTML");
  });
});

describe("Fitrah Screen - Concepts Tab", () => {
  it("should import concepts data in fitrah.tsx", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/fitrah.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain('import conceptsData from "@/assets/data/concepts.json"');
  });

  it("should have concepts as a section tab option", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/fitrah.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain('"concepts" as SectionTab');
    expect(content).toContain('type SectionTab = "traits" | "hearts" | "names" | "concepts"');
  });

  it("should filter out names_of_allah from concepts", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/fitrah.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain('c.category !== "names_of_allah"');
  });

  it("should render concepts section in detail view", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/fitrah.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain('{sectionTab === "concepts" && renderConcepts()}');
  });
});

describe("Tab Layout - Quran Tab", () => {
  it("registers the quran (concepts) screen as a hidden tab", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/_layout.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    // The mushaf lives on the `concepts` screen, registered as a hidden tab
    // (href: null) and reached via router.push from the dhikri card — not a
    // visible bottom-bar tab (the old `t("tab.quran")` assertion was stale).
    expect(content).toContain('name="concepts"');
    expect(content).toMatch(/name="concepts"(?:(?!name=)[\s\S])*?href:\s*null/);
  });

  it("should have icon mapping for text.book.closed.fill", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../components/ui/icon-symbol.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain('"text.book.closed.fill": "auto-stories"');
  });
});

describe("i18n - Quran translation", () => {
  it("should have tab.quran translation key", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../lib/i18n.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain('"tab.quran"');
  });
});
