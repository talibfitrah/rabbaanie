import { describe, it, expect } from "vitest";
import fs from "fs";

import { sectionOwner } from "@/lib/plan-owner";

// Daa3iyah (2026-08-15): «وهذه لم تعدل … وأريد ان تضبط هذه الخطط حسب ما أمرتك».
// The plan the advisor produced had no father/son split at all. The split was
// only ever in the treatment-plan generator (server/advice.ts); the conversational
// advisor was told to emit time phases and nothing else, so there was no owner
// for the renderer to show.

const advisorSource = fs.readFileSync("server/ai-chat.ts", "utf-8");

function arabicPrompt(): string {
  const start = advisorSource.indexOf("  ar: `");
  const end = advisorSource.indexOf("  en: `", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return advisorSource.slice(start, end);
}

describe("the Arabic advisor asks for a parent/child split", () => {
  // Ties the generator to the renderer: the headings the advisor is told to
  // write must be headings sectionOwner() can attribute to someone. If either
  // side is reworded on its own, the owner badge silently disappears — which is
  // the state Daa3iyah reported.
  const owners = arabicPrompt()
    .split("\n")
    .map((line) => sectionOwner(line.trim()))
    .filter((owner): owner is NonNullable<typeof owner> => owner !== null);

  it("names a section the renderer attributes to the parent", () => {
    expect(owners.some((o) => o.role === "parent")).toBe(true);
  });

  it("names a section the renderer attributes to the child", () => {
    expect(owners.some((o) => o.role === "child")).toBe(true);
  });

  it("still keeps one numbered step per line, which the step parser relies on", () => {
    expect(arabicPrompt()).toContain("كل خطوة تبدأ برقم");
  });
});

describe("the per-child advisor archive renders the plan interactively", () => {
  // The v1.4.88 guard only asserted that app/child/[id].tsx contained the string
  // "TreatmentPlanRenderer" somewhere. It did — in a different component — while
  // the advisor-plans archive in the same file still rendered flat bullets. Scope
  // the check to the component that actually shows the archived plan.
  function advisorPlansComponent(): string {
    const start = advisorSource_childScreen.indexOf(
      "function AdvisorPlansForChild",
    );
    expect(start).toBeGreaterThan(-1);
    const end = advisorSource_childScreen.indexOf("\nfunction ", start + 1);
    return advisorSource_childScreen.slice(
      start,
      end === -1 ? undefined : end,
    );
  }
  const advisorSource_childScreen = fs.readFileSync(
    "app/child/[id].tsx",
    "utf-8",
  );

  it("renders through TreatmentPlanRenderer", () => {
    expect(advisorPlansComponent()).toContain("TreatmentPlanRenderer");
  });

  it("does not render the flattened step list, which loses the headings", () => {
    expect(advisorPlansComponent()).not.toMatch(/\{step\.text\}/);
  });
});
