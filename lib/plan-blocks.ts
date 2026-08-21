/**
 * Turns a plan's text into the blocks the renderer draws — and, crucially, into
 * the task list its checkboxes are keyed on.
 *
 * This lives here rather than beside the renderer because three places need the
 * same answer: the renderer that draws the checkboxes, the card that shows how
 * many are ticked, and the daily reminder that offers the next one still to do.
 * When the reminder counted with a different parser, "how many are done" and
 * "which ones are left" came from two lists that were free to disagree, and the
 * reminder could skip past work the parents had not done.
 */
import {
  isArabicSectionHeading,
  isColonTerminatedHeading,
  isLatinSectionHeading,
} from "@/lib/plan-heading";

export type ParsedBlock =
  | { type: "heading1"; text: string }
  | { type: "heading2"; text: string }
  | { type: "heading3"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "task"; text: string; key: string }
  | { type: "separator" }
  | { type: "warning"; text: string };


function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-•]\s*/, "")
    .replace(/^\d+\.\s*/, "")
    .trim();
}

function isCompleteTask(line: string): boolean {
  const cleaned = cleanMarkdown(line);
  if (cleaned.length < 10 || cleaned.length > 300) return false;
  const isBulleted = /^[-•*]\s*/.test(line.trim()) || /^\d+\.\s/.test(line.trim());
  if (!isBulleted) return false;
  if (cleaned.startsWith("أي ") && cleaned.includes("؟")) return false;
  if (cleaned.startsWith('"') || cleaned.startsWith('«') || cleaned.startsWith('"')) return false;
  if (cleaned.startsWith("مثل:") || cleaned.startsWith("مثال:")) return false;
  return true;
}

function isHeading1(trimmed: string, isNumberedOutline: boolean, nextLineIsNumberedTask: boolean): boolean {
  const h1Match = trimmed.match(/^(?:#{1,2}\s+|(?:\*\*)?(\d+)\.\s*)(.+?)(?:\*\*)?$/);
  if (h1Match && (
    trimmed.includes("تشخيص") ||
    trimmed.includes("مهام الوالد") ||
    trimmed.includes("مهام الابن") ||
    trimmed.includes("مهام البنت") ||
    trimmed.includes("الجدول الزمني") ||
    trimmed.includes("التحليل") ||
    trimmed.includes("علاج في") ||
    /^#{1,2}\s/.test(trimmed) ||
    /^\*\*\d+\./.test(trimmed)
  )) return true;
  // Also match standalone section titles like "التشخيص:" or "علاج في التصفية:",
  // bolded or not — a raw "**علاج في التزكية:**" matches nothing above, so
  // without this it renders as body text inside the section before it.
  if (isArabicSectionHeading(trimmed)) return true;
  // And their translated form, where the Arabic keyword above no longer
  // matches — see isColonTerminatedHeading's own comment for why the colon
  // is what's left to key off once translation removes the vocabulary.
  //
  // Trusted only when this document is NOT itself a numbered outline: an
  // advice.ts plan's BODY routinely contains its own colon-terminated labels
  // once translated (its تمهيد:/تصفية:/تزكية:/تربية: sub-labels lose the
  // Arabic keyword the same way its top-level headings do), and a single
  // such line — even one as generic as "Doel:" — must not be read as a
  // heading: doing so both invents a phantom section AND, before this gate
  // existed, fed back into isNumberedOutline's own document-wide scan and
  // convinced it a heading already existed, demoting the plan's two real
  // numbered headings to tasks (cubic P2, measured on exactly one stray
  // "Doel:" line).
  //
  // ai-chat.ts's real headings always introduce numbered tasks (see this
  // file's own header comment on the two plan families) -- a colon-terminated
  // line that ISN'T followed by one is a body label like "Doel:"/"Materialen:"
  // sitting alone on its own line, the same mistake the isNumberedOutline
  // guard above prevents for advice.ts's shape, left unguarded here until now
  // (cubic round 3).
  if (!isNumberedOutline && isColonTerminatedHeading(trimmed) && nextLineIsNumberedTask) return true;
  return false;
}

/**
 * A task's identity is the text a parent actually reads and ticks, not its
 * position in the document. A plain index breaks the moment anything before
 * it changes -- inserting, removing or reordering a task elsewhere shifts
 * every index after it, and this file's own history (see isHeading1's
 * comment above: cubic round 3, 5, 7, P1, P2) shows that "elsewhere" also
 * includes the parser's own classification rules changing under an app
 * update, for text that never changed at all.
 *
 * Keying on the cleaned text instead survives all of that: a task keeps its
 * key as long as its own wording does, regardless of what happens around it.
 * Two tasks with identical wording are disambiguated by which occurrence
 * they are, so duplicate text still gets distinct keys.
 *
 * Prefixed "task2-", not "task-": a stored legacy `task-<N>` key (the old
 * positional scheme) must never collide with one from this scheme, since
 * migrateLegacyTaskKeys below depends on telling the two apart on sight.
 */
function nextTaskKey(cleanedText: string, occurrences: Map<string, number>): string {
  const n = occurrences.get(cleanedText) ?? 0;
  occurrences.set(cleanedText, n + 1);
  return `task2-${n}-${cleanedText}`;
}

export function parsePlanText(text: string): ParsedBlock[] {
  if (!text) return [];
  const lines = text.split("\n");
  const blocks: ParsedBlock[] = [];
  const taskOccurrences = new Map<string, number>();

  // Two plan shapes share this parser. server/advice.ts numbers its own
  // top-level section outline 1..N and gives a heading no other form —
  // everything under one is a dash bullet, plain paragraph, or one of
  // advice.ts's own nested تمهيد:/تصفية:/تزكية:/تربية: sub-labels — so once
  // translated into a language where neither an Arabic keyword nor the
  // en/nl ALL-CAPS convention survives, the numbering is the only signal
  // left that these lines are headings, not tasks.
  //
  // server/ai-chat.ts is the opposite in two different ways: its Arabic
  // prompt's headings are un-numbered keyword lines, with numbered TASKS
  // under them — sometimes restarting at 1 per heading, sometimes just
  // continuing (advisor-plan-reminder-progress.test.ts's fixture does the
  // latter, so numbering alone cannot tell the two families apart); its
  // nl/en prompt has no keyword headings at all, only "Week N: …" phases,
  // so translation cannot even lose that structure — there was never a
  // heading-like line in the document to lose.
  //
  // An earlier version of this decided the family by scanning the WHOLE
  // document for anything that already looks like an old-style heading, and
  // trusting the numbered outline only when nothing matched. That misfired
  // both ways: an advice.ts plan's translated body routinely contains its
  // OWN incidental colon-terminated line (as plain as "Doel:") that the scan
  // read as a heading, so a single stray line downgraded the plan's two real
  // numbered headings back into tasks (cubic P2) — and an ai-chat.ts Week-
  // phase plan has no line the scan recognises as a heading at all, so it
  // was read as headingless and its numbered steps were wrongly promoted to
  // headings instead (cubic P1). Both are the same mistake: weighing every
  // line in the document as equally good evidence.
  //
  // What actually distinguishes the families needs no vocabulary and no
  // vote-counting: advice.ts is handed its numbered template and told to
  // fill it in verbatim, never to preface it, so its plans always OPEN on
  // the numbered outline. ai-chat.ts's plans never open on a number — the
  // first line is always whatever heads its first section, keyword or Week
  // phase, translated or not. So trust only what opens the document: the
  // whole plan is treated as advice.ts's numbered outline exactly when its
  // first non-blank line is itself a top-level numbered line — nothing that
  // comes after it, on either side, gets a vote.
  const isTopLevelNumbered = (line: string) =>
    /^\d+\.\s/.test(line.trim()) && !line.startsWith("  ") && !line.startsWith("\t");
  const firstNonBlankLine = lines.find((l) => l.trim() !== "");
  const topLevelNumberedIndices = lines
    .map((l, idx) => (isTopLevelNumbered(l) ? idx : -1))
    .filter((idx) => idx !== -1);
  // A numbered line with nothing under it before the next one isn't heading a
  // section -- it's one item in a flat numbered list, the shape getSpouseAdvice
  // produced before its prompt required themed sections (still possible if the
  // model ignores that instruction, and the shape lives on in cached advice).
  // advice.ts's real outline always has body -- an intro sentence, a colon
  // sub-label, a dash bullet -- between one numbered heading and the next; a
  // flat list of tasks never does (cubic round 3).
  const everyNumberedLineHasBody = topLevelNumberedIndices.every((idx, i) => {
    const nextIdx = topLevelNumberedIndices[i + 1] ?? lines.length;
    return lines.slice(idx + 1, nextIdx).some((l) => l.trim() !== "");
  });
  // everyNumberedLineHasBody alone isn't enough: the model sometimes adds one
  // plain sentence of elaboration under a flat list's own tasks (still no
  // themed sections), and that sentence satisfies "has body" exactly the way
  // a real section's own intro sentence does -- promoting the tasks
  // themselves to headings and losing every checkbox (cubic round 5). What a
  // genuine advice.ts outline has that a flat list never does is dash-bulleted
  // sub-items under MOST of its numbered headings -- that's how advice.ts
  // actually formats a section's tasks (every row in the shape table below
  // that needs isNumberedOutline true clears a majority; the translated Dutch
  // fixture above even has one heading with no bullet at all under it and
  // still clears a majority overall).
  //
  // "at least one" (a bare .some()) is not "most": a flat list's per-item
  // elaboration is USUALLY prose, but the model sometimes dresses up ONE
  // item's elaboration as a dash bullet while leaving the rest plain, and
  // that single stray bullet was enough for a bare .some() to call the whole
  // document a numbered outline -- promoting every task in it, including the
  // ones with no bullet at all, to a heading (cubic round 7). A majority
  // can't be tipped by one outlier in either direction: one bulleted item
  // among mostly-plain ones stays a flat list; one plain item among
  // mostly-bulleted ones (the Dutch fixture's diagnosis heading) stays part
  // of an outline.
  const numberedBodyIsBulletedCount = topLevelNumberedIndices.filter((idx, i) => {
    const nextIdx = topLevelNumberedIndices[i + 1] ?? lines.length;
    return lines.slice(idx + 1, nextIdx).some((l) => /^[-•*]\s/.test(l.trim()));
  }).length;
  const mostNumberedBodiesAreBulleted =
    numberedBodyIsBulletedCount * 2 > topLevelNumberedIndices.length;
  const isNumberedOutline =
    !!firstNonBlankLine &&
    isTopLevelNumbered(firstNonBlankLine) &&
    topLevelNumberedIndices.length >= 2 &&
    everyNumberedLineHasBody &&
    mostNumberedBodiesAreBulleted;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      blocks.push({ type: "separator" });
      continue;
    }
    
    if (trimmed.includes("التربية القصيرة المدى مبنية على التربية الطويلة المدى") ||
        trimmed.includes("بدونها لن تفلح")) {
      blocks.push({ type: "warning", text: cleanMarkdown(trimmed) });
      continue;
    }
    
    const nextNonBlank = lines.slice(i + 1).find((l) => l.trim() !== "");
    if (isHeading1(trimmed, isNumberedOutline, !!nextNonBlank && isTopLevelNumbered(nextNonBlank))) {
      blocks.push({ type: "heading1", text: cleanMarkdown(trimmed) });
      continue;
    }
    
    if (
      trimmed.match(/^(?:#{3}\s+|(?:\*\*)?)(?:تمهيد|تصفية|تزكية|تربية|التعليم|التذكير|الموعظة|الزجر|العقاب|الأسبوع)/) ||
      trimmed.match(/^(?:\*\*)?(?:تمهيد|تصفية|تزكية|تربية)(?:\s*\(|:|\*\*)/) ||
      trimmed.match(/^#{3}\s/)
    ) {
      blocks.push({ type: "heading2", text: cleanMarkdown(trimmed) });
      continue;
    }
    
    if (trimmed.match(/^#{4,6}\s/) || (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length < 80)) {
      blocks.push({ type: "heading3", text: cleanMarkdown(trimmed) });
      continue;
    }
    
    if (/^\d+\.\s/.test(trimmed) && !line.startsWith("  ") && !line.startsWith("\t")) {
      const cleaned = cleanMarkdown(trimmed);
      if (isNumberedOutline || (cleaned.length < 100 && (
        cleaned.includes("تشخيص") || cleaned.includes("مهام") || cleaned.includes("الجدول") ||
        cleaned.includes("التقييم") || cleaned.includes("العلاج") ||
        isLatinSectionHeading(cleaned)
      ))) {
        blocks.push({ type: "heading1", text: cleaned });
      } else if (isCompleteTask(trimmed)) {
        blocks.push({ type: "task", text: cleaned, key: nextTaskKey(cleaned, taskOccurrences) });
      } else {
        blocks.push({ type: "paragraph", text: cleaned });
      }
      continue;
    }
    
    if (/^[-•*]\s/.test(trimmed) || /^\s+[-•*]\s/.test(line) || /^\s+\d+\.\s/.test(line)) {
      const cleaned = cleanMarkdown(trimmed);
      if (isCompleteTask(trimmed)) {
        blocks.push({ type: "task", text: cleaned, key: nextTaskKey(cleaned, taskOccurrences) });
      } else {
        blocks.push({ type: "paragraph", text: cleaned });
      }
      continue;
    }
    
    blocks.push({ type: "paragraph", text: cleanMarkdown(trimmed) });
  }
  
  return blocks;
}


/**
 * The task keys a plan's progress is measured against.
 *
 * Always pass the plan's ORIGINAL text, never a translation of it, even when a
 * translation is what is on screen. Keys are content-derived (see nextTaskKey
 * above), so a translation that reorders or drops a task still names its own
 * tasks correctly on its own -- but a translation's tasks are still a
 * different parse of different text, and mixing key spaces between the two
 * is exactly what "always the original" prevents. One key space per plan —
 * the original's — is what keeps a tick meaning the same thing in the
 * renderer, in the cached count and in the daily reminder.
 *
 * The visible consequence, accepted: a translation that drops a task leaves the
 * bar short of 100% with every visible box ticked. The plan really does have
 * more tasks than the translation shows.
 */
export function taskKeysOf(text: string): string[] {
  return parsePlanText(text)
    .filter((b) => b.type === "task")
    .map((b) => (b as { key: string }).key);
}

/**
 * Parses displayText for what's actually shown -- section headings, body
 * text, translated/transliterated task wording -- but gives every task the
 * CANONICAL key it has in canonicalText's own parse, at the same position,
 * instead of a key derived from displayText's own wording.
 *
 * Position, not content, is what's trusted across this boundary: a
 * translation can reword a task past any resemblance to the original, so
 * nothing about the translated text can be trusted to name the matching
 * canonical task -- only its place in the document can, and translation is
 * order-preserving. When displayText and canonicalText are the SAME text
 * (nothing translated or transliterated), position i's canonical key IS
 * block i's own key, so this degrades to parsePlanText exactly.
 *
 * ponytail: if canonicalText has fewer tasks than displayText at some
 * position (a translation that ADDED a task), the extra display task keeps
 * its own (displayText-derived) key rather than losing one -- it simply
 * cannot be counted by anything keyed on canonicalText. Mirrors the
 * "translation DROPS a task" ceiling taskKeysOf's own comment (and
 * components/treatment-plan-renderer.tsx's ponytail comment) already accept;
 * fixing either direction for real needs diffing displayText against
 * canonicalText task-by-task (e.g. LCS alignment) instead of trusting
 * position, worth doing only if a translator adding/dropping tasks turns out
 * to be common rather than rare.
 */
export function displayBlocks(displayText: string, canonicalText: string): ParsedBlock[] {
  const canonicalKeys = taskKeysOf(canonicalText);
  let taskIndex = 0;
  return parsePlanText(displayText).map((block) => {
    if (block.type !== "task") return block;
    const key = canonicalKeys[taskIndex] ?? block.key;
    taskIndex++;
    return { ...block, key };
  });
}

const LEGACY_TASK_KEY = /^task-(\d+)$/;

/**
 * Upgrades a plan's stored ticks from the old positional scheme (`task-0`,
 * `task-1`, …) to the current content-derived one (nextTaskKey above).
 *
 * A legacy key only ever meant "the Nth task of whatever got parsed" — so
 * translating one is exact when the plan's text has not changed since the
 * tick was made: parsing that same text now, task N of the old parse and
 * task N of this one are the same call in the same order. If the plan WAS
 * edited since the tick, the legacy key was already pointing at the wrong
 * task before this ever ran — that is the bug fixed going forward, not one
 * this function can retroactively undo.
 *
 * An already-migrated or unrecognised key is returned unchanged. A legacy
 * key with no current task at that index (a plan that lost tasks) is also
 * returned unchanged, as plain "task-N" text: it cannot equal any key
 * nextTaskKey ever produces (all "task2-…"), so it just stops counting as
 * done — the same silent drop a translation short a task already causes.
 */
export function migrateLegacyTaskKeys(storedKeys: string[], text: string): string[] {
  if (!storedKeys.some((k) => LEGACY_TASK_KEY.test(k))) return storedKeys;
  const currentKeys = taskKeysOf(text);
  return storedKeys.map((k) => {
    const m = LEGACY_TASK_KEY.exec(k);
    if (!m) return k;
    return currentKeys[Number(m[1])] ?? k;
  });
}

export interface Section {
  title: string;
  blocks: ParsedBlock[];
  taskKeys: string[];
  /** The stand-in section before the plan's first heading, not a real one. */
  synthetic?: boolean;
}

/**
 * Group blocks into collapsible sections by heading1.
 *
 * This module has no i18n access of its own (it is plain, dependency-free TS —
 * see the file header), so the fallback title before the plan's first real
 * heading is threaded in from the caller, which does. Defaults to Arabic so
 * every existing call site that omits it is unaffected.
 */
export function groupIntoSections(blocks: ParsedBlock[], language?: string): Section[] {
  const sections: Section[] = [];
  const introTitle = language === "en" ? "Introduction" : language === "nl" ? "Inleiding" : "مقدمة";
  let currentSection: Section = { title: introTitle, blocks: [], taskKeys: [], synthetic: true };
  
  for (const block of blocks) {
    if (block.type === "heading1") {
      // An empty section is still kept, because its TITLE may be the only place
      // a plan step survives: parsePlanText promotes any numbered line whose text
      // contains تشخيص / مهام / الجدول / التقييم / العلاج to a heading, so an
      // ordinary instruction like "راجع مهامك المنزلية معه" becomes one — and
      // dropping it when the next line is also a heading deleted that instruction
      // from the screen, from the progress count and from the daily reminder,
      // while the bar still read 100%.
      //
      // Only the stand-in section before the plan's first heading is dropped when
      // empty; that one is ours, not the advisor's.
      if (currentSection.blocks.length > 0 || !currentSection.synthetic) {
        sections.push(currentSection);
      }
      currentSection = { title: block.text, blocks: [], taskKeys: [] };
    } else {
      currentSection.blocks.push(block);
      if (block.type === "task") {
        currentSection.taskKeys.push(block.key);
      }
    }
  }
  // Same rule at the end: a real heading is never dropped for being empty.
  if (currentSection.blocks.length > 0 || !currentSection.synthetic) {
    sections.push(currentSection);
  }
  
  return sections;
}
