import { describe, it, expect } from "vitest";
import fs from "fs";

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

describe("a tick means the same task in every language", () => {
  // The blocks on screen come from the auto-translation when one is showing, and
  // that parses to its own task-N numbering. Storing those keys would tick one
  // plan under two different sets of keys, so a task ticked in Dutch would read
  // as undone in Arabic — and the count the card caches would disagree too.
  const renderer = fs.readFileSync("components/treatment-plan-renderer.tsx", "utf-8");

  it("stores and reads ticks under the original text's keys", () => {
    expect(renderer).toContain("const originalTaskKeys = parsePlanText(planText)");
    expect(renderer).toMatch(/onPress=\{\(\) => toggleTask\(storedKey\(block\.key\)\)\}/);
    expect(renderer).toMatch(/completedTasks\.has\(storedKey\(block\.key\)\)/);
  });
});
