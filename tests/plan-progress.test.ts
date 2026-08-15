import { describe, it, expect } from "vitest";
import fs from "fs";
import {
  planProgressKey,
  completedTaskCount,
  progressSignature,
} from "../lib/plan-progress";

// Daa3iyah (2026-08-15): "فإن حددا اتمام بعض المهام في ذلك فيتم الانتقال الى المهمة
// التي بعدها" — ticking tasks off must move the plan on, not replay the same ones.

describe("reading what the renderer stored", () => {
  it("uses the same key the renderer writes", () => {
    const renderer = fs.readFileSync(
      "components/treatment-plan-renderer.tsx",
      "utf-8",
    );
    expect(renderer).toContain("planProgressKey(issueId)");
    // and no screen may hardcode the old literal, or the two would drift apart
    expect(renderer).not.toContain("`@treatment_tasks_${issueId}`");
  });

  it("counts ticked tasks", () => {
    expect(completedTaskCount(JSON.stringify(["task-0", "task-3"]))).toBe(2);
  });

  it("treats a missing record as no progress", () => {
    expect(completedTaskCount(null)).toBe(0);
  });

  it("survives a corrupted record instead of throwing", () => {
    expect(completedTaskCount("{not json")).toBe(0);
    expect(completedTaskCount('{"a":1}')).toBe(0);
  });

  it("keys progress per issue", () => {
    expect(planProgressKey("i1")).not.toBe(planProgressKey("i2"));
  });
});

describe("progress changes the plan's cache signature", () => {
  it("changes when another task is ticked", () => {
    const before = progressSignature([{ issueId: "i1", completed: 2 }]);
    const after = progressSignature([{ issueId: "i1", completed: 3 }]);
    expect(before).not.toBe(after);
  });

  it("is stable when nothing was ticked since last time", () => {
    const a = progressSignature([{ issueId: "i1", completed: 2 }]);
    const b = progressSignature([{ issueId: "i1", completed: 2 }]);
    expect(a).toBe(b);
  });

  it("does not depend on issue ordering", () => {
    const a = progressSignature([
      { issueId: "i1", completed: 1 },
      { issueId: "i2", completed: 4 },
    ]);
    const b = progressSignature([
      { issueId: "i2", completed: 4 },
      { issueId: "i1", completed: 1 },
    ]);
    expect(a).toBe(b);
  });

  it("has a defined value with no plans", () => {
    expect(progressSignature([])).toBe("p0");
  });

  it("never emits a minus sign that would split the cache key oddly", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      issueId: `issue-${i}`,
      completed: i * 7,
    }));
    expect(progressSignature(many)).not.toContain("-");
  });
});

describe("progress reaches the plan generator", () => {
  it("the screen sends the completed count per issue", () => {
    const src = fs.readFileSync("app/child/weekplan.tsx", "utf-8");
    expect(src).toContain("completedTasks:");
  });

  it("the server accepts it", () => {
    const src = fs.readFileSync("server/advice.ts", "utf-8");
    expect(src).toContain("completedTasks: z.number().optional()");
  });

  it("the plan is told to move on rather than repeat finished tasks", () => {
    const src = fs.readFileSync("server/advice.ts", "utf-8");
    expect(src).toContain("انتقل إلى الخطوة التي تليها");
  });
});

describe("the advisor plan is shown in the weekly screen", () => {
  const src = fs.readFileSync("app/child/weekplan.tsx", "utf-8");

  it("renders it interactively, not as flat text", () => {
    expect(src).toContain("TreatmentPlanRenderer");
  });

  it("shows it under the child's name", () => {
    expect(src).toContain("خطة المستشار — ${child.name}");
  });
});
