import { describe, it, expect } from "vitest";
import emotionPathData from "../assets/data/emotion_path.json";

describe("Adhkar & Misconceptions API endpoints", () => {
  const BASE = "http://127.0.0.1:3000";

  it("GET /api/adhkar/contexts returns 80 contexts", async () => {
    const res = await fetch(`${BASE}/api/adhkar/contexts`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(80);
    expect(data[0]).toHaveProperty("context_code");
    expect(data[0]).toHaveProperty("count");
  });

  it("GET /api/adhkar?context=morning returns morning adhkar", async () => {
    const res = await fetch(`${BASE}/api/adhkar?context=morning`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(10);
    expect(data[0]).toHaveProperty("text_ar");
    expect(data[0]).toHaveProperty("text_nl");
    expect(data[0]).toHaveProperty("text_en");
    expect(data[0]).toHaveProperty("context_code", "morning");
  });

  it("GET /api/adhkar without context returns 400", async () => {
    const res = await fetch(`${BASE}/api/adhkar`);
    expect(res.status).toBe(400);
  });

  it("GET /api/misconceptions returns all 109 misconceptions", async () => {
    const res = await fetch(`${BASE}/api/misconceptions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(109);
    expect(data[0]).toHaveProperty("misconception_ar");
    expect(data[0]).toHaveProperty("refutation_ar");
  });

  it("GET /api/misconceptions/groups returns 13 groups", async () => {
    const res = await fetch(`${BASE}/api/misconceptions/groups`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(13);
    expect(data[0]).toHaveProperty("age_group");
    expect(data[0]).toHaveProperty("count");
  });

  it("GET /api/misconceptions?group=... filters by age group", async () => {
    const groupsRes = await fetch(`${BASE}/api/misconceptions/groups`);
    const groups = await groupsRes.json();
    const firstGroup = groups[0].age_group;
    const expectedCount = Number(groups[0].count);

    const res = await fetch(`${BASE}/api/misconceptions?group=${encodeURIComponent(firstGroup)}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBe(expectedCount);
  });
});

describe("Emotion Path data structure", () => {
  it("has 7 weeks", () => {
    expect(emotionPathData.weeks).toHaveLength(7);
  });

  it("each week has required fields in 3 languages", () => {
    for (const week of emotionPathData.weeks) {
      expect(week.title).toHaveProperty("ar");
      expect(week.title).toHaveProperty("nl");
      expect(week.title).toHaveProperty("en");
      expect(week.focus).toHaveProperty("ar");
      expect(week.focus).toHaveProperty("nl");
      expect(week.focus).toHaveProperty("en");
      expect(week.dhikr).toHaveProperty("ar");
      expect(week.dhikr).toHaveProperty("nl");
      expect(week.dhikr).toHaveProperty("en");
      expect(week.evidence).toHaveProperty("ar");
      expect(week.evidence).toHaveProperty("nl");
      expect(week.evidence).toHaveProperty("en");
      expect(week.parent_tasks.length).toBeGreaterThanOrEqual(2);
      expect(week.child_tasks.length).toBeGreaterThanOrEqual(1);
      expect(["tasfiya", "tazkiya", "tarbiya"]).toContain(week.domain);
    }
  });

  it("has correct domain progression (tasfiya → tazkiya → tarbiya)", () => {
    // Week 1: tasfiya, Weeks 2-3: tazkiya, Week 4: tarbiya, Week 5-6: tazkiya, Week 7: tarbiya
    expect(emotionPathData.weeks[0].domain).toBe("tasfiya");
    expect(emotionPathData.weeks[1].domain).toBe("tazkiya");
    expect(emotionPathData.weeks[6].domain).toBe("tarbiya");
  });

  it("title and description have 3 languages", () => {
    expect(emotionPathData.title).toHaveProperty("ar");
    expect(emotionPathData.title).toHaveProperty("nl");
    expect(emotionPathData.title).toHaveProperty("en");
    expect(emotionPathData.description).toHaveProperty("ar");
    expect(emotionPathData.description).toHaveProperty("nl");
    expect(emotionPathData.description).toHaveProperty("en");
  });
});
