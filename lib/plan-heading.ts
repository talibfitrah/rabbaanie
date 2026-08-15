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
 * Arabic has no letter case, so requiring a Latin letter keeps Arabic task lines
 * from being promoted to headings.
 */
export function isLatinSectionHeading(cleaned: string): boolean {
  const head = cleaned.replace(/\(.*$/, "").trim();
  if (!/[A-Za-z]/.test(head)) return false;
  return head === head.toUpperCase();
}
