import AsyncStorage from "@react-native-async-storage/async-storage";
import { MORNING_ADHKAR, EVENING_ADHKAR, SLEEP_ADHKAR } from "@/lib/adhkar-data";

const LANGUAGE_STORAGE_KEY = "@app_language";

// Adhkar for widget rotation
export interface DhikrItem {
  text: string;
  source: string;
  reward?: string;
  context?: string;
}

// ============ STORAGE KEYS ============
const DHIKR_INDEX_KEY = "@widget_dhikr_index";
const TIP_INDEX_KEY = "@widget_tip_index";
const DHIKR_CACHE_KEY = "@widget_dhikr_cache";
const PERSONAL_TIPS_KEY = "@widget_personal_tips";

// ============ TIME-CONTEXT MAPPING ============

/**
 * Maps the current time of day to the appropriate adhkar context.
 * Uses cached prayer times to determine boundaries.
 */
export function getTimeContext(currentHour: number, prayerTimes?: Record<string, string>): string {
  if (prayerTimes) {
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const nowMin = currentHour * 60 + new Date().getMinutes();

    const fajr = prayerTimes.fajr ? toMin(prayerTimes.fajr) : 300;
    const sunrise = prayerTimes.sunrise ? toMin(prayerTimes.sunrise) : 390;
    const dhuhr = prayerTimes.dhuhr ? toMin(prayerTimes.dhuhr) : 720;
    const asr = prayerTimes.asr ? toMin(prayerTimes.asr) : 900;
    const maghrib = prayerTimes.maghrib ? toMin(prayerTimes.maghrib) : 1110;
    const isha = prayerTimes.isha ? toMin(prayerTimes.isha) : 1170;

    if (nowMin >= isha + 60 || nowMin < fajr - 30) return "أذكار_النوم";
    if (nowMin >= fajr - 30 && nowMin < fajr) return "أذكار_الصباح";
    if (nowMin >= fajr && nowMin < sunrise + 30) return "أذكار_الصباح";
    if (nowMin >= dhuhr && nowMin < dhuhr + 30) return "أذكار_بعد_الصلاة";
    if (nowMin >= asr && nowMin < asr + 30) return "أذكار_بعد_الصلاة";
    if (nowMin >= maghrib && nowMin < maghrib + 30) return "أذكار_بعد_الصلاة";
    if (nowMin >= isha && nowMin < isha + 30) return "أذكار_بعد_الصلاة";
    if (nowMin >= asr && nowMin < maghrib) return "أذكار_المساء";
    if (nowMin >= sunrise && nowMin < asr) return "أذكار_عامة";
    if (nowMin >= maghrib && nowMin < isha) return "أذكار_المساء";

    return "أذكار_عامة";
  }

  if (currentHour >= 4 && currentHour < 7) return "أذكار_الصباح";
  if (currentHour >= 7 && currentHour < 15) return "أذكار_عامة";
  if (currentHour >= 15 && currentHour < 19) return "أذكار_المساء";
  if (currentHour >= 19 && currentHour < 22) return "أذكار_المساء";
  return "أذكار_النوم";
}

/**
 * Get a human-readable label for the current dhikr context
 */
export function getContextLabel(context: string, lang?: string): string {
  if (lang === "nl") {
    const labels: Record<string, string> = {
      "أذكار_الصباح": "Ochtend adhkaar ☀️",
      "أذكار_المساء": "Avond adhkaar 🌙",
      "أذكار_النوم": "Slaap adhkaar 🌜",
      "أذكار_بعد_الصلاة": "Na het gebed 🕌",
      "أذكار_عامة": "Adhkaar & smeekbeden 📿",
    };
    return labels[context] || "Adhkaar 📿";
  }
  if (lang === "en") {
    const labels: Record<string, string> = {
      "أذكار_الصباح": "Morning adhkaar ☀️",
      "أذكار_المساء": "Evening adhkaar 🌙",
      "أذكار_النوم": "Sleep adhkaar 🌜",
      "أذكار_بعد_الصلاة": "After prayer 🕌",
      "أذكار_عامة": "Adhkaar & supplications 📿",
    };
    return labels[context] || "Adhkaar 📿";
  }
  const labels: Record<string, string> = {
    "أذكار_الصباح": "أذكار الصباح ☀️",
    "أذكار_المساء": "أذكار المساء 🌙",
    "أذكار_النوم": "أذكار النوم 🌜",
    "أذكار_بعد_الصلاة": "أذكار بعد الصلاة 🕌",
    "أذكار_عامة": "أذكار وأدعية 📿",
  };
  return labels[context] || "أذكار 📿";
}

// ============ STATIC FALLBACK ADHKAR ============

const FALLBACK_ADHKAR: DhikrItem[] = [
  { text: "سبحان الله وبحمده، سبحان الله العظيم", source: "متفق عليه", reward: "كلمتان حبيبتان إلى الرحمن" },
  { text: "لا حول ولا قوة إلا بالله", source: "متفق عليه", reward: "كنز من كنوز الجنة" },
  { text: "سبحان الله، والحمد لله، ولا إله إلا الله، والله أكبر", source: "مسلم", reward: "أحب الكلام إلى الله" },
  { text: "لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير", source: "متفق عليه", reward: "من قالها 100 مرة كانت له عدل عشر رقاب" },
  { text: "أستغفر الله العظيم الذي لا إله إلا هو الحي القيوم وأتوب إليه", source: "أبو داود والترمذي", reward: "غُفر له وإن كان فارًّا من الزحف" },
  { text: "اللهم صلِّ وسلم على نبينا محمد", source: "مسلم", reward: "من صلى عليّ صلاة واحدة صلى الله عليه بها عشرًا" },
  { text: "سبحان الله وبحمده عدد خلقه ورضا نفسه وزنة عرشه ومداد كلماته", source: "مسلم", reward: "تعدل أضعاف ما قال من التسبيح" },
  { text: "حسبي الله لا إله إلا هو عليه توكلت وهو رب العرش العظيم", source: "أبو داود", reward: "من قالها 7 مرات كفاه الله ما أهمه" },
  { text: "يا حي يا قيوم برحمتك أستغيث أصلح لي شأني كله ولا تكلني إلى نفسي طرفة عين", source: "الحاكم" },
  { text: "لا إله إلا أنت سبحانك إني كنت من الظالمين", source: "الترمذي", reward: "دعوة ذي النون، لم يدعُ بها مسلم إلا استجاب الله له" },
  { text: "رضيت بالله ربًّا وبالإسلام دينًا وبمحمد ﷺ نبيًّا ورسولًا", source: "أبو داود", reward: "من قالها حين يصبح ويمسي وجبت له الجنة" },
];

// ============ CONTEXT-BASED ADHKAR FROM lib/adhkar-data.ts ============

/**
 * Get ALL adhkar for the current time context from the comprehensive adhkar database.
 * Returns the full list for the current period (morning/evening/sleep).
 */
export function getAllDhikrForContext(context: string, lang?: string): DhikrItem[] {
  const mapDhikr = (d: any, ctx: string): DhikrItem => {
    let text = d.text;
    let reward = d.reward;
    if (lang === "nl") {
      // Show translit + Dutch translation if available
      text = d.translit ? `${d.text}\n\n${d.translit}` : d.text;
      if (d.textNL) text += `\n\n${d.textNL}`;
      reward = d.rewardNL || d.reward;
    } else if (lang === "en") {
      text = d.translit ? `${d.text}\n\n${d.translit}` : d.text;
      if (d.textEN) text += `\n\n${d.textEN}`;
      reward = d.rewardEN || d.reward;
    }
    return { text, source: d.source || "", reward, context: ctx };
  };

  switch (context) {
    case "أذكار_الصباح":
      return MORNING_ADHKAR.map(d => mapDhikr(d, "أذكار_الصباح"));
    case "أذكار_المساء":
      return EVENING_ADHKAR.map(d => mapDhikr(d, "أذكار_المساء"));
    case "أذكار_النوم":
      return SLEEP_ADHKAR.map(d => mapDhikr(d, "أذكار_النوم"));
    default:
      return FALLBACK_ADHKAR;
  }
}

/**
 * Get total count of adhkar for the current context
 */
export function getDhikrCount(context: string): number {
  return getAllDhikrForContext(context).length;
}

// ============ INDEX MANAGEMENT ============

/**
 * Get current dhikr index from storage
 */
export async function getDhikrIndex(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(DHIKR_INDEX_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch { return 0; }
}

/**
 * Save dhikr index to storage
 */
export async function saveDhikrIndex(index: number): Promise<void> {
  try {
    await AsyncStorage.setItem(DHIKR_INDEX_KEY, String(index));
  } catch {}
}

/**
 * Get current tip index from storage
 */
export async function getTipIndex(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(TIP_INDEX_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch { return 0; }
}

/**
 * Save tip index to storage
 */
export async function saveTipIndex(index: number): Promise<void> {
  try {
    await AsyncStorage.setItem(TIP_INDEX_KEY, String(index));
  } catch {}
}

// ============ PERSONAL TIPS ============

/**
 * Get personal tips cached from the app (generated by personal-advice logic)
 */
export async function getPersonalTips(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PERSONAL_TIPS_KEY);
    if (raw) {
      const tips = JSON.parse(raw);
      if (Array.isArray(tips) && tips.length > 0) return tips;
    }
  } catch {}
  // Fallback to generic tarbiya tips
  return [];
}

/**
 * Cache personal tips for widget use (called from the app)
 */
export async function cachePersonalTips(tips: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PERSONAL_TIPS_KEY, JSON.stringify(tips));
  } catch {}
}

// ============ PUBLIC API ============

/**
 * Get dhikr at a specific index for the current time context.
 * Used by widget browsing (NEXT_DHIKR / PREV_DHIKR actions).
 */
export async function getDhikrAtIndex(index: number): Promise<{ dhikr: DhikrItem; context: string; contextLabel: string; index: number; total: number }> {
  const now = new Date();
  const currentHour = now.getHours();

  // Get user language
  let lang: string = "ar";
  try {
    const savedLang = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (savedLang) lang = savedLang;
  } catch {}

  let userContextMode: "auto" | "manual" = "auto";
  let userFixedContext = "أذكار_الصباح";
  try {
    const settingsRaw = await AsyncStorage.getItem("@widget_settings_v2");
    if (settingsRaw) {
      const settings = JSON.parse(settingsRaw);
      if (settings.content?.dhikrContextMode) userContextMode = settings.content.dhikrContextMode;
      if (settings.content?.dhikrFixedContext) userFixedContext = settings.content.dhikrFixedContext;
    }
  } catch {}

  let context: string;
  if (userContextMode === "manual") {
    context = userFixedContext;
  } else {
    let prayerTimes: Record<string, string> | undefined;
    try {
      const raw = await AsyncStorage.getItem("@cached_prayer_times");
      if (raw) prayerTimes = JSON.parse(raw);
    } catch {}
    context = getTimeContext(currentHour, prayerTimes);
  }
  const contextLabel = getContextLabel(context, lang);

  const allDhikr = getAllDhikrForContext(context, lang);
  const total = allDhikr.length;
  const safeIndex = ((index % total) + total) % total; // Wrap around
  const dhikr = allDhikr[safeIndex];

  return { dhikr, context, contextLabel, index: safeIndex, total };
}

/**
 * Get dhikr for the current time context (original API - backward compatible).
 */
export async function getDhikrForTimeAsync(): Promise<{ dhikr: DhikrItem; context: string; contextLabel: string; index: number; total: number }> {
  const currentIndex = await getDhikrIndex();
  return getDhikrAtIndex(currentIndex);
}

/**
 * Synchronous version for widget rendering (uses static fallback)
 */
export function getDhikrForTime(index?: number): DhikrItem {
  const i = index !== undefined ? index % FALLBACK_ADHKAR.length : Math.floor(Date.now() / (10 * 60 * 1000)) % FALLBACK_ADHKAR.length;
  return FALLBACK_ADHKAR[i];
}

/**
 * Cache adhkar from the database for widget use.
 */
export async function cacheDhikrForWidget(items: DhikrItem[], context: string): Promise<void> {
  try {
    const cached: CachedDhikr = { items, context, cachedAt: Date.now() };
    await AsyncStorage.setItem(DHIKR_CACHE_KEY, JSON.stringify(cached));
  } catch {}
}

interface CachedDhikr {
  items: DhikrItem[];
  context: string;
  cachedAt: number;
}

/**
 * Map database context_code to widget context
 */
export function mapDbContextToWidgetContext(dbContext: string): string {
  const mapping: Record<string, string> = {
    "أذكار الصباح": "أذكار_الصباح",
    "أذكار المساء": "أذكار_المساء",
    "أذكار النوم": "أذكار_النوم",
    "أذكار بعد الصلاة": "أذكار_بعد_الصلاة",
    "أذكار الاستيقاظ": "أذكار_الصباح",
    "دعاء دخول المسجد": "أذكار_بعد_الصلاة",
    "دعاء الخروج من المسجد": "أذكار_بعد_الصلاة",
  };
  return mapping[dbContext] || "أذكار_عامة";
}
