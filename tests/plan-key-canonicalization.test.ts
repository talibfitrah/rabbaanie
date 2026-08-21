import { describe, it, expect } from "vitest";
import { taskKeysOf, displayBlocks } from "@/lib/plan-blocks";
import { canonicalPlanText, cleanTreatmentText } from "@/lib/plan-text";

// cubic P1 + P2 on 336b547: content-derived task keys (lib/plan-blocks.ts's
// nextTaskKey) fixed a key shifting under an edit elsewhere in the plan, but
// broke the moment the SAME task got parsed from two different strings -- a
// translation of the plan (P1), or the same plan cleaned for two different UI
// languages (P2, lib/plan-text.ts's cleanTreatmentText transliterates Latin
// Islamic terms only under "ar"). Both are "the same task, different text",
// which a content-derived key treats as two unrelated tasks.

describe("canonicalPlanText is stable across the UI language its input was already cleaned for (P2)", () => {
  // The one case that actually differs between languages: a Latin-spelled
  // Islamic term, which cleanTreatmentText only transliterates under "ar".
  const content = "- Remind him that everything is from Allaah\n- Read a page of Qur'aan together daily";

  it("produces the same text no matter which language cleanTreatmentText already ran with", () => {
    const viaAr = canonicalPlanText(cleanTreatmentText(content, "ar"));
    const viaEn = canonicalPlanText(cleanTreatmentText(content, "en"));
    const viaNl = canonicalPlanText(cleanTreatmentText(content, "nl"));
    expect(viaEn).toBe(viaAr);
    expect(viaNl).toBe(viaAr);
  });

  it("keeps task keys stable across a UI language switch", () => {
    const keysUnderAr = taskKeysOf(canonicalPlanText(cleanTreatmentText(content, "ar")));
    const keysUnderEn = taskKeysOf(canonicalPlanText(cleanTreatmentText(content, "en")));
    expect(keysUnderEn).toEqual(keysUnderAr);
    expect(keysUnderAr).toHaveLength(2);
  });
});

describe("displayBlocks keys a translated task to its canonical position (P1)", () => {
  const canonicalText = [
    "- اجلس مع ابنك بعد صلاة الفجر",
    "- اقرأ معه صفحة من المصحف كلّ يوم",
    "- ذكّره بفضل الصلاة في وقتها",
  ].join("\n");
  // A machine translation of the SAME three tasks, in order -- what
  // useAutoTranslate's fetched `translated` text looks like.
  const translatedText = [
    "- Zit na het fajr-gebed bij je zoon",
    "- Lees samen elke dag een pagina uit de Koran",
    "- Herinner hem aan de waarde van het gebed op tijd",
  ].join("\n");

  it("gives each displayed task the canonical key at its own position", () => {
    const canonicalKeys = taskKeysOf(canonicalText);
    const tasks = displayBlocks(translatedText, canonicalText).filter((b) => b.type === "task") as { key: string }[];
    expect(tasks.map((t) => t.key)).toEqual(canonicalKeys);
  });

  it("keeps the displayed text translated even though the key is canonical", () => {
    const tasks = displayBlocks(translatedText, canonicalText).filter((b) => b.type === "task") as { text: string }[];
    expect(tasks[0].text).toBe("Zit na het fajr-gebed bij je zoon");
  });

  it("a tick on the displayed (translated) box is counted by the canonical-keyed progress, as the RIGHT task", () => {
    // Simulates toggleTask(block.key) on the first displayed box.
    const displayed = displayBlocks(translatedText, canonicalText).filter((b) => b.type === "task") as { key: string }[];
    const completedTasks = new Set<string>([displayed[0].key]);

    const canonicalKeys = taskKeysOf(canonicalText);
    const completedCount = canonicalKeys.filter((k) => completedTasks.has(k)).length;
    expect(completedCount).toBe(1);
    expect(completedTasks.has(canonicalKeys[0])).toBe(true);
    expect(completedTasks.has(canonicalKeys[1])).toBe(false);
    expect(completedTasks.has(canonicalKeys[2])).toBe(false);
  });

  it("does not mark a different task done -- ticking displayed task 2 only marks canonical task 2 (anti-mis-mapping)", () => {
    const displayed = displayBlocks(translatedText, canonicalText).filter((b) => b.type === "task") as { key: string }[];
    const canonicalKeys = taskKeysOf(canonicalText);
    const completedTasks = new Set<string>([displayed[1].key]); // "Lees samen..." (2nd task)

    expect(completedTasks.has(canonicalKeys[0])).toBe(false);
    expect(completedTasks.has(canonicalKeys[1])).toBe(true);
    expect(completedTasks.has(canonicalKeys[2])).toBe(false);
  });

  it("degrades to the plain parse's own keys when display text equals canonical text (no translation showing)", () => {
    const tasks = displayBlocks(canonicalText, canonicalText).filter((b) => b.type === "task") as { key: string }[];
    expect(tasks.map((t) => t.key)).toEqual(taskKeysOf(canonicalText));
  });
});
