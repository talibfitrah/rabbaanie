/**
 * The Arabic plan marks its section headers with keywords the parser knows, but the
 * en/nl plans emit theirs as plain numbered ALL-CAPS lines
 * ("2. WHAT MUST THE PARENT CHANGE FIRST?"). Those match no Arabic keyword, so
 * without this they are treated as tasks and the whole plan collapses into a single
 * section titled "مقدمة".
 *
 * Takes the line with its leading number already stripped. A trailing parenthetical
 * is ignored, since those stay lower-case
 * ("TREATMENT PLAN - TASFIYA (correcting child's mind)").
 *
 * Arabic has no letter case, so requiring a Latin letter is NOT enough on its
 * own: "راقب استخدام TV يوميًا" contains Latin letters that are already capitals,
 * and toUpperCase() is the identity on the Arabic around them, so the line
 * passed both checks and was filed as a heading. The step then vanished from
 * the checklist and from its section's completed/total count. Parents write
 * these constantly — TV, PC, AI, SMS.
 *
 * So the line must be Latin-script THROUGHOUT, not merely contain a Latin
 * letter. An en/nl heading is; an Arabic task carrying an acronym is not.
 */
export function isLatinSectionHeading(cleaned: string): boolean {
  const head = cleaned.replace(/\(.*$/, "").trim();
  if (!/[A-Za-z]/.test(head)) return false;
  // Arabic block, including the presentation forms the advisor sometimes emits.
  if (/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(head)) return false;
  return head === head.toUpperCase();
}

/**
 * A standalone Arabic section title, written without a number or a "#".
 *
 * "الجدول" belongs here as much as the rest: the advisor closes every plan with
 * "الجدول الزمني والتقييم:", and while the numbered form was already recognised,
 * the plain one was not — so the timeline was absorbed into the child's tasks.
 */
export function isArabicSectionHeading(title: string): boolean {
  // The advisor bolds its headings often, and "**علاج في التزكية:**" neither
  // starts with the keyword nor ends with the colon. Stripping the markdown here
  // means every caller is right about it, rather than each having to remember.
  const head = title.replace(/[*#_]/g, "").trim();
  if (!/^(التشخيص|تشخيص|علاج ?في|مهام|الجدول)/.test(head)) return false;
  return head.endsWith(":") || head.endsWith("،") || head.length < 40;
}
