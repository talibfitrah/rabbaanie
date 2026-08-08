import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useI18n } from "@/lib/i18n";

import { authedFetch } from "@/lib/authed-fetch";
function isArabicText(t?: string | null): boolean {
  return !!t && /[؀-ۿ]/.test(t);
}
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Auto-translate free-text content into the VIEWER's chosen language when it was
 * authored in another one (e.g. a father's Arabic advisor consultation viewed by
 * a Dutch-speaking mother). Result is cached in AsyncStorage per (text, language);
 * on failure the original text is kept. Mirrors the treatment-plan behaviour so
 * shared content always displays in the reader's language (Daa3iyah msg 501/508).
 */
export function useAutoTranslate(text: string) {
  const { language } = useI18n();
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [translating, setTranslating] = useState(false);
  const isAr = isArabicText(text);
  const needsTranslation = (isAr && language !== "ar") || (!isAr && language === "ar");

  useEffect(() => {
    let alive = true;
    setTranslated(null);
    setShowOriginal(false);
    if (!needsTranslation || !text || !text.trim()) return;
    const key = `@tr_${language}_${hashStr(text)}`;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(key);
        if (cached) { if (alive) setTranslated(cached); return; }
        if (alive) setTranslating(true);
        const res = await authedFetch(`/api/advice/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, targetLang: language }),
        });
        const data = await res.json();
        const tr = (data?.translation || "").trim();
        if (tr) { await AsyncStorage.setItem(key, tr); if (alive) setTranslated(tr); }
      } catch { /* keep original on failure */ }
      finally { if (alive) setTranslating(false); }
    })();
    return () => { alive = false; };
  }, [text, language, needsTranslation]);

  const effectiveText = (!showOriginal && translated) ? translated : text;
  return { effectiveText, translating, translated, showOriginal, setShowOriginal, needsTranslation, language };
}
