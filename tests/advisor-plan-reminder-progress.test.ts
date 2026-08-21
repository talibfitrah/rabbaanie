import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The daily reminder used to decide "what is still to do" from plan.completedSteps,
// which only the flat checkbox list in الأسبوعي ever wrote. That list is gone, so
// a reminder still reading it would offer the parents work they had already
// finished, forever.
//
// It reads the ticks the renderer stores instead, through the same parser and the
// same cleaning the screens use, and matches them by the very keys the checkboxes
// wrote. Counting with a second parser is what these guard against: the two lists
// were free to disagree about which task was which.

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
import { taskKeysOf } from "@/lib/plan-blocks";
import { canonicalPlanText } from "@/lib/plan-text";

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

  // REVERSED DELIBERATELY. These two used to assert the opposite: that a plan
  // the parser finds no tasks in falls back to plan.phases so it does not vanish
  // from the reminder. That was written before it was clear that
  // toggleStepComplete — the only writer of plan.completedSteps — went away with
  // the flat list. With no writer the fallback's filter is a no-op, so it can
  // only ever return EVERY step: a plan with no tickable surface anywhere in the
  // app, offered again every single day with no way to ever finish it. A
  // reminder you cannot dismiss is worse than one that stays quiet, and the plan
  // is still on screen in الأسبوعي either way.
  it("skips a plan whose text parses to no tasks, rather than nag forever", async () => {
    store["@advisor_action_plans"] = JSON.stringify([plan({ content: "لا توجد خطوات هنا" })]);
    // Nothing else is in the store, so the reminder has nothing to say at all.
    expect(await getCurrentGoalText("ar")).toBeNull();
  });

  it("skips a plan saved before the advisor kept its own text", async () => {
    store["@advisor_action_plans"] = JSON.stringify([
      plan({ content: undefined, completedSteps: ["s1"] }),
    ]);
    expect(await getCurrentGoalText("ar")).toBeNull();
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

describe("the reminder keys ticks off the same cleaned text the screens parse", () => {
  // cleanTreatmentText strips the "**" that stops "**1. …" from reading as a
  // numbered step, so it decides whether these lines are tasks at all. Parsing
  // the raw text here would number the tasks differently from the checkboxes
  // that recorded the ticks, and the reminder would skip the wrong ones.
  const bolded = {
    id: "plan_b",
    childName: "عبد الله",
    content: [
      "**مهام الوالد:**",
      "**1. راجع نيتك في تربيته**",
      "**2. اقرأ باب الإخلاص**",
      "**3. دربه على الإقناع بالحسنى**",
    ].join("\n"),
    phases: [],
  };

  it("treats the first stored key as the first bolded step", async () => {
    store["@advisor_action_plans"] = JSON.stringify([bolded]);
    store["@treatment_tasks_plan_b"] = JSON.stringify(["task-0"]);
    const text = await getCurrentGoalText("ar");
    expect(text).not.toContain("راجع نيتك");
    expect(text).toContain("اقرأ باب الإخلاص");
  });
});

describe("the reminder recognises a tick regardless of which UI language it was made under (P2, cross-module)", () => {
  it("a tick stored under the canonical key space is seen even when the reminder runs in a different language", async () => {
    // "Allaah" is the one thing cleanTreatmentText treats differently per
    // language (transliterated only under "ar") -- the case that actually
    // exercises canonicalPlanText here.
    const content = [
      "- Remind him that everything is from Allaah",
      "- Read a page of Qur'aan together daily",
    ].join("\n");
    store["@advisor_action_plans"] = JSON.stringify([
      { id: "plan_c", childName: "", content, phases: [] },
    ]);
    // What components/treatment-plan-renderer.tsx's toggleTask stores post-fix:
    // the CANONICAL key of the first task, not one keyed to either language.
    const canonicalKeys = taskKeysOf(canonicalPlanText(content));
    store["@treatment_tasks_plan_c"] = JSON.stringify([canonicalKeys[0]]);

    // Queried in English -- a different language than the tick's own text was
    // ever cleaned for above -- and still recognised as done.
    const text = await getCurrentGoalText("en");
    expect(text).not.toContain("Remind him");
    expect(text).toContain("Read a page");
  });
});

describe("concurrent progress writes do not clobber each other", () => {
  it("keeps both plans' counts when two renderers report at once", async () => {
    // Every plan lives in ONE JSON blob under @advisor_action_plans, so two
    // overlapping read-modify-writes each start from the same snapshot and the
    // second puts back a list that never saw the first. Two renderers reporting
    // together is the ordinary case: the weekly tab remounts its cards on focus
    // while the child screen is still settling.
    store["@advisor_action_plans"] = JSON.stringify([
      { ...plan({}), id: "plan_a" },
      { ...plan({}), id: "plan_b" },
    ]);

    await Promise.all([
      cachePlanProgress("plan_a", 1, 3),
      cachePlanProgress("plan_b", 2, 4),
    ]);

    const saved = JSON.parse(store["@advisor_action_plans"]);
    const a = saved.find((p: any) => p.id === "plan_a");
    const b = saved.find((p: any) => p.id === "plan_b");
    expect([a.progressDone, a.progressTotal]).toEqual([1, 3]);
    expect([b.progressDone, b.progressTotal]).toEqual([2, 4]);
  });
});
