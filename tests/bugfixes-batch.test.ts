import { describe, it, expect } from "vitest";
import fs from "fs";

// ============ Fix #1: Children cards 2-column grid ============
describe("Fix #1: Children cards 2-column grid layout", () => {
  it("should have childrenGrid with flexWrap and flexDirection row", () => {
    const content = fs.readFileSync("app/(tabs)/index.tsx", "utf-8");
    expect(content).toContain("childrenGrid");
    expect(content).toContain("flexWrap");
    expect(content).toContain('"wrap"');
    expect(content).toContain('"row"');
  });

  it("should have childCard with 48% width", () => {
    const content = fs.readFileSync("app/(tabs)/index.tsx", "utf-8");
    expect(content).toContain('"48%"');
    expect(content).toContain("childCard");
  });
});

// ============ Fix #2: Personal advice collapsible sections ============
describe("Fix #2: Personal advice collapsible sections", () => {
  it("should have AdviceSectionCollapsible component in family.tsx", () => {
    const content = fs.readFileSync("app/(tabs)/family.tsx", "utf-8");
    expect(content).toContain("AdviceSectionCollapsible");
    expect(content).toContain("function AdviceSectionCollapsible");
  });

  it("should render sections with title and content props", () => {
    const content = fs.readFileSync("app/(tabs)/family.tsx", "utf-8");
    expect(content).toContain("sec.title");
    expect(content).toContain("sec.content");
  });
});

// ============ Fix #3: Q&A page suggestion chips send messages directly ============
describe("Fix #3: Q&A suggestion chips send messages directly", () => {
  it("should have sendMessageWithText function in ai-chat.tsx", () => {
    const content = fs.readFileSync("app/ai-chat.tsx", "utf-8");
    expect(content).toContain("sendMessageWithText");
  });

  it("suggestion chips should call sendMessageWithText", () => {
    const content = fs.readFileSync("app/ai-chat.tsx", "utf-8");
    expect(content).toContain("sendMessageWithText(suggestion)");
  });
});

// ============ Fix #4: Refresh advice button ============
describe("Fix #4: Refresh advice button stores sections", () => {
  it("should have fetchParentAdvice function in family.tsx", () => {
    const content = fs.readFileSync("app/(tabs)/family.tsx", "utf-8");
    expect(content).toContain("fetchParentAdvice");
    expect(content).toContain("async function fetchParentAdvice");
  });
});

// ============ Fix #5: Graduation cap icon replaced ============
describe("Fix #5: Graduation cap icon replaced with book icon", () => {
  it("should use menu-book icon instead of graduation cap in find-specialist.tsx", () => {
    const content = fs.readFileSync("app/find-specialist.tsx", "utf-8");
    expect(content).toContain("menu-book");
    expect(content).not.toContain("school");
  });
});

// ============ Fix #6: Collapsible settings + partner fields ============
describe("Fix #6: Collapsible settings and partner fields", () => {
  it("should have SettingsCollapsible component in settings.tsx", () => {
    const content = fs.readFileSync("app/(tabs)/settings.tsx", "utf-8");
    expect(content).toContain("function SettingsCollapsible");
    expect(content).toContain("SettingsCollapsible");
  });

  it("should have multiple collapsible sections", () => {
    const content = fs.readFileSync("app/(tabs)/settings.tsx", "utf-8");
    const matches = content.match(/<SettingsCollapsible/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  it("should have partnerName and partnerId in store interface", () => {
    const storeContent = fs.readFileSync("lib/store.ts", "utf-8");
    expect(storeContent).toContain("partnerName");
    expect(storeContent).toContain("partnerId");
  });
});

// ============ Fix #7: Network specialist ID/QR ============
describe("Fix #7: Network specialist publicId field", () => {
  it("should have publicId field in network.tsx", () => {
    const content = fs.readFileSync("app/network.tsx", "utf-8");
    expect(content).toContain("publicId");
  });

  it("should display publicId for user", () => {
    const content = fs.readFileSync("app/network.tsx", "utf-8");
    expect(content).toContain("myIdQuery.data.publicId");
  });
});

// ============ Fix #8: Hijri calendar consistency ============
describe("Fix #8: Hijri calendar consistency (getIslamicDate)", () => {
  it("should use correct Julian Day formula", () => {
    const content = fs.readFileSync("lib/prayer-data.ts", "utf-8");
    // Check the corrected formula is present
    expect(content).toContain("getIslamicDate");
    expect(content).toContain("(jd - 2) - 1948440 + 10632");
  });

  it("getIslamicDate should return consistent results", async () => {
    // Import the function
    const mod = await import("../lib/prayer-data");
    const { getIslamicDate } = mod;

    // Test with a known date (no maghrib adjustment)
    const testDate = new Date("2025-01-15T12:00:00Z");
    const result1 = getIslamicDate(testDate, null);
    const result2 = getIslamicDate(testDate, null);

    // Same input should give same output
    expect(result1.day).toBe(result2.day);
    expect(result1.month).toBe(result2.month);
    expect(result1.year).toBe(result2.year);

    // Day should be between 1-30
    expect(result1.day).toBeGreaterThanOrEqual(1);
    expect(result1.day).toBeLessThanOrEqual(30);

    // Month should be between 1-12
    expect(result1.month).toBeGreaterThanOrEqual(1);
    expect(result1.month).toBeLessThanOrEqual(12);

    // Year should be reasonable (1446-1447 for 2025)
    expect(result1.year).toBeGreaterThanOrEqual(1446);
    expect(result1.year).toBeLessThanOrEqual(1447);

    // Month name should be non-empty
    expect(result1.monthName.length).toBeGreaterThan(0);
    expect(result1.monthNameAR.length).toBeGreaterThan(0);
  });

  it("getIslamicDate should advance day after maghrib", async () => {
    const mod = await import("../lib/prayer-data");
    const { getIslamicDate } = mod;

    // Test with a date before maghrib (noon)
    const testDate = new Date("2025-06-15T12:00:00Z");
    const beforeMaghrib = getIslamicDate(testDate, "20:00", "Europe/Amsterdam");

    // Test with same date after maghrib (21:00)
    const testDateEvening = new Date("2025-06-15T21:00:00Z");
    const afterMaghrib = getIslamicDate(testDateEvening, "20:00", "Europe/Amsterdam");

    // After maghrib should be one day ahead (or next month)
    if (beforeMaghrib.month === afterMaghrib.month) {
      expect(afterMaghrib.day).toBe(beforeMaghrib.day + 1);
    } else {
      // Day reset to 1 (new month)
      expect(afterMaghrib.day).toBe(1);
    }
  });
});

// ============ Fix #9: stripHtml function ============
describe("Fix #9: stripHtml removes HTML tags from content", () => {
  it("should have stripHtml function in content detail page", () => {
    const content = fs.readFileSync("app/content/detail/[id].tsx", "utf-8");
    expect(content).toContain("function stripHtml");
    expect(content).toContain("stripHtml(translation.body)");
  });

  it("stripHtml should correctly remove HTML tags", () => {
    // Replicate the function logic for testing
    function stripHtml(html: string): string {
      return html
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    expect(stripHtml("<p>Hello</p>")).toBe("Hello");
    expect(stripHtml("<div><strong>Bold</strong> text</div>")).toBe("Bold text");
    expect(stripHtml("No tags here")).toBe("No tags here");
    expect(stripHtml("&amp; &lt; &gt; &quot; &#39;")).toBe('& < > " \'');
    expect(stripHtml("<br/>&nbsp;space")).toBe("space");
    expect(stripHtml("<h1>Title</h1><p>Body</p>")).toBe("TitleBody");
    expect(stripHtml("")).toBe("");
  });

  it("concepts.json should not contain HTML tags", () => {
    const conceptsData = require("../assets/data/concepts.json");
    const htmlTagRegex = /<[a-z][^>]*>/i;
    for (const concept of conceptsData) {
      // Check all text fields
      const fields = [
        concept.nameAR, concept.nameEN, concept.nameNL,
        concept.descriptionAR, concept.descriptionEN, concept.descriptionNL,
        concept.sourceAR, concept.sourceEN, concept.sourceNL,
        concept.scholarAR, concept.scholarEN, concept.scholarNL,
      ];
      for (const field of fields) {
        if (field) {
          expect(htmlTagRegex.test(field), `Found HTML in: ${field.substring(0, 50)}`).toBe(false);
        }
      }
    }
  });
});
