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

  it("keeps every key for a child under the prune prefix", () => {
    const prefix = weekPlanCachePrefix("c1");
    for (const sig of [issuesSignature([A]), issuesSignature([A, B]), "none"]) {
      expect(getWeekPlanCacheKey("c1", "ar", 3, "Jaar 2", sig).startsWith(prefix)).toBe(true);
    }
  });

  it("does not prune another child's cache", () => {
    const other = getWeekPlanCacheKey("c2", "ar", 3, "Jaar 2", "none");
    expect(other.startsWith(weekPlanCachePrefix("c1"))).toBe(false);
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
    expect(src.slice(start, start + 400)).toContain("analyticalQA");
  });

  it("the plan is told not to contradict what the parent stated", () => {
    const src = fs.readFileSync("server/advice.ts", "utf-8");
    expect(src).toContain("ما ذكره الوالد عن ابنه");
  });
});
