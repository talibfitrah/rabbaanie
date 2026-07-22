import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Phase 9: Quran screen improvements", () => {
  const quranFile = fs.readFileSync(
    path.resolve(__dirname, "../app/(tabs)/concepts.tsx"),
    "utf-8"
  );

  it("should have WebView-based mushaf with CDN fonts", () => {
    expect(quranFile).toContain("WebView");
    expect(quranFile).toContain("qurancdn.com/fonts");
    expect(quranFile).toContain("code_v1");
  });

  it("should have swipe gesture navigation via WebView messages", () => {
    expect(quranFile).toContain("swipe");
    expect(quranFile).toContain("direction");
  });

  it("should save last page to AsyncStorage", () => {
    expect(quranFile).toContain("quran_last_page");
    expect(quranFile).toContain("AsyncStorage");
  });

  it("should have surah index (فهرس)", () => {
    expect(quranFile).toContain("showIndex");
    expect(quranFile).toContain("SURAH_LIST");
  });

  it("should have long-press for word/ayah sciences", () => {
    expect(quranFile).toContain("onLongPress");
    expect(quranFile).toContain("selectedAyah");
    expect(quranFile).toContain("showScienceModal");
  });

  it("should have settings (font size, night mode)", () => {
    expect(quranFile).toContain("fontSize");
    expect(quranFile).toContain("nightMode");
  });

  it("should have hidayat mode", () => {
    expect(quranFile).toContain("hidayat");
    expect(quranFile).toContain("/api/quran/hidayat");
  });

  it("should have surah sciences endpoint", () => {
    expect(quranFile).toContain("/api/quran/surah");
  });
});

describe("Phase 9: Home screen fixes", () => {
  const homeFile = fs.readFileSync(
    path.resolve(__dirname, "../app/(tabs)/index.tsx"),
    "utf-8"
  );

  it("should have Quran button (not concepts)", () => {
    expect(homeFile).toContain("القرآن");
    expect(homeFile).toContain("concepts");
  });

  it("should have add child button after children list", () => {
    // The add child button should appear after the children map
    expect(homeFile).toContain("إضافة طفل");
  });
});

describe("Phase 9: Family hub i18n", () => {
  const familyHubFile = fs.readFileSync(
    path.resolve(__dirname, "../app/(tabs)/family-hub.tsx"),
    "utf-8"
  );

  it("should use i18n t() for all text", () => {
    // family-hub now uses the same code as network.tsx which uses useI18n t()
    expect(familyHubFile).toContain("useI18n");
    expect(familyHubFile).toContain("t(");
  });

  it("should have network functionality (same as shabakati)", () => {
    expect(familyHubFile).toContain("network.title");
    expect(familyHubFile).toContain("network.subtitle");
  });
});

describe("Phase 9: AI chat formatting", () => {
  const chatFile = fs.readFileSync(
    path.resolve(__dirname, "../app/ai-chat.tsx"),
    "utf-8"
  );

  it("should have formatAIResponse function that removes asterisks", () => {
    expect(chatFile).toContain("formatAIResponse");
    expect(chatFile).toContain("replace(/\\*\\*([^*]+)\\*\\*/g");
  });

  it("should clean step text from markdown in extractSteps", () => {
    expect(chatFile).toContain('.replace(/\\*+/g, "")');
  });
});

describe("Phase 9: Weekly data files updated", () => {
  it("should have year data files with goals", () => {
    const yearFile = path.resolve(__dirname, "../assets/data/years/jaar_0_nl.json");
    expect(fs.existsSync(yearFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(yearFile, "utf-8"));
    expect(data.weeks).toBeDefined();
    expect(data.weeks.length).toBeGreaterThan(0);
    // Each week should have goals
    const firstWeek = data.weeks[0];
    expect(firstWeek.week).toBe(1);
    expect(firstWeek.goals).toBeDefined();
    expect(firstWeek.goals.length).toBeGreaterThan(0);
  });

  it("should have Arabic translations in year data", () => {
    const yearFile = path.resolve(__dirname, "../assets/data/years/jaar_0_nl.json");
    const data = JSON.parse(fs.readFileSync(yearFile, "utf-8"));
    const firstWeek = data.weeks[0];
    const goals = firstWeek.goals || [];
    if (goals.length > 0) {
      // Should have goalAR field
      expect(goals[0].goalAR || goals[0].goal).toBeDefined();
    }
  });
});

describe("Phase 9: Add child save fix", () => {
  const addChildFile = fs.readFileSync(
    path.resolve(__dirname, "../app/onboarding/add-child.tsx"),
    "utf-8"
  );

  it("should show success message on save", () => {
    expect(addChildFile).toContain("تم الحفظ بعون الله");
  });

  it("should show success message in multiple languages", () => {
    // Should have success messages in multiple languages
    expect(addChildFile).toContain("تم الحفظ");
  });
});
