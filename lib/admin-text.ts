import { useI18n } from "./i18n";

/**
 * The admin screens were written Arabic-first with their copy inline. This is
 * the one trilingual picker they share (three of them used to carry a local
 * copy of it); data that must stay Arabic (basmala, weekday names) does not go
 * through it.
 */
export function useL3() {
  const { language } = useI18n();
  return (ar: string, nl: string, en: string) => (language === "ar" ? ar : language === "en" ? en : nl);
}
