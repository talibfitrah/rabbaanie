import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The daily reminder used to decide "what is still to do" from plan.completedSteps,
// which only the flat checkbox list in الأسبوعي ever wrote. That list is gone —
// ticks are the renderer's now, reported back as progressDone/progressTotal — so
// a reminder still reading completedSteps would offer the parents work they had
// already finished, forever.

const store: Record<string, string> = {};

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store[k] ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
  },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

vi.mock("expo-notifications", () => ({
  scheduleNotificationAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  setNotificationHandler: vi.fn(),
  AndroidNotificationPriority: { HIGH: "high" },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
}));

import { getCurrentGoalText } from "@/lib/weekly-goals-notification";
import { cachePlanProgress } from "@/lib/plan-progress";

const plan = (extra: Record<string, unknown>) => ({
  id: "plan_1",
  childName: "عبد الله",
  // What the advisor wrote — the same text the renderer parses into task-0..2.
  content: [
    "مهام الوالد:",
    "1. راجع نيتك في تربيته",
    "2. اقرأ باب الإخلاص",
    "مهام الابن:",
    "3. دربه على الإقناع بالحسنى",
  ].join("\n"),
  // The lossy copy parsed at save time, kept for plans that predate content.
  phases: [
    {
      phase: "الأسبوع 1",
      steps: [
        { id: "s1", text: "راجع نيتك في تربيته" },
        { id: "s2", text: "اقرأ باب الإخلاص" },
        { id: "s3", text: "دربه على الإقناع بالحسنى" },
      ],
    },
  ],
  ...extra,
});

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  // The picker rotates through the remaining steps with the day of the week, so
  // without a fixed clock these assertions would pass or fail by the weekday
  // they happen to run on. Sunday keeps dayIndex at 0: the first step still due.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-16T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the daily reminder follows the ticks the renderer records", () => {
  it("offers the first task when nothing is ticked", async () => {
    store["@advisor_action_plans"] = JSON.stringify([plan({})]);
    expect(await getCurrentGoalText("ar")).toContain("راجع نيتك");
  });

  it("skips the tasks already ticked, matching them by the renderer's own keys", async () => {
    store["@advisor_action_plans"] = JSON.stringify([plan({})]);
    store["@treatment_tasks_plan_1"] = JSON.stringify(["task-0", "task-1"]);
    const text = await getCurrentGoalText("ar");
    expect(text).toContain("دربه على الإقناع");
    expect(text).not.toContain("راجع نيتك");
  });

  it("drops the plan once every task is ticked", async () => {
    store["@advisor_action_plans"] = JSON.stringify([plan({})]);
    store["@treatment_tasks_plan_1"] = JSON.stringify(["task-0", "task-1", "task-2"]);
    expect(await getCurrentGoalText("ar")).toBeNull();
  });

  it("keeps offering a plan whose text parses to no tasks, from its saved steps", async () => {
    // A plan the block parser finds no tasks in must fall back to the steps that
    // were parsed when it was saved, not vanish from the reminder for good.
    store["@advisor_action_plans"] = JSON.stringify([plan({ content: "لا توجد خطوات هنا" })]);
    expect(await getCurrentGoalText("ar")).toContain("راجع نيتك");
  });

  it("still reads a plan saved before the advisor kept its own text", async () => {
    store["@advisor_action_plans"] = JSON.stringify([
      plan({ content: undefined, completedSteps: ["s1"] }),
    ]);
    expect(await getCurrentGoalText("ar")).toContain("اقرأ باب الإخلاص");
  });

  it("moves on to an older plan when the newest is finished", async () => {
    store["@advisor_action_plans"] = JSON.stringify([
      { ...plan({}), id: "plan_old" },
      { ...plan({}), id: "plan_new" },
    ]);
    store["@treatment_tasks_plan_new"] = JSON.stringify(["task-0", "task-1", "task-2"]);
    expect(await getCurrentGoalText("ar")).toContain("راجع نيتك");
  });
});

describe("cachePlanProgress records what the renderer reports", () => {
  it("writes the counts onto the plan", async () => {
    store["@advisor_action_plans"] = JSON.stringify([plan({})]);
    expect(await cachePlanProgress("plan_1", 2, 3)).toBe(true);
    const saved = JSON.parse(store["@advisor_action_plans"])[0];
    expect(saved.progressDone).toBe(2);
    expect(saved.progressTotal).toBe(3);
  });

  it("reports no change when the counts already match, so the screen does not re-render on every open", async () => {
    store["@advisor_action_plans"] = JSON.stringify([
      plan({ progressDone: 2, progressTotal: 3 }),
    ]);
    expect(await cachePlanProgress("plan_1", 2, 3)).toBe(false);
  });

  it("leaves an unknown plan alone", async () => {
    store["@advisor_action_plans"] = JSON.stringify([plan({})]);
    expect(await cachePlanProgress("plan_missing", 1, 3)).toBe(false);
    expect(JSON.parse(store["@advisor_action_plans"])[0].progressDone).toBeUndefined();
  });
});
