import { describe, it, expect } from "vitest";
import conceptsData from "../assets/data/concepts.json";

describe("Concepts data", () => {
  it("should have at least 25 concepts", () => {
    expect(conceptsData.length).toBeGreaterThanOrEqual(25);
  });

  it("each concept should have required fields in all 3 languages", () => {
    for (const concept of conceptsData) {
      expect(concept.id).toBeTruthy();
      expect(concept.category).toBeTruthy();
      // Names
      expect(concept.nameAR).toBeTruthy();
      expect(concept.nameEN).toBeTruthy();
      expect(concept.nameNL).toBeTruthy();
      // Descriptions
      expect(concept.descriptionAR).toBeTruthy();
      expect(concept.descriptionEN).toBeTruthy();
      expect(concept.descriptionNL).toBeTruthy();
      // Sources
      expect(concept.sourceAR).toBeTruthy();
      expect(concept.sourceEN).toBeTruthy();
      expect(concept.sourceNL).toBeTruthy();
      // Scholar quotes
      expect(concept.scholarAR).toBeTruthy();
      expect(concept.scholarEN).toBeTruthy();
      expect(concept.scholarNL).toBeTruthy();
    }
  });

  it("each concept should have a valid category", () => {
    const validCategories = ["quran", "sunnah", "ibn_taymiyyah", "ibn_qayyim", "mawsouah", "gezinskunde", "names_of_allah"];
    for (const concept of conceptsData) {
      expect(validCategories).toContain(concept.category);
    }
  });

  it("should have concepts from all 4 categories", () => {
    const categories = new Set(conceptsData.map((c: any) => c.category));
    expect(categories.has("quran")).toBe(true);
    expect(categories.has("sunnah")).toBe(true);
    expect(categories.has("ibn_taymiyyah")).toBe(true);
    expect(categories.has("ibn_qayyim")).toBe(true);
  });

  it("each concept should have unique id", () => {
    const ids = conceptsData.map((c: any) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("Arabic names should contain Arabic characters", () => {
    const arabicRegex = /[\u0600-\u06FF]/;
    for (const concept of conceptsData) {
      expect(arabicRegex.test(concept.nameAR)).toBe(true);
      expect(arabicRegex.test(concept.descriptionAR)).toBe(true);
    }
  });
});

describe("Tab layout - concepts tab", () => {
  it("icon-symbol.tsx should have lightbulb.fill mapping", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/ui/icon-symbol.tsx", "utf-8");
    expect(content).toContain('"lightbulb.fill"');
    expect(content).toContain('"lightbulb"');
    expect(content).toContain('"book.fill"');
  });

  it("_layout.tsx should have concepts tab and settings hidden", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("app/(tabs)/_layout.tsx", "utf-8");
    expect(content).toContain('name="concepts"');
    expect(content).toContain('name="settings"');
    expect(content).toContain("href: null");
    expect(content).toContain("book.fill");
  });

  it("i18n should have tab.concepts translation (now Quran)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("lib/i18n.tsx", "utf-8");
    expect(content).toContain('"tab.concepts"');
    expect(content).toContain("القرآن");
    expect(content).toContain("Quran");
  });
});
