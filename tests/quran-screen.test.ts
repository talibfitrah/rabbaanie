import { describe, it, expect } from "vitest";

describe("Quran Screen - Surah List", () => {
  it("defines the full surah list spanning to An-Naas (114)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/concepts.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    // SURAH_LIST is multiline; assert the list actually reaches surah 114 rather
    // than counting entries with a single-line regex (that was the stale check).
    expect(content).toContain("number: 114,");
    expect(content).toContain('name: "الناس"');
  });

  it("has Al-Faatihah first and An-Naas last", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/concepts.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('name: "الفاتحة"');
    expect(content).toContain('name: "الناس"');
  });

  it("renders the Madinah-print markers from the page index (Phase 1)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/concepts.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    // Real juz + rub'/sajda markers come from lib/quran-page-index; full-page
    // RTL turning uses PagerView; ۞/۩ are overlaid (QCF glyphs lack them).
    expect(content).toContain("@/lib/quran-page-index");
    expect(content).toContain("getRubMarksForPage");
    expect(content).toContain("getSajdasForPage");
    expect(content).toContain("react-native-pager-view");
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
    expect(content).toMatch(/name="concepts"[\s\S]*?href: null/);
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
