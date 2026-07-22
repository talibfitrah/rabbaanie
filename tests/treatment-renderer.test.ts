import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("TreatmentPlanRenderer", () => {
  const src = fs.readFileSync("components/treatment-plan-renderer.tsx", "utf8");

  it("should have RTL checkbox layout (row-reverse)", () => {
    expect(src).toContain('flexDirection: "row-reverse"');
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
    expect(src).toContain('flexDirection: "row-reverse"');
  });

  it("should have progress bar", () => {
    expect(src).toContain("progressBar");
    expect(src).toContain("progressFill");
  });

  it("should have warning box for short-term tarbiya", () => {
    expect(src).toContain("التربية القصيرة المدى مبنية على التربية الطويلة المدى");
  });

  it("should clean markdown symbols (**)", () => {
    expect(src).toContain('.replace(/\\*\\*/g, "")');
  });

  it("should handle separator (---)", () => {
    expect(src).toContain('"---"');
    expect(src).toContain("separator");
  });

  it("should persist completed tasks to AsyncStorage", () => {
    expect(src).toContain("@treatment_tasks_");
    expect(src).toContain("AsyncStorage.setItem");
  });

  it("should detect main sections (تشخيص, مهام الوالد, مهام الابن)", () => {
    expect(src).toContain("تشخيص");
    expect(src).toContain("مهام الوالد");
    expect(src).toContain("مهام الابن");
  });

  it("should detect sub-sections (تمهيد, تصفية, تزكية, تربية)", () => {
    expect(src).toContain("تمهيد");
    expect(src).toContain("تصفية");
    expect(src).toContain("تزكية");
    expect(src).toContain("تربية");
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
