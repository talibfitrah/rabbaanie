// Pure tip-selection logic for the home screen's "today's tip" banner,
// extracted out of app/(tabs)/index.tsx's todayMainTip useMemo so it is
// unit-testable without React Native. Friday and Mon/Thu keep their
// day-of-week tips unconditionally (an Islamic-calendar fact, not a
// check-in-driven one); every other day now also looks at today's
// check-in and offers a relevant encouragement instead of the generic
// adhkaar default when the signal isn't neutral.

export type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

export interface DailyHomeTipCheckin {
  prayer?: string;
  mood?: string;
}

const LOW_MOOD_VALUES = new Set(["moe", "gestrest"]);

export function selectDailyHomeTip(params: {
  dayOfWeek: number; // Date.getDay(): 0=Sun..6=Sat
  checkin: DailyHomeTipCheckin | null | undefined;
  lang: Lang;
}): string {
  const { dayOfWeek, checkin, lang } = params;

  if (dayOfWeek === 5) {
    return tx(lang, "Vandaag is Jumu'ah — lees Soerah al-Kahf en stuur salawaat", "Today is Jumu'ah — read Surah al-Kahf and send salawaat", "اليوم جمعة — اقرأ سورة الكهف وأكثر من الصلاة على النبي ﷺ");
  }
  if (dayOfWeek === 1) {
    return tx(lang, "Maandag — soennah vasten aanbevolen", "Monday — fasting recommended", "اليوم الاثنين — صيام مستحب");
  }
  if (dayOfWeek === 4) {
    return tx(lang, "Donderdag — soennah vasten aanbevolen", "Thursday — fasting recommended", "اليوم الخميس — صيام مستحب");
  }

  const prayer = checkin?.prayer;
  if (prayer === "sommige_gemist" || prayer === "fajr_gemist") {
    return tx(
      lang,
      "Een gemist gebed is geen einde — de volgende gebedstijd is een nieuwe kans om dichter bij Allaah te komen",
      "A missed prayer isn't the end — the next prayer time is a new chance to draw closer to Allaah",
      "فوات صلاة ليس نهاية المطاف — الوقت القادم فرصة جديدة للتقرّب من الله"
    );
  }
  // "Ik werk eraan" is effort, not a miss — affirm it instead of nudging.
  if (prayer === "werk_eraan") {
    return tx(
      lang,
      "Je werkt aan je gebed — houd vol, standvastigheid groeit stap voor stap, in shaa Allaah",
      "You're working on your prayer — keep going, steadfastness grows step by step, in shaa Allaah",
      "أنت تعمل على صلاتك — واصِل، فالاستقامة تنمو خطوةً خطوة، إن شاء الله"
    );
  }

  const lowMood = !!checkin?.mood && LOW_MOOD_VALUES.has(checkin.mood);
  if (lowMood) {
    return tx(
      lang,
      "Voel je moe of gestrest? Neem een moment voor dhikr — sabr wordt beloond, in shaa Allaah",
      "Feeling tired or stressed? Take a moment for dhikr — sabr is rewarded, in shaa Allaah",
      "تشعر بالتعب أو التوتر؟ خذ لحظة للذكر — فالصبر بالأجر، إن شاء الله"
    );
  }

  return tx(lang, "Herinnering: ochtend- en avondadhkaar", "Reminder: morning and evening adhkaar", "تذكير: أذكار الصباح والمساء");
}
