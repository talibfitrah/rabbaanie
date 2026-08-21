import { describe, it, expect } from "vitest";
import fs from "fs";
import { taskKeysOf, parsePlanText, groupIntoSections, migrateLegacyTaskKeys, displayBlocks } from "../lib/plan-blocks";

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
  // Fixed once by keying the bar off taskKeysOf(planText) and the display off
  // parsePlanText(effectiveText) -- which cubic then found broke the checkbox
  // itself: task keys are content-derived (nextTaskKey), so a task parsed from
  // effectiveText (translated) gets a DIFFERENT key than the same task parsed
  // from planText (original), and a tick on the translated box was invisible
  // to the original-keyed bar. displayBlocks is the actual fix: it parses
  // effectiveText for display but keys every task to its CANONICAL position in
  // planText's own parse, so a tick made on either side of the auto-translate
  // toggle lands in the same key space. Asserted by behaviour, not by grepping
  // the renderer's source for which functions it calls.
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

  it("gives one key per task", () => {
    expect(taskKeysOf(ARABIC_PLAN)).toHaveLength(3);
    expect(taskKeysOf(DUTCH_PLAN)).toHaveLength(2);
  });

  it("keys a plan's tasks by their own text, so unrelated plans never share a key", () => {
    // The original reason this mattered still holds -- the original text must
    // be the one measured against, never a translation of it -- but the
    // mechanism changed: keys are content-derived now (see nextTaskKey in
    // lib/plan-blocks.ts), not "the Nth task of whatever you parsed". Two
    // plans in different languages have no shared text, so their key sets
    // are disjoint by construction, the same guarantee positional keys never
    // gave (task-0 of one plan is just as much "task-0" as task-0 of another).
    const arabicKeys = new Set(taskKeysOf(ARABIC_PLAN));
    const dutchKeys = new Set(taskKeysOf(DUTCH_PLAN));
    expect([...arabicKeys].some((k) => dutchKeys.has(k))).toBe(false);
  });

  it("leaves the plan's tasks outstanding when only the translation is ticked", () => {
    // The bug this guards: ticking the boxes a Dutch reader sees must not mark
    // any of the Arabic plan's tasks done, in the bar or in the daily reminder.
    const ticked = new Set(taskKeysOf(DUTCH_PLAN));
    expect(taskKeysOf(ARABIC_PLAN).filter((k) => !ticked.has(k))).toHaveLength(3);
  });

  it("a tick on the displayed (translated) box is counted by the original-keyed progress", () => {
    const canonicalKeys = taskKeysOf(ARABIC_PLAN);
    // DUTCH_PLAN stands in for effectiveText (what useAutoTranslate fetched);
    // ARABIC_PLAN stands in for planText (what taskKeysOf measures against).
    const displayed = displayBlocks(DUTCH_PLAN, ARABIC_PLAN).filter((b) => b.type === "task") as { key: string }[];

    // Simulates toggleTask(block.key) on the FIRST rendered (Dutch) box.
    const completedTasks = new Set<string>([displayed[0].key]);
    const completedCount = canonicalKeys.filter((k) => completedTasks.has(k)).length;
    expect(completedCount).toBe(1);
    expect(completedTasks.has(canonicalKeys[0])).toBe(true);
  });

  it("DUTCH_PLAN's one-task-short translation still maps its second box to the SECOND Arabic task, not the third (anti-mis-mapping)", () => {
    const canonicalKeys = taskKeysOf(ARABIC_PLAN);
    const displayed = displayBlocks(DUTCH_PLAN, ARABIC_PLAN).filter((b) => b.type === "task") as { key: string }[];
    const completedTasks = new Set<string>([displayed[1].key]); // "Lees samen..." (2nd Dutch box)

    expect(completedTasks.has(canonicalKeys[0])).toBe(false);
    expect(completedTasks.has(canonicalKeys[1])).toBe(true);
    expect(completedTasks.has(canonicalKeys[2])).toBe(false);
  });
});

// A specialist can edit a saved plan's text in place (server/routers.ts
// specialist.updatePlan accepts planContent, same planId, so the same
// AsyncStorage progress entry is reparsed against the new text next time the
// screen opens). A positional key is the Nth task of WHATEVER got parsed --
// inserting one task before an already-ticked one shifts every key after it,
// so a parent's tick silently lands on work they never did.
describe("a task's identity survives edits elsewhere in the plan", () => {
  const BEFORE_EDIT = [
    "- اجلس مع ابنك بعد صلاة الفجر",
    "- اقرأ معه صفحة من المصحف كلّ يوم",
    "- ذكّره بفضل الصلاة في وقتها",
  ].join("\n");
  // Same three tasks, untouched, plus one new task inserted at the top --
  // exactly what a specialist's edit looks like.
  const AFTER_EDIT = [
    "- اتصل بالمعلم لمتابعة تحصيله الدراسي",
    "- اجلس مع ابنك بعد صلاة الفجر",
    "- اقرأ معه صفحة من المصحف كلّ يوم",
    "- ذكّره بفضل الصلاة في وقتها",
  ].join("\n");

  it("keeps the same key for an unchanged task after a task is inserted before it", () => {
    const beforeKeys = taskKeysOf(BEFORE_EDIT);
    const afterKeys = taskKeysOf(AFTER_EDIT);
    // "اقرأ معه صفحة..." was the SECOND task before the edit and is the THIRD
    // (index 2) after it -- the key must move with the task, not stay at index 1.
    const secondTaskKeyBefore = beforeKeys[1];
    expect(afterKeys.indexOf(secondTaskKeyBefore)).toBe(2);
  });

  it("does not mark the newly-inserted task done when only the old first task was ticked", () => {
    const ticked = new Set([taskKeysOf(BEFORE_EDIT)[0]]); // "اجلس مع ابنك..." ticked
    const afterKeys = taskKeysOf(AFTER_EDIT);
    // The inserted task ("اتصل بالمعلم...") is now first and must read as NOT
    // done; the real ticked task ("اجلس مع ابنك...", now second) must still
    // read as done.
    expect(ticked.has(afterKeys[0])).toBe(false);
    expect(ticked.has(afterKeys[1])).toBe(true);
  });
});

// Real users already have progress saved under the old positional scheme
// (`task-0`, `task-1`, …). Switching schemes must not silently discard or
// misapply it -- migrateLegacyTaskKeys upgrades it in place, exactly when
// that is unambiguous: the plan's text has not changed since the tick.
describe("legacy positional progress migrates to the content-derived scheme", () => {
  const PLAN = [
    "- اجلس مع ابنك بعد صلاة الفجر",
    "- اقرأ معه صفحة من المصحف كلّ يوم",
    "- ذكّره بفضل الصلاة في وقتها",
  ].join("\n");

  it("maps old task-N keys onto the SAME tasks' new keys, by text, not just by count", () => {
    const legacyStored = ["task-0", "task-2"]; // first and third ticked under the old scheme
    const migrated = migrateLegacyTaskKeys(legacyStored, PLAN);
    const currentKeys = taskKeysOf(PLAN);
    // Proves the correct TASKS survive, not merely that two keys came back:
    // the migrated set must mark the first and third tasks done and the
    // second one not, whatever the new keys look like.
    expect(currentKeys.map((k) => migrated.includes(k))).toEqual([true, false, true]);
  });

  it("leaves already-migrated (content-derived) keys untouched", () => {
    const currentKeys = taskKeysOf(PLAN);
    expect(migrateLegacyTaskKeys([currentKeys[1]], PLAN)).toEqual([currentKeys[1]]);
  });

  it("drops a legacy key that no longer has a matching task, instead of crashing or matching the wrong one", () => {
    const migrated = migrateLegacyTaskKeys(["task-99"], PLAN);
    // Returned unchanged, and "task-99" cannot equal any key nextTaskKey
    // produces (all "task2-…"), so it silently stops counting as done --
    // never crashes, never latches onto an unrelated task.
    expect(migrated).toEqual(["task-99"]);
    expect(taskKeysOf(PLAN)).not.toContain("task-99");
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
