/**
 * Normalises plan text before rendering: strips markdown bold and, for Arabic,
 * converts Latin-script Islamic terms back to Arabic so the UI stays fully Arabic.
 * Shared by every screen that renders a treatment plan, so they clean it the same way.
 */
export function cleanTreatmentText(text: string, lang?: string): string {
  let cleaned = text.replace(/\*\*/g, "");
  // Only convert Latin Islamic terms to Arabic when language is Arabic
  if (lang === "ar" || !lang) {
    cleaned = cleaned
      .replace(/\bAllaah\b/gi, "الله")
      .replace(/\bAllah\b/gi, "الله")
      .replace(/\bMaashaa'llaah\b/gi, "ما شاء الله")
      .replace(/\bBismillaah\b/gi, "بسم الله")
      .replace(/\bSubhaanAllaah\b/gi, "سبحان الله")
      .replace(/\bIn shaa' Allaah\b/gi, "إن شاء الله")
      .replace(/\bAstaghfirullaah\b/gi, "أستغفر الله")
      .replace(/3Abd-ur-Ra'oof/gi, "عبد الرؤوف")
      .replace(/3Abduraheem/gi, "عبد الرحيم")
      .replace(/3Abdullaah/gi, "عبد الله")
      .replace(/3Abd/g, "عبد")
      .replace(/Ar-Rahmaan Ar-Raheem/gi, "الرحمن الرحيم")
      .replace(/Ar-Rahmaan/gi, "الرحمن")
      .replace(/Ar-Raheem/gi, "الرحيم");
  }
  return cleaned.trim();
}

/**
 * The language-independent form of a treatment plan's text -- for anything
 * that must agree regardless of which language the reader's UI happens to be
 * in right now: a task's stored progress key, and the identity used to match
 * a displayed (possibly translated and/or transliterated) task back to it.
 *
 * cleanTreatmentText only transliterates Latin Islamic terms under "ar" --
 * every other language leaves "Allaah" etc. as Latin script, so the SAME
 * plan cleaned for two different UI languages is two different strings.
 * Forcing "ar" here is not about Arabic specifically: "ar" is the one branch
 * that does the FULL transform, so running it again on text a caller already
 * cleaned for its own display language (any language) always lands on the
 * same result -- cleanTreatmentText's "**"-strip and its term substitutions
 * never interact (the terms contain no "**", and \b already sits on either
 * side of a bare "*"), so this composes safely with an already-cleaned input:
 * canonicalPlanText(cleanTreatmentText(text, anyLang)) === canonicalPlanText(text).
 */
export function canonicalPlanText(text: string): string {
  return cleanTreatmentText(text, "ar");
}
