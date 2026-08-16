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
  // Arabic script proper. Written as a Unicode property escape rather than a
  // hand-rolled range: the first version ended at U+FEFF, which is ZERO WIDTH
  // NO-BREAK SPACE / BOM and not an Arabic letter at all — so a genuine en/nl
  // ALL-CAPS heading carrying an invisible ZWNBSP was demoted to a task, which
  // is the exact "plan collapses into one section" failure this prevents.
  if (/\p{Script=Arabic}/u.test(head)) return false;
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

/**
 * server/ai-chat.ts's own headings (`التشخيص:`, `مهام الوالد:`, `علاج في
 * التصفية:`) carry no number, only an Arabic keyword and a trailing colon on
 * their own line. Once useAutoTranslate renders the plan in the viewer's
 * language, the keyword is gone (isArabicSectionHeading no longer matches)
 * and the heading is ordinary sentence case, not ALL-CAPS the way advice.ts's
 * own en/nl headings are (isLatinSectionHeading doesn't match either). The
 * numbered task lines underneath then look, to plan-blocks.ts's isHeading1,
 * like advice.ts's own numbered *heading* outline, and every task in the plan
 * is wrongly promoted to a heading.
 *
 * What survives translation is punctuation, not vocabulary: the heading is
 * still alone on its line and still ends in a colon. lib/plan-steps.ts's own
 * SECTION_HEADING check already relies on the same "own line, ends in a
 * colon" convention for this exact plan shape.
 *
 * Restricted to non-Arabic-script text so it never competes with
 * isArabicSectionHeading: an untranslated sub-heading like "تصفية (تصحيح عقل
 * الوالد):" must stay a heading2 nested under "مهام الوالد:", not jump to
 * heading1 just because it also ends in a colon.
 */
export function isColonTerminatedHeading(line: string): boolean {
  if (/^[-•*]\s/.test(line) || /^\d+[.)]\s/.test(line)) return false;
  const head = line.replace(/[*#_]/g, "").trim();
  if (!head.endsWith(":") || head.length === 0 || head.length >= 80) return false;
  return !/\p{Script=Arabic}/u.test(head);
}
