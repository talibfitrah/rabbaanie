import { describe, it, expect } from "vitest";
import fs from "fs";
import {
  issuesSignature,
  getWeekPlanCacheKey,
  weekPlanCachePrefix,
} from "../lib/weekplan-cache";

// Daa3iyah (2026-08-15): he told the advisor his son studies at university level,
// then the weekly plan told him to teach the boy salaah. Two causes: the plan was
// cached for 7 days and nothing invalidated it, and the parent's answers were
// dropped from the weekplan request.

describe("cache key reacts to new consultations", () => {
  const A = { id: "i1", createdAt: "2026-08-01T00:00:00Z" };
  const B = { id: "i2", createdAt: "2026-08-14T00:00:00Z" };

  it("changes when a new issue is added", () => {
    expect(issuesSignature([A])).not.toBe(issuesSignature([A, B]));
  });

  it("changes when an existing issue is re-diagnosed", () => {
    const updated = { ...A, updatedAt: "2026-08-15T09:00:00Z" };
    expect(issuesSignature([A])).not.toBe(issuesSignature([updated]));
  });

  it("is stable when nothing changed", () => {
    expect(issuesSignature([A, B])).toBe(issuesSignature([A, B]));
  });

  it("does not depend on issue ordering", () => {
    expect(issuesSignature([A, B])).toBe(issuesSignature([B, A]));
  });

  it("has a defined value with no issues", () => {
    expect(issuesSignature([])).toBe("none");
  });

  it("produces a different cache key once the signature changes", () => {
    const before = getWeekPlanCacheKey("c1", "ar", 3, "Jaar 2", issuesSignature([A]));
    const after = getWeekPlanCacheKey("c1", "ar", 3, "Jaar 2", issuesSignature([A, B]));
    expect(before).not.toBe(after);
  });

  it("keeps every superseded key for this child+lang+week under the prune prefix", () => {
    const prefix = weekPlanCachePrefix("c1", "ar", 3, "Jaar 2");
    for (const sig of [issuesSignature([A]), issuesSignature([A, B]), "none"]) {
      expect(getWeekPlanCacheKey("c1", "ar", 3, "Jaar 2", sig).startsWith(prefix)).toBe(true);
    }
  });

  it("does not prune another child's cache", () => {
    const other = getWeekPlanCacheKey("c2", "ar", 3, "Jaar 2", "none");
    expect(other.startsWith(weekPlanCachePrefix("c1", "ar", 3, "Jaar 2"))).toBe(false);
  });

  // Pruning used to match on the child alone, so opening an Arabic plan deleted
  // the still-valid Dutch one and switching back paid for a new plan.
  it("does not prune another language's cache", () => {
    const dutch = getWeekPlanCacheKey("c1", "nl", 3, "Jaar 2", "none");
    expect(dutch.startsWith(weekPlanCachePrefix("c1", "ar", 3, "Jaar 2"))).toBe(false);
  });

  it("does not prune another week's cache", () => {
    const otherWeek = getWeekPlanCacheKey("c1", "ar", 4, "Jaar 2", "none");
    expect(otherWeek.startsWith(weekPlanCachePrefix("c1", "ar", 3, "Jaar 2"))).toBe(false);
  });
});

describe("untrusted answer text is bounded before it reaches the prompt", () => {
  const src = fs.readFileSync("server/advice.ts", "utf-8");

  it("caps how many Q&A entries a caller may send", () => {
    expect(src).toContain(".max(20).optional()");
  });

  it("caps the length of each question and answer", () => {
    expect(src).toContain("question: z.string().max(500)");
    expect(src).toContain("answer: z.string().max(2000)");
  });

  it("only puts a bounded slice into the prompt", () => {
    expect(src).toContain(".slice(-6)");
  });
});

describe("the binding rule reaches every language", () => {
  const src = fs.readFileSync("server/advice.ts", "utf-8");

  it("is present in Arabic", () => {
    expect(src).toContain("قاعدة ملزمة");
  });

  it("is present in English", () => {
    expect(src).toContain("BINDING RULE");
  });

  it("is present in Dutch", () => {
    expect(src).toContain("BINDENDE REGEL");
  });
});

describe("the parent's answers reach the weekly plan", () => {
  it("the screen sends analyticalQA with each issue", () => {
    const src = fs.readFileSync("app/child/weekplan.tsx", "utf-8");
    expect(src).toContain("analyticalQA: i.analyticalQA");
  });

  it("the server accepts them on recentIssues", () => {
    const src = fs.readFileSync("server/advice.ts", "utf-8");
    const start = src.indexOf("recentIssues: z.array");
    expect(start).toBeGreaterThan(-1);
    // Window is generous on purpose: the schema carries explanatory comments and
    // this test should track the field being there, not its exact offset.
    expect(src.slice(start, start + 1200)).toContain("analyticalQA");
  });

  it("the plan is told not to contradict what the parent stated", () => {
    const src = fs.readFileSync("server/advice.ts", "utf-8");
    expect(src).toContain("ما ذكره الوالد عن ابنه");
  });
});
