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
