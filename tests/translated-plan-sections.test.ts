import { describe, it, expect } from "vitest";
import { parsePlanText, groupIntoSections, taskKeysOf, type Section } from "@/lib/plan-blocks";

// Daa3iyah: an Arabic-authored treatment plan, viewed in Dutch, must split into
// its real sections in Dutch — not stay one Arabic-titled block. server/advice.ts
// always numbers the top-level outline 1..N; that numbering survives translation
// even when the Arabic keywords and the en/nl ALL-CAPS convention do not, so it
// is what a translated heading has to be recognised by.

describe("a translated plan splits by its numbered headings", () => {
  // A realistic machine translation of the Arabic advice.ts outline into Dutch:
  // sentence case, not ALL-CAPS, no Arabic keyword survives translation.
  const TRANSLATED_DUTCH_PLAN = [
    "1. Diagnose van het probleem",
    "Het kind neigt naar liegen uit angst voor straf.",
    "",
    "2. Taken van de vader - langetermijnopvoeding",
    "- Herzie je intentie in de opvoeding van je zoon",
    "- Leer dat het goede voorbeeld krachtiger is dan de vermaning",
    "",
    "3. Taken van de vader - kortetermijnopvoeding",
    "- Herinner hem elke dag na Fajr aan het belang van eerlijkheid",
    "",
    "4. Taken van de zoon",
    "- Leer hem dat eerlijkheid redding is en leugen verderf",
    "",
    "5. Tijdschema en evaluatie",
    "- Week 1-2: dagelijkse herinnering na Fajr",
    "- Week 3-4: evalueer de vooruitgang",
  ].join("\n");

  it("produces one section per numbered heading, in order", () => {
    const sections = groupIntoSections(parsePlanText(TRANSLATED_DUTCH_PLAN));
    expect(sections.map((s) => s.title)).toEqual([
      "Diagnose van het probleem",
      "Taken van de vader - langetermijnopvoeding",
      "Taken van de vader - kortetermijnopvoeding",
      "Taken van de zoon",
      "Tijdschema en evaluatie",
    ]);
  });

  it("keeps the dash-bulleted lines under their section as tasks, not headings", () => {
    const sections = groupIntoSections(parsePlanText(TRANSLATED_DUTCH_PLAN));
    expect(sections[1].blocks.map((b: any) => b.text)).toEqual([
      "Herzie je intentie in de opvoeding van je zoon",
      "Leer dat het goede voorbeeld krachtiger is dan de vermaning",
    ]);
  });
});

describe("regression: an Arabic-authored plan still splits correctly", () => {
  const ARABIC_PLAN = [
    "1. تشخيص المشكلة",
    "المشكلة الحقيقية أن الطفل يميل إلى الكذب خوفًا من العقاب.",
    "",
    "2. مهام الوالد - التربية البعيدة المدى",
    "- راجع نيتك في تربية ابنك",
    "",
    "3. مهام الوالد - التربية القصيرة المدى",
    "- ذكّره يوميًا بأهمية الصدق بعد صلاة الفجر",
    "",
    "4. مهام الابن",
    "- علّمه أن الصدق منجاة والكذب مهلكة",
    "",
    "5. الجدول الزمني والتقييم",
    "- الأسبوع 1-2: تذكير يومي",
  ].join("\n");

  it("produces one section per numbered heading, in order", () => {
    const sections = groupIntoSections(parsePlanText(ARABIC_PLAN));
    expect(sections.map((s) => s.title)).toEqual([
      "تشخيص المشكلة",
      "مهام الوالد - التربية البعيدة المدى",
      "مهام الوالد - التربية القصيرة المدى",
      "مهام الابن",
      "الجدول الزمني والتقييم",
    ]);
  });
});

describe("regression: an ALL-CAPS nl/en plan still splits correctly", () => {
  const ENGLISH_PLAN = [
    "1. DIAGNOSIS & ANALYSIS",
    "The child struggles with honesty when afraid of punishment.",
    "",
    "2. WHAT MUST THE PARENT CHANGE FIRST?",
    "- Reflect on your own intentions in raising your son",
    "",
    "3. TREATMENT PLAN - FOUNDATION: 'AQEEDAH",
    "- Teach tawheed concepts appropriate to his age",
  ].join("\n");

  it("produces one section per numbered heading, in order", () => {
    const sections = groupIntoSections(parsePlanText(ENGLISH_PLAN));
    expect(sections.map((s) => s.title)).toEqual([
      "DIAGNOSIS & ANALYSIS",
      "WHAT MUST THE PARENT CHANGE FIRST?",
      "TREATMENT PLAN - FOUNDATION: 'AQEEDAH",
    ]);
  });
});

describe("the fallback section for headingless text is localised", () => {
  const NO_HEADINGS = "Doe elke dag een goede daad voor je ouders.";

  it("stays the Arabic مقدمة by default (ar / no language given)", () => {
    const sections = groupIntoSections(parsePlanText(NO_HEADINGS));
    expect(sections).toHaveLength(1);
    expect(sections[0].synthetic).toBe(true);
    expect(sections[0].title).toBe("مقدمة");
  });

  it("is not the Arabic literal when the language is Dutch", () => {
    const sections = groupIntoSections(parsePlanText(NO_HEADINGS), "nl");
    expect(sections[0].title).not.toBe("مقدمة");
  });

  it("is not the Arabic literal when the language is English", () => {
    const sections = groupIntoSections(parsePlanText(NO_HEADINGS), "en");
    expect(sections[0].title).not.toBe("مقدمة");
  });
});

describe("regression: numbered tasks that restart per section are not promoted to headings", () => {
  // server/ai-chat.ts's plan shape is the opposite of advice.ts's: headings are
  // un-numbered keyword lines, and every numbered line under them is a task
  // whose numbering restarts at 1 under each new heading. A numbering-only
  // heuristic must tell this apart from advice.ts's single running outline, or
  // every task in this format becomes a collapsed, uncheckable heading instead.
  const RESTARTING_PLAN = [
    "علاج في التصفية:",
    "1. اغرس في عقله أن الرزق من عند الله",
    "2. علمه أن مهاراته نعمة من الله",
    "",
    "علاج في التزكية:",
    "1. حبب إليه نشر العلم الشرعي",
  ].join("\n");

  it("keeps the numbered lines as tasks", () => {
    expect(taskKeysOf(RESTARTING_PLAN)).toEqual(["task-0", "task-1", "task-2"]);
  });

  it("does not add a heading1 for any of the numbered lines", () => {
    const blocks = parsePlanText(RESTARTING_PLAN);
    const headingTexts = blocks
      .filter((b) => b.type === "heading1")
      .map((b) => (b as { text: string }).text);
    expect(headingTexts).toEqual(["علاج في التصفية:", "علاج في التزكية:"]);
  });
});

describe("cubic P1: a translated ai-chat plan keeps its tasks and section titles", () => {
  // RESTARTING_PLAN above, run through useAutoTranslate into Dutch. Translation
  // removes the one thing isArabicSectionHeading keys off (the Arabic keyword)
  // and these headings are sentence case, not ALL-CAPS, so isLatinSectionHeading
  // doesn't match either. Only the trailing colon on the heading's own line is
  // left — the same convention lib/plan-steps.ts's SECTION_HEADING already
  // relies on for this exact plan shape.
  const TRANSLATED_RESTARTING_PLAN = [
    "Behandeling voor tasfiyah:",
    "1. Plant in zijn verstand dat levensonderhoud van Allah komt",
    "2. Leer hem dat zijn talenten een gave van Allah zijn",
    "",
    "Behandeling voor tazkiyah:",
    "1. Maak het hem lief om religieuze kennis te verspreiden",
  ].join("\n");

  it("keeps the numbered lines as tasks", () => {
    expect(taskKeysOf(TRANSLATED_RESTARTING_PLAN)).toEqual([
      "task-0",
      "task-1",
      "task-2",
    ]);
  });

  it("splits into one section per translated heading, titled correctly", () => {
    const sections = groupIntoSections(parsePlanText(TRANSLATED_RESTARTING_PLAN));
    expect(sections.map((s) => s.title)).toEqual([
      "Behandeling voor tasfiyah:",
      "Behandeling voor tazkiyah:",
    ]);
  });

  it("does not add a heading1 for any of the numbered lines", () => {
    const blocks = parsePlanText(TRANSLATED_RESTARTING_PLAN);
    const headingTexts = blocks
      .filter((b) => b.type === "heading1")
      .map((b) => (b as { text: string }).text);
    expect(headingTexts).toEqual([
      "Behandeling voor tasfiyah:",
      "Behandeling voor tazkiyah:",
    ]);
  });
});

// Phase 1 of the cubic-round-2 fix (see isNumberedOutline's comment in
// lib/plan-blocks.ts): every heading shape server/advice.ts and
// server/ai-chat.ts can produce, in every language, translated or not, laid
// out as one row each instead of accumulating another one-off special case.
// The two rows marked "cubic" are the exact fixtures the review measured;
// the rest pin shapes that were already correct so the fix cannot trade one
// misfire for another.
describe("plan shape table: every numbered-vs-heading convention this parser resolves", () => {
  const ROWS: { name: string; text: string; titles: string[]; taskCount: number }[] = [
    {
      name: "advice.ts Arabic, untranslated: numbered outline, Arabic keyword on the heading itself",
      text: ["1. تشخيص المشكلة", "- السبب الحقيقي كذا", "2. مهام الوالد", "- راجع نيتك في تربيته"].join("\n"),
      titles: ["تشخيص المشكلة", "مهام الوالد"],
      taskCount: 2,
    },
    {
      name: "advice.ts nl/en, untranslated: numbered outline, ALL-CAPS heading",
      text: [
        "1. DIAGNOSIS & ANALYSIS",
        "- Reflect on the root cause",
        "2. WHAT MUST THE PARENT CHANGE FIRST?",
        "- Improve your own habits first",
      ].join("\n"),
      titles: ["DIAGNOSIS & ANALYSIS", "WHAT MUST THE PARENT CHANGE FIRST?"],
      taskCount: 2,
    },
    {
      name: "advice.ts any language, machine-translated: numbered outline, sentence case, no keyword survives",
      text: [
        "1. Diagnose van het probleem",
        "- De echte oorzaak is dit",
        "2. Taken van de vader",
        "- Herzie je aanpak",
      ].join("\n"),
      titles: ["Diagnose van het probleem", "Taken van de vader"],
      taskCount: 2,
    },
    {
      name: "cubic P2: advice.ts translated, numbered outline WITH a stray colon-terminated body line",
      // Measured verbatim in the review finding. "Doel:" is body text, not a
      // heading -- it must not steal the outline's two real headings.
      text: [
        "1. Diagnose van het probleem",
        "Doel:",
        "- Herzie je intentie",
        "2. Taken van de vader",
        "- Leer dat het goede voorbeeld krachtiger is dan de vermaning",
      ].join("\n"),
      titles: ["Diagnose van het probleem", "Taken van de vader"],
      taskCount: 2,
    },
    {
      name: "ai-chat.ts Arabic, untranslated: keyword headings, numbered tasks CONTINUING across headings",
      text: [
        "مهام الوالد:",
        "1. راجع نيتك في تربيته",
        "2. اقرأ باب الإخلاص",
        "مهام الابن:",
        "3. دربه على الإقناع بالحسنى",
      ].join("\n"),
      titles: ["مهام الوالد:", "مهام الابن:"],
      taskCount: 3,
    },
    {
      name: "ai-chat.ts Arabic, untranslated: keyword headings, numbered tasks RESTARTING per heading",
      text: [
        "علاج في التصفية:",
        "1. اغرس فيه أن الرزق من عند الله",
        "2. علمه أن مهاراته نعمة من الله",
        "علاج في التزكية:",
        "1. حبب إليه نشر العلم الشرعي",
      ].join("\n"),
      titles: ["علاج في التصفية:", "علاج في التزكية:"],
      taskCount: 3,
    },
    {
      name: "ai-chat.ts translated: colon-terminated heading (keyword lost), numbered tasks",
      text: [
        "Behandeling voor tasfiyah:",
        "1. Plant dit idee",
        "2. Leer hem dat",
        "Behandeling voor tazkiyah:",
        "1. Maak dit lief",
      ].join("\n"),
      titles: ["Behandeling voor tasfiyah:", "Behandeling voor tazkiyah:"],
      taskCount: 3,
    },
    {
      name: "cubic P1: ai-chat.ts nl/en, untranslated: bold Week-phase headers, NO keyword heading anywhere",
      // Measured verbatim in the review finding. nl/en ai-chat.ts plans have
      // no keyword or colon heading convention at all -- only "Week N: …"
      // phase markers, which today's rules don't recognise as headings
      // either (they become heading3, not heading1). The numbered steps
      // under them must stay tasks regardless. Third line extended past the
      // finding's own truncated "Evalueer…" (9 chars) -- isCompleteTask's
      // unrelated 10-char floor would reject that fragment as a task on its
      // own merits, which isn't what this row exists to measure.
      text: [
        "**Week 1: Fundament**",
        "1. Leer je kind…",
        "2. Ga elke dag…",
        "**Week 2: Verdieping**",
        "3. Evalueer de voortgang…",
      ].join("\n"),
      titles: [],
      taskCount: 3,
    },
    {
      name: "ai-chat.ts Week-phase, translated and with its bold markers already stripped by cleanTreatmentText",
      // Every real caller runs cleanTreatmentText (which strips **) before
      // this parser ever sees the text -- so the bare, unbolded form below
      // is what actually reaches parsePlanText in the app, translated or not.
      text: [
        "Week 1: Foundation",
        "1. Teach your child this",
        "2. Sit with him daily",
        "Week 2: Deepening",
        "3. Evaluate progress",
      ].join("\n"),
      titles: [],
      taskCount: 3,
    },
    {
      name: "cubic round 3: getSpouseAdvice's pre-change flat numbered list (no themed sections) stays a task list",
      // The shape getSpouseAdvice produced before its prompt required themed
      // sections -- still possible if the model ignores that instruction, and
      // it lives on in cached advice. It opens on a numbered line and has >=2
      // of them, same as advice.ts's real outline, but nothing ever follows a
      // number before the next one: no intro sentence, no colon sub-label, no
      // dash bullet. That is the tell -- advice.ts's real headings always have
      // a body between one number and the next.
      text: [
        "1. Have an honest, calm conversation about how the week has been",
        "2. Do something small and kind for your spouse without being asked",
        "3. Plan a short activity together after the children are asleep",
      ].join("\n"),
      titles: [],
      taskCount: 3,
    },
    {
      name: "cubic round 3: ai-chat.ts translated heading with a stray colon-terminated body label inside its tasks",
      // "Doel:" here is a label inside the first section's own body (its actual
      // content is the next line, not on the same line -- otherwise it would
      // not even end in a colon), not a second heading. The real heading before
      // it is followed by a numbered task; the label is followed by plain
      // prose. That is the only thing left to tell them apart once translation
      // removes the Arabic keyword ai-chat.ts's headings are otherwise
      // recognised by.
      text: [
        "Behandeling voor tasfiyah:",
        "1. Plant in zijn verstand dat levensonderhoud van Allah komt",
        "Doel:",
        "Vertrouwen op Allah opbouwen.",
        "2. Leer hem dat zijn talenten een gave van Allah zijn",
        "",
        "Behandeling voor tazkiyah:",
        "1. Maak het hem lief om religieuze kennis te verspreiden",
      ].join("\n"),
      titles: ["Behandeling voor tasfiyah:", "Behandeling voor tazkiyah:"],
      taskCount: 3,
    },
    {
      name: "cubic round 5: getSpouseAdvice's flat numbered list, but each task now has an elaboration sentence under it",
      // The same shape as "getSpouseAdvice's pre-change flat numbered list" above
      // -- still no themed sections -- except the model now adds one plain
      // sentence of elaboration under each suggestion instead of leaving it bare.
      // everyNumberedLineHasBody can't tell that elaboration apart from a real
      // section's own intro sentence (advice.ts's row 3 above has exactly that
      // shape and must stay a heading), so it promotes all three tasks to
      // headings and every checkbox vanishes.
      text: [
        "1. Have an honest, calm conversation about how the week has been",
        "Choose a quiet moment after the children are asleep.",
        "2. Do something small and kind for your spouse without being asked",
        "A cup of tea or a genuine compliment both count.",
        "3. Plan a short activity together after the children are asleep",
        "Even twenty minutes without phones helps rebuild connection.",
      ].join("\n"),
      titles: [],
      taskCount: 3,
    },
    {
      name: "cubic round 7: getSpouseAdvice's flat numbered list where ONE task's elaboration is a dash bullet, the other two plain prose",
      // Same flat list as cubic round 5 above -- still no themed sections --
      // except the model dresses up ONE item's elaboration as a dash bullet
      // instead of a plain sentence, the other two staying prose. A single
      // stray bullet anywhere in the document was enough for the old bare
      // .some() to call the WHOLE document a numbered outline, promoting
      // every task in it -- including the two with no bullet at all -- to a
      // heading and dropping every checkbox.
      //
      // "- Tea." is deliberately under isCompleteTask's own 10-char floor so
      // it stays a paragraph rather than becoming a task in its own right --
      // this row exists to measure someNumberedBodyIsBulleted only, the same
      // isolation the Week-phase row above already applies for the same
      // unrelated floor.
      text: [
        "1. Have an honest, calm conversation about how the week has been",
        "Choose a quiet moment after the children are asleep.",
        "2. Do something small and kind for your spouse without being asked",
        "- Tea.",
        "3. Plan a short activity together after the children are asleep",
        "Even twenty minutes without phones helps rebuild connection.",
      ].join("\n"),
      titles: [],
      taskCount: 3,
    },
  ];

  it.each(ROWS)("$name", ({ text, titles, taskCount }) => {
    const sections = groupIntoSections(parsePlanText(text));
    const realTitles = sections.filter((s: Section) => !s.synthetic).map((s: Section) => s.title);
    expect(realTitles).toEqual(titles);
    expect(taskKeysOf(text)).toHaveLength(taskCount);
  });
});
