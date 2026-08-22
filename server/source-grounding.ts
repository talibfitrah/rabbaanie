/**
 * Source-grounding standard — the AI must base every religious ruling,
 * claim, or citation ONLY on the passages provided in the prompt (the
 * retrieved corpus) and the Qur'an/authentic Sunnah given in-prompt — never
 * on general knowledge, the open web, or any source not provided. If the
 * provided sources don't cover the point, it must say so rather than fill
 * the gap. Practical parenting and marital guidance may still be synthesized freely.
 *
 * Deliberately does not name any specific external source (e.g. a
 * not-yet-ingested site): naming an un-ingested source in the rule text
 * would invite the model to fabricate citations "to" it. "The passages
 * provided to you" already covers the corpus, including such sources once
 * they are actually ingested.
 *
 * This is a prompt instruction, not a deterministic filter: it strongly
 * reduces but cannot 100% guarantee model compliance — the model can still
 * ignore it. A verbatim post-processing check is out of scope; keeping this
 * text identical everywhere it is used is the proportionate fix.
 *
 * One canonical copy per language. Every system prompt that can produce a
 * religious ruling/claim/citation interpolates the matching entry below
 * instead of repeating the wording, so the standard has exactly one source
 * of truth.
 */
export const SOURCE_GROUNDING_RULE = {
  ar: `قاعدة المصادر (ملزمة بلا استثناء): استند في كلِّ حكمٍ شرعيٍّ أو معلومةٍ دينيّةٍ أو استدلالٍ إلى النصوص والمقاطع المزوَّدة لك في هذا السياق وإلى ما أُعطيتَه هنا من القرآن والسنّة الصحيحة فقط. لا تستمدَّ أيَّ حكمٍ أو دعوى أو استدلالٍ دينيٍّ من معرفتك العامّة، ولا من الإنترنت، ولا من أيِّ مصدرٍ لم يُزوَّد لك. وإن لم تُغطِّ المصادرُ المزوَّدةُ المسألةَ فقل ذلك صراحةً بدلَ أن تملأ الفراغ. (أمّا التوجيهُ العمليُّ التربويُّ والزوجيُّ فلك أن تصوغه.)`,
  en: `SOURCE RULE (binding, no exceptions): Base every religious ruling, claim, or citation ONLY on the passages provided to you in this context and the Qur'an/authentic Sunnah given here. Never draw a religious ruling, claim, or citation from your general knowledge, the open internet, or any source not provided to you. If the provided sources don't cover the point, say so plainly instead of filling the gap. (Practical parenting and marital guidance you may still synthesize.)`,
  nl: `BRONREGEL (bindend, geen uitzonderingen): Baseer elke religieuze uitspraak, oordeel of onderbouwing UITSLUITEND op de passages die je in deze context zijn aangeleverd en de Koran/authentieke Soennah die hier is gegeven. Ontleen nooit een religieus oordeel, bewering of citaat aan je algemene kennis, het open internet, of een niet-aangeleverde bron. Dekt het aangeleverde materiaal het punt niet, zeg dat dan eerlijk in plaats van het gat te vullen. (Praktische opvoedkundige en huwelijksbegeleiding mag je nog steeds zelf formuleren.)`,
} as const;
