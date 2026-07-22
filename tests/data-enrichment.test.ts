import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const dataDir = path.resolve(__dirname, "../assets/data");
const fitrahDir = path.resolve(__dirname, "../data");

describe("Book 10 - الطرق والوسائل التربوية", () => {
  const book10Path = path.join(dataDir, "library/book_10.json");
  const indexPath = path.join(dataDir, "library/index.json");
  const coversPath = path.join(dataDir, "library/cover_urls.json");

  it("book_10.json exists and has correct structure", () => {
    const book = JSON.parse(fs.readFileSync(book10Path, "utf-8"));
    expect(book.id).toBe(10);
    expect(book.title_ar).toBe("الطرق والوسائل التربوية");
    expect(book.chapters.length).toBeGreaterThan(40);
    // Each chapter should have sections array
    for (const ch of book.chapters) {
      expect(ch).toHaveProperty("title");
      expect(ch).toHaveProperty("sections");
      expect(Array.isArray(ch.sections)).toBe(true);
      if (ch.sections.length > 0) {
        expect(ch.sections[0]).toHaveProperty("content");
      }
    }
  });

  it("library index includes book 10", () => {
    const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    const book10 = index.find((b: any) => b.id === 10);
    expect(book10).toBeDefined();
    expect(book10.title_ar).toBe("الطرق والوسائل التربوية");
    expect(book10.total_chapters).toBeGreaterThan(40);
  });

  it("cover_urls.json includes book_10", () => {
    const covers = JSON.parse(fs.readFileSync(coversPath, "utf-8"));
    expect(covers.book_10).toBeDefined();
    expect(covers.book_10).toContain("http");
  });
});

describe("Fitrah data enrichment - 0-2 age group", () => {
  const fitrahPath = path.join(fitrahDir, "fitrah_tasyeer.json");

  it("fitrah_tasyeer.json has 7 age groups including 0-2", () => {
    const data = JSON.parse(fs.readFileSync(fitrahPath, "utf-8"));
    expect(data.ageGroups.length).toBe(7);
    expect(data.ageGroups[0].id).toBe("0-2");
  });

  it("0-2 age group has traits and heart actions", () => {
    const data = JSON.parse(fs.readFileSync(fitrahPath, "utf-8"));
    const group02 = data.ageGroups[0];
    expect(group02.fitrahTraits.length).toBeGreaterThan(40);
    expect(group02.heartActions.length).toBeGreaterThan(0);
    expect(group02.title.ar).toContain("الرضع");
  });

  it("new traits have detailed fields", () => {
    const data = JSON.parse(fs.readFileSync(fitrahPath, "utf-8"));
    const group02 = data.ageGroups[0];
    const traitWithDetails = group02.fitrahTraits.find((t: any) => t.details);
    expect(traitWithDetails).toBeDefined();
    expect(traitWithDetails.details).toHaveProperty("self_leadership");
    expect(traitWithDetails.details).toHaveProperty("emotions");
    expect(traitWithDetails.details).toHaveProperty("patience");
  });

  it("existing groups are enriched with new traits", () => {
    const data = JSON.parse(fs.readFileSync(fitrahPath, "utf-8"));
    // 2-4 group should have more than original 25 traits
    const group24 = data.ageGroups.find((g: any) => g.id === "2-4");
    expect(group24.fitrahTraits.length).toBeGreaterThan(25);
  });
});

describe("Names of Allah enrichment", () => {
  const namesPath = path.join(fitrahDir, "names_of_allah.json");

  it("names_of_allah.json has 7 age groups including 0-2", () => {
    const data = JSON.parse(fs.readFileSync(namesPath, "utf-8"));
    expect(data.ageGroups.length).toBe(7);
    expect(data.ageGroups[0].id).toBe("age_0_2");
  });

  it("0-2 age group has 4 names with detailed fields", () => {
    const data = JSON.parse(fs.readFileSync(namesPath, "utf-8"));
    const group02 = data.ageGroups[0];
    expect(group02.names.length).toBe(4);
    const name = group02.names[0];
    expect(name).toHaveProperty("name");
    expect(name).toHaveProperty("meaning");
    expect(name).toHaveProperty("tasfiya");
    expect(name).toHaveProperty("tazkiya");
  });

  it("existing groups are enriched with new names", () => {
    const data = JSON.parse(fs.readFileSync(namesPath, "utf-8"));
    // 7-9 group should now have 36 names (was 0 before)
    const group79 = data.ageGroups.find((g: any) => g.id === "age_7_9");
    expect(group79.names.length).toBe(36);
  });
});

describe("Weekly tarbiya data enrichment - Year 0", () => {
  const year0Path = path.join(dataDir, "tarbiya/year_0.json");

  it("year_0.json has enriched goals", () => {
    const data = JSON.parse(fs.readFileSync(year0Path, "utf-8"));
    expect(data.weeks.length).toBe(52);
    // Total goals should be more than original (was ~16 per week * 52 = 832)
    const totalGoals = data.weeks.reduce((sum: number, w: any) => sum + w.goals_count, 0);
    expect(totalGoals).toBeGreaterThan(850);
  });

  it("new goals include fitrah traits type", () => {
    const data = JSON.parse(fs.readFileSync(year0Path, "utf-8"));
    const allGoals = data.weeks.flatMap((w: any) => w.goals);
    const fitrahGoals = allGoals.filter((g: any) => g.type === "5. تسيير الفطرة");
    expect(fitrahGoals.length).toBeGreaterThan(0);
  });

  it("new goals include names of Allah", () => {
    const data = JSON.parse(fs.readFileSync(year0Path, "utf-8"));
    const allGoals = data.weeks.flatMap((w: any) => w.goals);
    const nameGoals = allGoals.filter((g: any) => g.goal?.includes("غرس اسم الله"));
    expect(nameGoals.length).toBe(4);
  });
});

describe("Supporting data files", () => {
  it("fitrah_traits_detailed.json has 192 entries", () => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, "fitrah_traits_detailed.json"), "utf-8"));
    expect(data.length).toBe(192);
  });

  it("allah_names_by_age.json has 99 entries", () => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, "allah_names_by_age.json"), "utf-8"));
    expect(data.length).toBe(99);
  });

  it("heart_deeds.json has 66 entries", () => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, "heart_deeds.json"), "utf-8"));
    expect(data.length).toBe(66);
  });

  it("educational_methods.json has 48 entries", () => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, "educational_methods.json"), "utf-8"));
    expect(data.length).toBe(48);
  });

  it("tarbiya_rules.json has 32 entries", () => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, "tarbiya_rules.json"), "utf-8"));
    expect(data.length).toBe(32);
  });

  it("concepts_tawheed.json has 14 entries", () => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, "concepts_tawheed.json"), "utf-8"));
    expect(data.length).toBe(14);
  });
});
