import { isArabicSectionHeading } from "@/lib/plan-heading";

type PlanStep = { id: string; text: string; day?: number };
type PlanPhase = { phase: string; steps: PlanStep[] };

// A step opens on a numbered line ("1. …", "2) …", "١- …") or a bullet, and runs
// on across plain continuation lines until a blank line or the next heading.
//
// An earlier version captured everything up to the *next number*, so a section
// heading sitting between two numbered lists ("علاج في التزكية:") was glued onto
// the tail of the step above it and its newlines flattened to spaces — which is
// what the parent saw. Stopping at the heading is the whole fix; the run-on is
// what keeps a wrapped step and its sub-bullets from being lost instead.
const NUMBERED_STEP = /^\s*(?:\*\*)?\s*(?:\d+|[١-٩٠]+)[.)\-\s]+(.+)$/;
const BULLET_STEP = /^\s*[-*•]\s+(.+)$/;
// Section headings in these plans are their own line ending in a colon. A bullet
// or numbered line is a step even when it ends in one, so both are matched first.
const SECTION_HEADING = /:\s*$/;

// A plan is parsed section by section, so counting from zero each time would hand
// the same id to one step in every section — and ticking one would tick its
// twins, since progress is stored by step id.
let stepSequence = 0;

const clean = (raw: string) =>
  raw.replace(/\*+/g, "").replace(/#+\s*/g, "").replace(/_{2,}/g, "").trim();

export function extractSteps(text: string): PlanStep[] {
  const steps: PlanStep[] = [];
  // Bullets sitting under a numbered step are that step's own actions. Bullets
  // before any numbered step are the diagnosis explaining itself, and they only
  // count as tasks in a plan that never numbers anything.
  const commentary: PlanStep[] = [];
  let sawNumbered = false;

  let current: string | null = null;
  const close = () => {
    if (current !== null && current.length > 5) {
      const step = { id: `step_${Date.now()}_${stepSequence++}`, text: current };
      (sawNumbered ? steps : commentary).push(step);
    }
    current = null;
  };

  for (const raw of text.split("\n")) {
    const numbered = raw.match(NUMBERED_STEP);
    const step = numbered ?? raw.match(BULLET_STEP);
    if (step) {
      close();
      if (numbered) sawNumbered = true;
      current = clean(step[1]);
      continue;
    }
    // Judge the heading on the cleaned line: the advisor bolds its headings, and
    // "**علاج في التزكية:**" ends in "**", so the raw line never looks like one.
    const line = clean(raw);
    if (!line || SECTION_HEADING.test(line) || isArabicSectionHeading(line)) {
      close();
    } else if (current !== null) {
      current = `${current} ${line}`.trim();
    }
  }
  close();
  return sawNumbered ? steps : commentary;
}

export function parseActionPlanSteps(content: string, language: string): PlanPhase[] {
  const phases: PlanPhase[] = [];
  // Split by week/phase markers
  const weekRegex = /(?:الأسبوع|Week|week|Fase|fase|المرحلة)\s*(\d+)/gi;
  const sections = content.split(weekRegex);

  // If no week markers found, treat entire content as one phase
  if (sections.length <= 1) {
    const steps = extractSteps(content);
    if (steps.length > 0) {
      phases.push({ phase: language === "ar" ? "الأسبوع 1" : "Week 1", steps });
    }
  } else {
    const addPhase = (phaseName: string, steps: PlanStep[]) => {
      if (steps.length === 0) return;
      // Distribute steps across 7 days
      const stepsPerDay = Math.ceil(steps.length / 7);
      steps.forEach((step, idx) => {
        step.day = Math.min(Math.floor(idx / stepsPerDay) + 1, 7);
      });
      phases.push({ phase: phaseName, steps });
    };
    const weekLabel = (num: string) =>
      language === "ar" ? `الأسبوع ${num}` : `Week ${num}`;
    // Alternating match/content
    const weeks: { name: string; steps: PlanStep[] }[] = [];
    for (let i = 1; i < sections.length; i += 2) {
      weeks.push({
        name: weekLabel(sections[i]),
        steps: extractSteps(sections[i + 1] || ""),
      });
    }
    // sections[0] is everything before the first week marker, and it used to be
    // thrown away. The plan names its weeks only in a closing timeline, so that
    // head is where all of the steps are — dropping it emptied the whole plan.
    // Those steps come before any week is named, so they belong to the first one
    // rather than to a second phase carrying the same name.
    const lead = extractSteps(sections[0]);
    if (lead.length > 0) {
      // The first week named, not the first that happens to carry steps — filing
      // them under "الأسبوع 3" because week 1 was empty would be plainly wrong.
      if (weeks.length > 0) weeks[0].steps.unshift(...lead);
      else weeks.push({ name: weekLabel("1"), steps: lead });
    }
    for (const week of weeks) addPhase(week.name, week.steps);
  }
  return phases;
}
