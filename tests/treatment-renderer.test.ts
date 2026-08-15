import { describe, it, expect } from "vitest";
import * as fs from "fs";

// The block parser moved to lib/plan-blocks.ts so the renderer, the weekly card
// and the daily reminder all count a plan's tasks the same way. It is plain TS
// now, so these can assert what it does instead of what its source looks like.
import { parsePlanText } from "@/lib/plan-blocks";

describe("TreatmentPlanRenderer", () => {
  const src = fs.readFileSync("components/treatment-plan-renderer.tsx", "utf8");

  // isArabicText is a private helper inside the component, and this file can't
  // import the component either: it pulls in react-native, whose entry point
  // uses Flow's `import typeof` syntax, which esbuild (vitest's transform)
  // cannot parse. So this asserts the ternary's shape in the source rather
  // than an importable function's resolved value — an Arabic-detecting call
  // gates the checkbox row's flexDirection between "row-reverse" (Arabic/RTL)
  // and "row" (else) — written to survive reformatting and identifier
  // renames, unlike the exact `flexDirection: "row-reverse"` text this
  // replaces, which the conditional itself never contains.
  const CHECKBOX_ROW_RTL =
    /styles\.taskRow[\s\S]{0,200}?flexDirection:\s*\w+\([^)]*\)\s*\?\s*"row-reverse"\s*:\s*"row"/;

  it("should have RTL checkbox layout (row-reverse)", () => {
    expect(src).toMatch(CHECKBOX_ROW_RTL);
  });

  it("should have heading1 with large fontSize", () => {
    // Section titles use fontSize: 15 with fontWeight: 800 for emphasis
    expect(src).toContain("fontWeight: \"800\"");
  });

  it("should have heading2 with medium fontSize", () => {
    expect(src).toContain("fontSize: 15");
  });

  it("should have paragraph with smaller fontSize", () => {
    expect(src).toContain("fontSize: 13");
  });

  it("should have writingDirection rtl for all text", () => {
    const rtlCount = (src.match(/writingDirection: "rtl"/g) || []).length;
    expect(rtlCount).toBeGreaterThanOrEqual(5);
  });

  it("should have textAlign right for Arabic", () => {
    const rightCount = (src.match(/textAlign: "right"/g) || []).length;
    expect(rightCount).toBeGreaterThanOrEqual(5);
  });

  it("should handle checkboxes on the right side", () => {
    // row-reverse means first child (text) goes left, last child (checkbox) goes right
    expect(src).toContain("taskRow");
    expect(src).toMatch(CHECKBOX_ROW_RTL);
  });

  it("should have progress bar", () => {
    expect(src).toContain("progressBar");
    expect(src).toContain("progressFill");
  });

  it("should have warning box for short-term tarbiya", () => {
    const blocks = parsePlanText("التربية القصيرة المدى مبنية على التربية الطويلة المدى");
    expect(blocks[0].type).toBe("warning");
  });

  it("should clean markdown symbols (**)", () => {
    const blocks = parsePlanText("1. **راجع نيتك في تربيته**");
    expect(blocks[0]).toMatchObject({ type: "task", text: "راجع نيتك في تربيته" });
  });

  it("should handle separator (---)", () => {
    expect(parsePlanText("---")[0].type).toBe("separator");
  });

  it("should persist completed tasks to AsyncStorage", () => {
    // The key itself now lives in lib/plan-progress.ts, so the weekly plan can
    // read the same progress the renderer writes.
    expect(src).toContain("planProgressKey(issueId)");
    expect(src).toContain("AsyncStorage.setItem");
    expect(
      fs.readFileSync("lib/plan-progress.ts", "utf-8"),
    ).toContain("@treatment_tasks_");
  });

  it("should detect main sections (تشخيص, مهام الوالد, مهام الابن)", () => {
    for (const title of ["التشخيص:", "مهام الوالد:", "مهام الابن:"]) {
      expect(parsePlanText(title)[0]).toMatchObject({ type: "heading1" });
    }
  });

  it("should detect sub-sections (تمهيد, تصفية, تزكية, تربية)", () => {
    for (const title of ["تمهيد:", "تصفية (تصحيح عقل الوالد):", "تزكية:", "تربية في اللسان:"]) {
      expect(parsePlanText(title)[0].type).toMatch(/^heading[12]$/);
    }
  });
});

describe("child/[id].tsx uses TreatmentPlanRenderer", () => {
  const src = fs.readFileSync("app/child/[id].tsx", "utf8");

  it("should import TreatmentPlanRenderer", () => {
    expect(src).toContain('import { TreatmentPlanRenderer } from "@/components/treatment-plan-renderer"');
  });

  it("should use TreatmentPlanRenderer component", () => {
    expect(src).toContain("<TreatmentPlanRenderer");
  });
});
