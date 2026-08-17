/**
 * One wording for "the partner sync was refused", shared by every
 * syncWithPartner call site.
 *
 * syncWithPartner answers success:false for several causes — an ungranted
 * wife, an unconfirmed partnership, a gender that resolves on neither side,
 * and the older "no partner linked" — and the server's own `message` is
 * English only, which cannot be shown on a trilingual screen. One honest
 * wording covers all of them; the specific permission state has a home on
 * spouse-profile.
 *
 * Shared rather than repeated at each site so the guard in
 * tests/sync-refusal-visible.test.ts can anchor on this identifier instead of
 * the user-facing copy, which rewording or an i18n extraction would break
 * while the invariant it protects still held.
 */
export function syncRefusedMessage(lang: string): string {
  return lang === "ar"
    ? "تعذّرت المزامنة"
    : lang === "en"
      ? "Could not sync"
      : "Synchroniseren is niet gelukt";
}
