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
import { isArabicSectionHeading, isLatinSectionHeading } from "@/lib/plan-heading";

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

function isHeading1(trimmed: string): boolean {
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
  return false;
}

export function parsePlanText(text: string): ParsedBlock[] {
  if (!text) return [];
  const lines = text.split("\n");
  const blocks: ParsedBlock[] = [];
  let taskIndex = 0;
  
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
    
    if (isHeading1(trimmed)) {
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
      if (cleaned.length < 100 && (
        cleaned.includes("تشخيص") || cleaned.includes("مهام") || cleaned.includes("الجدول") ||
        cleaned.includes("التقييم") || cleaned.includes("العلاج") ||
        isLatinSectionHeading(cleaned)
      )) {
        blocks.push({ type: "heading1", text: cleaned });
      } else if (isCompleteTask(trimmed)) {
        blocks.push({ type: "task", text: cleaned, key: `task-${taskIndex++}` });
      } else {
        blocks.push({ type: "paragraph", text: cleaned });
      }
      continue;
    }
    
    if (/^[-•*]\s/.test(trimmed) || /^\s+[-•*]\s/.test(line) || /^\s+\d+\.\s/.test(line)) {
      const cleaned = cleanMarkdown(trimmed);
      if (isCompleteTask(trimmed)) {
        blocks.push({ type: "task", text: cleaned, key: `task-${taskIndex++}` });
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
 * translation is what is on screen. Keys are positional (`task-0`, `task-1`, …)
 * and carry nothing about the text, so a translation that parses to a different
 * number of tasks makes the same key mean a different task. One key space per
 * plan — the original's — is what keeps a tick meaning the same thing in the
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

export interface Section {
  title: string;
  blocks: ParsedBlock[];
  taskKeys: string[];
  /** The stand-in section before the plan's first heading, not a real one. */
  synthetic?: boolean;
}

/** Group blocks into collapsible sections by heading1. */
export function groupIntoSections(blocks: ParsedBlock[]): Section[] {
  const sections: Section[] = [];
  let currentSection: Section = { title: "مقدمة", blocks: [], taskKeys: [], synthetic: true };
  
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
