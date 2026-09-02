/**
 * One wording per way "the partner sync was refused", shared by every
 * syncWithPartner call site.
 *
 * syncWithPartner answers success:false with an English-only `message` naming
 * the cause; these are its four designed refusals rendered for a trilingual
 * screen. Anything else — an unknown message, or a call site that has none —
 * keeps the generic wording, so a new server refusal degrades to "could not
 * sync" rather than to silence.
 *
 * Shared rather than repeated at each site so the guard in
 * tests/sync-refusal-visible.test.ts can anchor on this identifier instead of
 * the user-facing copy, which rewording or an i18n extraction would break
 * while the invariant it protects still held.
 */
const REFUSALS: Record<string, [nl: string, en: string, ar: string]> = {
  "No partner linked": ["Geen partner gekoppeld", "No partner linked", "لا يوجد شريك مرتبط"],
  "No permission to sync partner data yet": [
    "Nog geen toegang tot partnergegevens",
    "No access to partner data yet",
    "لا صلاحية لمزامنة بيانات الشريك بعد",
  ],
  "Multiple partners linked, specify which one": [
    "Meerdere partners gekoppeld — synchroniseer via het tabblad Gezin",
    "Multiple partners linked — sync from the Family tab",
    "عدة شركاء مرتبطون — زامِن من تبويب العائلة",
  ],
  "No data to sync": ["Niets om te synchroniseren", "Nothing to sync", "لا يوجد ما يُزامَن"],
};
export const REFUSAL_MESSAGES = Object.keys(REFUSALS);

export function syncRefusedMessage(lang: string, message?: string): string {
  // Array.isArray, not truthiness: a message equal to an Object.prototype key
  // ("constructor") would otherwise destructure a function and throw.
  const hit = message ? REFUSALS[message] : undefined;
  const [nl, en, ar] = Array.isArray(hit) ? hit : [
    "Synchroniseren is niet gelukt",
    "Could not sync",
    "تعذّرت المزامنة",
  ];
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}
