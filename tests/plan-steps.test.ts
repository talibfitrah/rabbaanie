import { describe, it, expect } from "vitest";

import { extractSteps, parseActionPlanSteps } from "@/lib/plan-steps";

/**
 * Daa3iyah reported the advisor plan rendering as one flat run of bullets with the
 * section headings glued onto the end of the preceding bullet
 * ("…جهاد في سبيل الله  علاج في التزكية:"). This is the shape of plan the Arabic
 * advisor emits (server/ai-chat.ts): a heading line, then numbered steps under it.
 */
const ARABIC_PLAN = `التشخيص:
المشكلة في عقل الطفل وتصوره عن الرزق

علاج في التصفية:
1. اغرس في عقله أن الرزق من عند الله، وأن التوكل على الله مع الأخذ بالأسباب هو المنهج الصحيح
2. علمه أن مهاراته نعم من الله يجب استثمارها في خدمة الدين والمسلمين
3. أفهمه أن العمل الحلال عبادة، وأن السعي للرزق جهاد في سبيل الله

علاج في التزكية:
1. حبب إليه فكرة أن يكون سببا في نشر العلم الشرعي بالوسائل الحديثة
2. علمه أن يستشعر الأجر في كل عمل يقوم به لوجه الله

علاج في تربية اللسان:
1. دربه على تقديم نفسه ومهاراته بثقة ووضوح`;

const PLAN_WITH_SUBBULLETS = `علاج في تربية الجوارح:
1. ابدأ بمشروع "منصة تعليمية شرعية" يجمع بين مهاراته الثلاث:
   - يبحث ويحضر المحتوى الشرعي
   - يصمم ويخرج الفيديوهات التعليمية
2. ابحث له عن شريك أو مؤسسة تدعم المشروع ماليا في البداية`;

describe("extractSteps", () => {
  it("does not swallow a following section heading into the previous step", () => {
    const steps = extractSteps(ARABIC_PLAN);
    for (const step of steps) {
      expect(step.text).not.toContain("علاج في");
    }
  });

  // The advisor bolds its headings often enough that the renderer strips "**"
  // everywhere. A bolded heading ends in "**", not ":", so it has to be cleaned
  // before it is judged — otherwise the very bug this fixes comes straight back.
  it("does not swallow a heading that the advisor wrote in bold", () => {
    const steps = extractSteps(
      "**علاج في التصفية:**\n1. اغرس في عقله أن الرزق من عند الله\n" +
        "**علاج في التزكية:**\n1. حبب إليه نشر العلم الشرعي",
    );
    for (const step of steps) {
      expect(step.text).not.toContain("علاج في");
    }
    expect(steps).toHaveLength(2);
  });

  it("does not inline sub-bullets into the numbered step above them", () => {
    const steps = extractSteps(PLAN_WITH_SUBBULLETS);
    expect(steps[0].text).not.toContain("يبحث ويحضر");
  });

  it("never leaves a newline inside a step", () => {
    for (const step of extractSteps(ARABIC_PLAN)) {
      expect(step.text).not.toContain("\n");
    }
  });

  // Absence assertions alone would still pass if extraction broke entirely,
  // so pin down what must survive.
  it("still extracts every numbered step, whole and in order", () => {
    const steps = extractSteps(ARABIC_PLAN);
    expect(steps).toHaveLength(6);
    expect(steps[0].text).toBe(
      "اغرس في عقله أن الرزق من عند الله، وأن التوكل على الله مع الأخذ بالأسباب هو المنهج الصحيح",
    );
    expect(steps[5].text).toBe("دربه على تقديم نفسه ومهاراته بثقة ووضوح");
  });

  // The steps feed the weekly checklist and the daily reminder, so anything the
  // advisor wrote under a step has to survive — it just must not absorb the
  // heading of the *next* section.
  it("keeps a step that wraps onto a second line", () => {
    const steps = extractSteps(
      "1. اجلس معه بعد صلاة الفجر\n   واسأله عما أغضبه بالأمس",
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].text).toBe(
      "اجلس معه بعد صلاة الفجر واسأله عما أغضبه بالأمس",
    );
  });

  it("keeps sub-bullets under a step as steps of their own", () => {
    const steps = extractSteps(PLAN_WITH_SUBBULLETS);
    expect(steps.map((s) => s.text)).toEqual([
      'ابدأ بمشروع "منصة تعليمية شرعية" يجمع بين مهاراته الثلاث:',
      "يبحث ويحضر المحتوى الشرعي",
      "يصمم ويخرج الفيديوهات التعليمية",
      "ابحث له عن شريك أو مؤسسة تدعم المشروع ماليا في البداية",
    ]);
  });

  // Bullets under a numbered step are that step's actions. Bullets before any
  // numbered step are the diagnosis talking, and they must not turn up in the
  // weekly checklist or the daily reminder as if they were tasks.
  it("does not take commentary above the first numbered step as a task", () => {
    const steps = extractSteps(
      "التشخيص:\n- المشكلة في عقل الطفل وتصوره عن الرزق\n\n" +
        "علاج في التصفية:\n1. اغرس في عقله أن الرزق من عند الله",
    );
    expect(steps.map((s) => s.text)).toEqual([
      "اغرس في عقله أن الرزق من عند الله",
    ]);
  });

  it("treats a plan written as dash bullets as steps too", () => {
    const steps = extractSteps("- صل معه الفجر كل يوم\n- اقرأ معه صفحة من المصحف");
    expect(steps.map((s) => s.text)).toEqual([
      "صل معه الفجر كل يوم",
      "اقرأ معه صفحة من المصحف",
    ]);
  });
});

describe("parseActionPlanSteps", () => {
  it("splits the plan on week markers", () => {
    const plan = "الأسبوع 1\n1. اجلس معه بعد الفجر كل يوم\nالأسبوع 2\n1. راجع معه ما تعلمه في الأسبوع الأول";
    const phases = parseActionPlanSteps(plan, "ar");
    expect(phases.map((p) => p.phase)).toEqual(["الأسبوع 1", "الأسبوع 2"]);
    expect(phases[0].steps[0].text).toBe("اجلس معه بعد الفجر كل يوم");
  });

  // The advisor's plan ends with "الجدول الزمني والتقييم:" naming الأسبوع 1-2 and
  // الأسبوع 3-4. Splitting on those markers put every real step in the discarded
  // head of the split, which emptied the weekly checklist and stopped the daily
  // reminder from ever being scheduled.
  it("keeps the steps when the only week numbers are in a closing timeline", () => {
    const phases = parseActionPlanSteps(
      "مهام الوالد:\n1. راجع نيتك في تربية ابنك\n2. تعلم أن القدوة أبلغ من الموعظة\n\n" +
        "الجدول الزمني والتقييم:\nالأسبوع 1-2 ثم الأسبوع 3-4، ومعايير الانتقال",
      "ar",
    );
    expect(phases.flatMap((p) => p.steps.map((s) => s.text))).toEqual([
      "راجع نيتك في تربية ابنك",
      "تعلم أن القدوة أبلغ من الموعظة",
    ]);
  });

  // Progress is stored per step id, so a repeated id means ticking one step
  // silently ticks its twin in another week.
  it("gives every step across every phase its own id", () => {
    const phases = parseActionPlanSteps(
      "الأسبوع 1\n1. اجلس معه بعد الفجر\n2. اقرأ معه صفحة\n" +
        "الأسبوع 2\n1. راجع معه ما تعلمه\n2. اسأله عما فهمه",
      "ar",
    );
    const ids = phases.flatMap((p) => p.steps.map((s) => s.id));
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it("puts an unphased plan under a single first-week phase", () => {
    const phases = parseActionPlanSteps(ARABIC_PLAN, "ar");
    expect(phases).toHaveLength(1);
    expect(phases[0].phase).toBe("الأسبوع 1");
    expect(phases[0].steps).toHaveLength(6);
  });
});
