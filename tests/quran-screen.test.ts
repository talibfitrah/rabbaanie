import { describe, it, expect } from "vitest";

describe("Quran Screen - Surah List", () => {
  it("should have 114 surahs defined", async () => {
    // Import the concepts.tsx module to verify SURAH_LIST
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/concepts.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Count surah entries in the file
    const surahMatches = content.match(/\{ number: \d+, name:/g);
    expect(surahMatches).not.toBeNull();
    expect(surahMatches!.length).toBe(114);
  });

  it("should have correct first and last surah", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/concepts.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Check first surah
    expect(content).toContain('number: 1, name: "الفاتحة"');
    // Check last surah
    expect(content).toContain('number: 114, name: "الناس"');
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
  it("should have quran tab in layout", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../app/(tabs)/_layout.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    
    expect(content).toContain('t("tab.quran")');
    expect(content).toContain('text.book.closed.fill');
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
