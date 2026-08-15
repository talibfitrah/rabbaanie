import { describe, it, expect } from "vitest";
import fs from "fs";
import { taskKeysOf, parsePlanText, groupIntoSections } from "../lib/plan-blocks";

// Daa3iyah (2026-08-15): «نفس الخطة بنفس الطريقة لابد ان تعرض في قسم العائلات
// وفي قسم الأسبوعي … فالآن تعرض الخطة فقط كنص تحت بعض وليس بالطريقة المقدمة
// والتي يمكن فيها تحديد ما تم وما لم يتم».
//
// The child screen was moved onto TreatmentPlanRenderer, but الأسبوعي kept
// rendering plan.phases -> step.text: a flat checkbox list that by construction
// carries no section heading and no parent/child split, and which is frozen at
// the moment the plan was saved — so every plan already on the device still
// showed the glued "علاج في …:" text after upgrading.

const weeklySource = fs.readFileSync("app/(tabs)/weekly.tsx", "utf-8");

function advisorPlansComponent(): string {
  const start = weeklySource.indexOf("function AdvisorPlansSection");
  expect(start).toBeGreaterThan(-1);
  const end = weeklySource.indexOf("\nfunction ", start + 1);
  return weeklySource.slice(start, end === -1 ? undefined : end);
}

describe("الأسبوعي renders the advisor plan the same way the child screen does", () => {
  it("renders through TreatmentPlanRenderer", () => {
    expect(advisorPlansComponent()).toContain("TreatmentPlanRenderer");
  });

  it("renders the text the advisor wrote, not the lossy saved phases", () => {
    expect(advisorPlansComponent()).toMatch(/planText=\{[^}]*plan\.content/);
  });

  it("does not render the flattened step list, which loses the headings", () => {
    expect(advisorPlansComponent()).not.toMatch(/\{step\.text\}/);
  });

  it("keys progress on plan.id, so this screen and the child screen tick the same tasks", () => {
    expect(advisorPlansComponent()).toMatch(/issueId=\{plan\.id\}/);
  });

  it("caches progress from the child screen too, so neither screen goes stale", () => {
    // Only wiring الأسبوعي would leave a parent who works from the child screen
    // with a weekly percentage and a daily reminder that never move.
    const childScreen = fs.readFileSync("app/child/[id].tsx", "utf-8");
    expect(childScreen).toMatch(/onProgressChange=\{[\s\S]{0,400}?cachePlanProgress/);
  });

  it("takes the progress numbers from the renderer instead of the dead completedSteps count", () => {
    // toggleStepComplete was the only writer of completedSteps. Once the flat
    // list is gone nothing writes it, so a bar still dividing by it would freeze
    // at whatever it happened to hold.
    expect(advisorPlansComponent()).toContain("onProgressChange");
  });
});

describe("the bar and the cached count are one measurement", () => {
  // They used to be two: the bar divided by the tasks in the text on screen
  // (the auto-translation, when one was showing) while the cached count came
  // from the original, so the same plan could report more done than it had.
  //
  // The counting itself now lives in taskKeysOf, so it can be asserted by
  // behaviour. The earlier version of this test pinned the exact source lines
  // down to the semicolon, which a rename would break for no real reason —
  // and the tempting fix, loosening the string, deletes the guard silently.
  const renderer = fs.readFileSync("components/treatment-plan-renderer.tsx", "utf-8");

  const ARABIC_PLAN = [
    "- اجلس مع ابنك بعد صلاة الفجر",
    "- اقرأ معه صفحة من المصحف كلّ يوم",
    "- ذكّره بفضل الصلاة في وقتها",
  ].join("\n");
  // Same plan, auto-translated, and one task short — which is the ordinary case,
  // not a contrived one: the translator merges or drops a bullet often enough.
  const DUTCH_PLAN = [
    "- Zit na het fajr-gebed bij je zoon",
    "- Lees samen elke dag een pagina",
  ].join("\n");

  it("gives one key per task, positionally", () => {
    expect(taskKeysOf(ARABIC_PLAN)).toEqual(["task-0", "task-1", "task-2"]);
  });

  it("keys a plan's tasks by position, so the same key means the same task", () => {
    // Positional keys are the whole reason the original text must be the one
    // measured against: `task-1` is "the second task of whatever you parsed",
    // and a translation that drops a task shifts what that refers to.
    expect(taskKeysOf(ARABIC_PLAN)).toEqual(["task-0", "task-1", "task-2"]);
    expect(taskKeysOf(DUTCH_PLAN)).toEqual(["task-0", "task-1"]);
  });

  it("leaves the plan's third task outstanding when only the translation is ticked", () => {
    // The bug this guards: ticking both boxes a Dutch reader sees must not mark
    // the Arabic plan's third task done, in the bar or in the daily reminder.
    const ticked = new Set(taskKeysOf(DUTCH_PLAN));
    expect(taskKeysOf(ARABIC_PLAN).filter((k) => !ticked.has(k))).toEqual(["task-2"]);
  });

  it("measures against the original while displaying the translation", () => {
    // The wiring that actually fixes the cross-language mismatch: the denominator
    // and the reported count come from planText, the displayed blocks from
    // effectiveText. An earlier attempt added a rekeying step that mapped every
    // key onto itself; this asserts the part that does the work.
    expect(renderer).toContain("taskKeysOf(planText)");
    expect(renderer).toContain("parsePlanText(effectiveText)");
    expect(renderer).not.toContain("taskKeysOf(effectiveText)");
  });
});

describe("no part of a plan is silently dropped", () => {
  // parsePlanText promotes any numbered line containing تشخيص / مهام / الجدول /
  // التقييم / العلاج to a heading. "راجع مهامك المنزلية معه" is an ordinary
  // instruction that trips that rule — and when the next line is also a heading,
  // grouping used to discard the section outright, taking the only copy of that
  // instruction with it: gone from the screen, from the task count, and from the
  // daily reminder, while the progress bar still reached 100%.
  const PLAN = [
    "مهام الوالد:",
    "1. اجلس مع ابنك يوميًا بعد صلاة العصر لمدة عشر دقائق",
    "2. راجع مهامك المنزلية معه حتى يتعلم المسؤولية",
    "",
    "مهام الابن:",
    "3. التزم بأداء الصلاة في وقتها",
  ].join("\n");

  it("keeps every line of the plan reachable on screen", () => {
    const sections = groupIntoSections(parsePlanText(PLAN));
    const shown = sections.flatMap((sec) => [sec.title, ...sec.blocks.map((b: any) => b.text)]).join(" ");
    expect(shown).toContain("اجلس مع ابنك");
    expect(shown).toContain("التزم بأداء الصلاة");
    // The one that used to vanish.
    expect(shown).toContain("راجع مهامك المنزلية معه");
  });

  it("still drops the stand-in section before the first heading", () => {
    // That one is ours, not the advisor's, so an empty "مقدمة" must not appear.
    const sections = groupIntoSections(parsePlanText(PLAN));
    expect(sections.some((sec) => sec.title === "مقدمة")).toBe(false);
  });
});
