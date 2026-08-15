import { describe, it, expect } from "vitest";
import fs from "fs";

// Daa3iyah (2026-08-15): "فالآن تعرض الخطة فقط كنص تحت بعض وليس بالطريقة المقدمة
// والتي يمكن فيها تحديد ما تم وما لم يتم" — the plan must render with sections and
// check-off wherever it is shown, not as a flat block of text.

const SCREENS = [
  "app/(tabs)/treatments.tsx",
  "app/child-profile/[id].tsx",
  "app/child/[id].tsx",
];

describe("every screen showing a full plan uses the interactive renderer", () => {
  for (const screen of SCREENS) {
    it(`${screen} renders through TreatmentPlanRenderer`, () => {
      const src = fs.readFileSync(screen, "utf-8");
      expect(src).toContain("TreatmentPlanRenderer");
    });

    it(`${screen} does not dump the plan into a bare Text node`, () => {
      const src = fs.readFileSync(screen, "utf-8");
      // The flat renders looked like: <Text ...>{issue.treatmentPlan}</Text>
      expect(src).not.toMatch(/>\s*\{issue\.treatmentPlan\}\s*</);
    });
  }
});

describe("plan text cleaning is shared, not copied per screen", () => {
  it("lives in one module", () => {
    expect(fs.existsSync("lib/plan-text.ts")).toBe(true);
  });

  it("no screen redefines it locally", () => {
    for (const screen of SCREENS) {
      const src = fs.readFileSync(screen, "utf-8");
      expect(src).not.toContain("function cleanTreatmentText");
    }
  });
});

describe("owner badge is wired into the renderer", () => {
  const src = fs.readFileSync("components/treatment-plan-renderer.tsx", "utf-8");

  it("asks lib/plan-owner who owns each section", () => {
    expect(src).toContain("sectionOwner");
    expect(src).toContain("@/lib/plan-owner");
  });

  it("distinguishes parent from child visually", () => {
    expect(src).toContain('owner.role === "parent"');
  });
});
