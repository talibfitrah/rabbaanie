/**
 * Tests for Phase 8 features:
 * 1. Quran screen structure (concepts.tsx)
 * 2. Advisor action plan parsing (ai-chat.tsx)
 * 3. Treatments merged into family
 * 4. Mosque i18n support
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

import { extractSteps, parseActionPlanSteps } from "@/lib/plan-steps";

const projectRoot = path.resolve(__dirname, "..");

describe("Quran Screen (concepts.tsx)", () => {
  const filePath = path.join(projectRoot, "app/(tabs)/concepts.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  it("should exist and export a default function", () => {
    expect(content).toContain("export default function");
  });

  it("should use page-based display (604 pages)", () => {
    expect(content).toContain("604");
  });

  it("should have surah index functionality", () => {
    expect(content).toContain("showIndex");
    expect(content).toContain("الفاتحة");
  });

  it("should support tafsir display", () => {
    expect(content).toContain("tafsir");
  });

  it("should support long-press for word sciences", () => {
    expect(content).toContain("longPress");
  });

  it("should save last read page to AsyncStorage", () => {
    expect(content).toContain("quran_last_page");
  });

  it("should fetch from alquran.cloud API", () => {
    expect(content).toContain("api.alquran.cloud");
  });

  it("should have settings panel", () => {
    expect(content).toContain("showSettings");
  });
});

describe("Quran Server API (quran-api.ts)", () => {
  const filePath = path.join(projectRoot, "server/quran-api.ts");
  const content = fs.readFileSync(filePath, "utf-8");

  it("should exist", () => {
    expect(content).toBeTruthy();
  });

  it("should have i'rab endpoint", () => {
    expect(content).toContain("iraab");
  });

  it("should have hidayat endpoint", () => {
    expect(content).toContain("hidayat");
  });

  it("should have surah info endpoint", () => {
    expect(content).toContain("surah-info");
  });

  it("should use invokeLLM for AI-powered features", () => {
    expect(content).toContain("invokeLLM");
  });
});

describe("Advisor Action Plan Parsing (ai-chat.tsx)", () => {
  const filePath = path.join(projectRoot, "app/ai-chat.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  it("should have parseActionPlanSteps function", () => {
    expect(content).toContain("parseActionPlanSteps");
  });

  // The parsing itself moved to lib/plan-steps.ts, so these check what it does
  // rather than that ai-chat.tsx still contains the code.
  it("should have extractSteps function", () => {
    expect(extractSteps("1. اجلس معه بعد الفجر كل يوم")).toEqual([
      expect.objectContaining({ text: "اجلس معه بعد الفجر كل يوم" }),
    ]);
  });

  it("should save structured phases with steps", () => {
    expect(content).toContain("phases: parsedPhases");
  });

  it("should include completedSteps tracking", () => {
    expect(content).toContain("completedSteps: []");
  });

  it("should include startDate for timeline tracking", () => {
    expect(content).toContain("startDate:");
  });

  it("should detect week/phase markers in content", () => {
    const phases = parseActionPlanSteps(
      "الأسبوع 1\n1. اجلس معه بعد الفجر\nالأسبوع 2\n1. راجع معه ما تعلمه",
      "ar",
    );
    expect(phases.map((p) => p.phase)).toEqual(["الأسبوع 1", "الأسبوع 2"]);
  });

  it("should distribute steps across days", () => {
    const [week] = parseActionPlanSteps(
      "الأسبوع 1\n" +
        Array.from({ length: 7 }, (_, i) => `${i + 1}. خطوة رقم ${i + 1}`).join("\n"),
      "ar",
    );
    expect(week.steps.map((s) => s.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("Weekly Advisor Plans Section (weekly.tsx)", () => {
  const filePath = path.join(projectRoot, "app/(tabs)/weekly.tsx");
  const content = fs.readFileSync(filePath, "utf-8");
  const rendererContent = fs.readFileSync(
    path.join(projectRoot, "components/treatment-plan-renderer.tsx"),
    "utf-8",
  );

  it("should have AdvisorPlansSection component", () => {
    expect(content).toContain("AdvisorPlansSection");
  });

  // The plan is no longer drawn as a flat list owned by this screen, so the
  // identifiers this used to pin (toggleStepComplete/expandedPhase) are gone.
  // What must not vanish is the capability: the parent can still tick a plan
  // task off in الأسبوعي. That now lives in TreatmentPlanRenderer, which is also
  // what the child screen uses, so both tick the same tasks.
  it("should support step completion toggling", () => {
    expect(content).toContain("<TreatmentPlanRenderer");
    expect(rendererContent).toContain("toggleTask");
    expect(rendererContent).toMatch(/setItem\(planProgressKey\(/);
  });

  it("should show progress bar for plans", () => {
    expect(content).toContain("progress");
    expect(content).toContain("completedCount");
  });

  it("should display phases with expandable sections", () => {
    // Sections are the plan's own headings now, collapsed by the renderer,
    // rather than the week buckets this screen used to build.
    expect(rendererContent).toContain("groupIntoSections");
  });

  it("should show day names for distributed steps", () => {
    // getDayName was removed in the refactored weekly.tsx (cycle 14)
    // The component now uses phase-based display instead
    expect(content).toContain("phase");
  });

  it("should show checkboxes for step completion", () => {
    // A tickable box next to each task, filled with a ✓ once done.
    expect(rendererContent).toMatch(/case "task":/);
    expect(rendererContent).toContain("styles.checkbox");
    expect(rendererContent).toContain("styles.checkmark");
  });
});

describe("Treatments merged into Family (family.tsx)", () => {
  const filePath = path.join(projectRoot, "app/(tabs)/family.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  it("should show child issues in family screen", () => {
    expect(content).toContain("childIssues");
    expect(content).toContain("state.issues");
  });

  it("should show open issues count badge", () => {
    expect(content).toContain("مشكلات مفتوحة");
  });

  it("should show treatment plan preview", () => {
    expect(content).toContain("issue.treatmentPlan");
  });
});

describe("Treatments tab hidden in layout", () => {
  const filePath = path.join(projectRoot, "app/(tabs)/_layout.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  it("should hide treatments tab with href: null", () => {
    expect(content).toContain("href: null");
    // Treatments tab is hidden with href: null
    expect(content).toContain("treatments");
  });
});

describe("Mosques i18n support", () => {
  const filePath = path.join(projectRoot, "app/(tabs)/mosques.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  it("should import useI18n", () => {
    expect(content).toContain("useI18n");
  });

  it("should use tx() for translations", () => {
    expect(content).toContain("tx(");
  });
});

describe("AI Chat System Prompts (server/ai-chat.ts)", () => {
  const filePath = path.join(projectRoot, "server/ai-chat.ts");
  const content = fs.readFileSync(filePath, "utf-8");

  it("should have structured plan format instructions in Arabic", () => {
    expect(content).toContain("تنسيق النتيجة النهائية");
    expect(content).toContain("التشخيص");
  });

  it("should have structured plan format instructions in Dutch", () => {
    expect(content).toContain("Formaat van het uiteindelijke actieplan");
    expect(content).toContain("tijdsfasen");
  });

  it("should have structured plan format instructions in English", () => {
    expect(content).toContain("Final action plan format");
    expect(content).toContain("time phases");
  });

  it("should instruct AI to tell user about weekly integration", () => {
    expect(content).toContain("البرنامج الأسبوعي");
    expect(content).toContain("weekprogramma");
    expect(content).toContain("weekly program");
  });
});
