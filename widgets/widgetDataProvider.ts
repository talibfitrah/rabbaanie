import AsyncStorage from "@react-native-async-storage/async-storage";

// ============ PRAYER DATA ============

interface WidgetPrayerData {
  prayers: { name: string; nameAr: string; time: string; isNext: boolean }[];
  sunrise: string;
  nextPrayer: string;
  nextPrayerAr: string;
  nextPrayerTime: string;
  countdown: string;
  hijriDate: string;
  city: string;
}

const PRAYER_NAMES_AR: Record<string, string> = {
  fajr: "الفجر",
  sunrise: "الشروق",
  dhuhr: "الظهر",
  asr: "العصر",
  maghrib: "المغرب",
  isha: "العشاء",
};

const PRAYER_NAMES_NL: Record<string, string> = {
  fajr: "Fadjr",
  sunrise: "Shuroeq",
  dhuhr: "Dhuhr",
  asr: "3Asr",
  maghrib: "Maghrib",
  isha: "3Ishaa'",
};

const PRAYER_NAMES_EN: Record<string, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Ishaa'",
};

function getPrayerName(name: string, lang: string): string {
  if (lang === "nl") return PRAYER_NAMES_NL[name] || name;
  if (lang === "en") return PRAYER_NAMES_EN[name] || name;
  return PRAYER_NAMES_AR[name] || name;
}

export async function getWidgetPrayerData(): Promise<WidgetPrayerData> {
  try {
    const lang = await getSavedLang();
    const locationRaw = await AsyncStorage.getItem("@prayer_location");
    const location = locationRaw ? JSON.parse(locationRaw) : null;
    const cityFallback = lang === "nl" ? "Niet ingesteld" : lang === "en" ? "Not set" : "غير محدد";
    const city = location?.city || cityFallback;

    // Get cached prayer times
    const cachedTimesRaw = await AsyncStorage.getItem("@cached_prayer_times");
    const cachedTimes = cachedTimesRaw ? JSON.parse(cachedTimesRaw) : null;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const prayerOrder = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
    let prayers: WidgetPrayerData["prayers"] = [];
    let nextPrayerName = "";
    let nextPrayerTimeStr = "";
    let sunrise = "";
    let foundNext = false;

    if (cachedTimes) {
      for (const name of prayerOrder) {
        const timeStr = cachedTimes[name] || "--:--";
        const [h, m] = timeStr.split(":").map(Number);
        const prayerMinutes = h * 60 + m;
        const isNext = !foundNext && prayerMinutes > currentMinutes;
        if (isNext) {
          foundNext = true;
          nextPrayerName = name;
          nextPrayerTimeStr = timeStr;
        }
        prayers.push({
          name,
          nameAr: getPrayerName(name, lang),
          time: timeStr,
          isNext,
        });
      }
      sunrise = cachedTimes.sunrise || "--:--";
    } else {
      // Fallback
      prayers = prayerOrder.map((name) => ({
        name,
        nameAr: getPrayerName(name, lang),
        time: "--:--",
        isNext: false,
      }));
      sunrise = "--:--";
    }

    // If no next prayer found today, next is fajr tomorrow
    if (!foundNext && prayers.length > 0) {
      prayers[0].isNext = true;
      nextPrayerName = "fajr";
      nextPrayerTimeStr = prayers[0].time;
    }

    // Calculate countdown
    let countdown = "";
    if (nextPrayerTimeStr && nextPrayerTimeStr !== "--:--") {
      const [nh, nm] = nextPrayerTimeStr.split(":").map(Number);
      let diffMinutes = nh * 60 + nm - currentMinutes;
      if (diffMinutes < 0) diffMinutes += 24 * 60; // tomorrow
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      if (lang === "nl") {
        countdown = hours > 0 ? `Over ${hours} u ${mins} min` : `Over ${mins} min`;
      } else if (lang === "en") {
        countdown = hours > 0 ? `In ${hours}h ${mins}m` : `In ${mins} min`;
      } else {
        countdown = hours > 0 ? `بعد ${hours} س ${mins} د` : `بعد ${mins} دقيقة`;
      }
    }

    // Hijri date
    const hijriRaw = await AsyncStorage.getItem("@hijri_date_cache");
    const hijriDate = hijriRaw || "";

    return {
      prayers,
      sunrise,
      nextPrayer: nextPrayerName,
      nextPrayerAr: getPrayerName(nextPrayerName, lang),
      nextPrayerTime: nextPrayerTimeStr || "--:--",
      countdown,
      hijriDate,
      city,
    };
  } catch {
    return {
      prayers: [
        { name: "fajr", nameAr: "الفجر", time: "--:--", isNext: true },
        { name: "dhuhr", nameAr: "الظهر", time: "--:--", isNext: false },
        { name: "asr", nameAr: "العصر", time: "--:--", isNext: false },
        { name: "maghrib", nameAr: "المغرب", time: "--:--", isNext: false },
        { name: "isha", nameAr: "العشاء", time: "--:--", isNext: false },
      ],
      sunrise: "--:--",
      nextPrayer: "fajr",
      nextPrayerAr: "الفجر",
      nextPrayerTime: "--:--",
      countdown: "",
      hijriDate: "",
      city: "",
    };
  }
}

// ============ HIJRI DATA ============

interface WidgetHijriData {
  hijriDate: string;
  gregorianDate: string;
  dayName: string;
  event?: string;
}

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const NL_DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const NL_MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function getDayName(dayIdx: number, lang: string): string {
  if (lang === "nl") return NL_DAYS[dayIdx];
  if (lang === "en") return EN_DAYS[dayIdx];
  return AR_DAYS[dayIdx];
}
function getMonthName(monthIdx: number, lang: string): string {
  if (lang === "nl") return NL_MONTHS[monthIdx];
  if (lang === "en") return EN_MONTHS[monthIdx];
  return AR_MONTHS[monthIdx];
}
async function getSavedLang(): Promise<string> {
  try {
    const lang = await AsyncStorage.getItem("@app_language");
    return lang || "ar";
  } catch { return "ar"; }
}

export async function getWidgetHijriData(): Promise<WidgetHijriData> {
  try {
    const lang = await getSavedLang();
    const now = new Date();
    const dayName = getDayName(now.getDay(), lang);
    const gregorianDate = `${now.getDate()} ${getMonthName(now.getMonth(), lang)} ${now.getFullYear()}`;

    const hijriRaw = await AsyncStorage.getItem("@hijri_date_cache");
    const hijriDate = hijriRaw || "";

    const eventRaw = await AsyncStorage.getItem("@hijri_event_cache");
    const event = eventRaw || undefined;

    return { hijriDate, gregorianDate, dayName, event };
  } catch {
    return {
      hijriDate: "",
      gregorianDate: "",
      dayName: AR_DAYS[new Date().getDay()],
    };
  }
}

// ============ GOAL DATA ============
interface WidgetGoalData {
  goalText: string;
  childName?: string;
  category: string;
  dayName: string;
  progressText?: string; // e.g. "٣/١٦ أهداف مكتملة"
}
export async function getWidgetGoalData(): Promise<WidgetGoalData> {
  try {
    const lang = await getSavedLang();
    const now = new Date();
    const dayName = getDayName(now.getDay(), lang);
    // Try to get cached weekly goal
    const goalRaw = await AsyncStorage.getItem("@widget_daily_goal");
    // Try to get progress
    const progressRaw = await AsyncStorage.getItem("@widget_goal_progress");
    let progressText: string | undefined;
    if (progressRaw) {
      try {
        const prog = JSON.parse(progressRaw);
        if (prog.completed !== undefined && prog.total !== undefined) {
          const label = lang === "nl" ? "doelen voltooid" : lang === "en" ? "goals completed" : "أهداف مكتملة";
          progressText = `${prog.completed}/${prog.total} ${label}`;
        }
      } catch {}
    }
    const fallbackGoal = lang === "nl" ? "Open de app om het doel te bekijken" : lang === "en" ? "Open the app to view today's goal" : "افتح التطبيق لعرض هدف اليوم";
    const fallbackCategory = lang === "nl" ? "opvoeding" : lang === "en" ? "education" : "تربية";
    if (goalRaw) {
      const goal = JSON.parse(goalRaw);
      return {
        goalText: goal.text || fallbackGoal,
        childName: goal.childName,
        category: goal.category || fallbackCategory,
        dayName,
        progressText,
      };
    }
    return {
      goalText: fallbackGoal,
      category: fallbackCategory,
      dayName,
      progressText,
    };
  } catch {
    const lang2 = "ar"; // fallback
    return {
      goalText: "افتح التطبيق لعرض هدف اليوم",
      category: "تربية",
      dayName: AR_DAYS[new Date().getDay()],
    };
  }
}

// ============ TARBIYA TIP DATA ============

export interface TarbiyaTip {
  ar: string;
  nl: string;
  en: string;
}

export const TARBIYA_TIPS_I18N: TarbiyaTip[] = [
  { ar: "التربية على التوحيد أساس كل خير", nl: "Opvoeding op tawhied is de basis van al het goede", en: "Educating on tawheed is the foundation of all good" },
  { ar: "القدوة الحسنة أبلغ من ألف موعظة", nl: "Een goed voorbeeld is krachtiger dan duizend preken", en: "A good example is more powerful than a thousand sermons" },
  { ar: "الدعاء للأبناء من أعظم أسباب صلاحهم", nl: "Du3aa' voor je kinderen is de grootste oorzaak van hun welzijn", en: "Du3aa' for your children is the greatest cause of their wellbeing" },
  { ar: "التربية بالحب تفتح القلوب المغلقة", nl: "Opvoeden met liefde opent gesloten harten", en: "Educating with love opens closed hearts" },
  { ar: "الصبر على التربية عبادة عظيمة", nl: "Geduld in de opvoeding is een geweldige 3ibaadah", en: "Patience in upbringing is a great 3ibaadah" },
  { ar: "علّم ابنك الاستقامة قبل أن تعلّمه النجاح", nl: "Leer je kind istiqaamah v\u00f3\u00f3r je hem succes leert", en: "Teach your child istiqaamah before teaching him success" },
  { ar: "ربّ ابنك على مراقبة الله في السر والعلن", nl: "Voed je kind op met het besef dat Allaah hem ziet in het verborgene en openbaar", en: "Raise your child with awareness that Allaah sees him in secret and in public" },
  { ar: "التربية تبدأ من تزكية نفس المربي", nl: "Opvoeding begint bij de zuivering van de opvoeder zelf", en: "Education begins with the purification of the educator" },
  { ar: "الحوار مع الأبناء أفضل من الأوامر المباشرة", nl: "Dialoog met kinderen is beter dan directe bevelen", en: "Dialogue with children is better than direct commands" },
  { ar: "اغرس في طفلك حب القرآن منذ الصغر", nl: "Plant de liefde voor de Qur'aan in je kind vanaf jonge leeftijd", en: "Plant the love of the Qur'aan in your child from a young age" },
  { ar: "التشجيع على الخير أنفع من التوبيخ على الخطأ", nl: "Aanmoediging tot het goede is nuttiger dan berisping voor fouten", en: "Encouragement towards good is more useful than scolding for mistakes" },
  { ar: "اجعل بيتك مدرسة إيمانية لأبنائك", nl: "Maak van je huis een school van iemaan voor je kinderen", en: "Make your home a school of eemaan for your children" },
  { ar: "التربية بالقصة من أنجح الأساليب النبوية", nl: "Opvoeden met verhalen is een van de meest succesvolle profetische methoden", en: "Educating through stories is one of the most successful prophetic methods" },
  { ar: "علّم ابنك أن يسأل الله قبل أن يسأل الناس", nl: "Leer je kind om Allaah te vragen v\u00f3\u00f3r hij de mensen vraagt", en: "Teach your child to ask Allaah before asking people" },
  { ar: "الاهتمام بقلب الطفل أولى من الاهتمام بسلوكه فقط", nl: "Aandacht voor het hart van het kind is belangrijker dan alleen zijn gedrag", en: "Caring for the child's heart is more important than just his behavior" },
  { ar: "ازرع في أبنائك تعظيم الله وخشيته", nl: "Plant in je kinderen het vereren en vrezen van Allaah", en: "Plant in your children the glorification and fear of Allaah" },
  { ar: "التربية على الشكر تورث القناعة والسعادة", nl: "Opvoeden met dankbaarheid brengt tevredenheid en geluk", en: "Educating with gratitude brings contentment and happiness" },
  { ar: "اربط أبناءك بسيرة النبي ﷺ وأصحابه", nl: "Verbind je kinderen met de sierah van de Profeet \ufdfa en zijn metgezellen", en: "Connect your children with the seerah of the Prophet \ufdfa and his companions" },
  { ar: "التربية الإيمانية تحمي الأبناء من الفتن", nl: "Opvoeding in iemaan beschermt kinderen tegen fitan", en: "Education in eemaan protects children from fitan" },
  { ar: "أحسن إلى أبنائك يحسنوا إلى أبنائهم", nl: "Wees goed voor je kinderen, dan zijn zij goed voor hun kinderen", en: "Be good to your children, and they will be good to theirs" },
  { ar: "علّم طفلك أن الله يراه في كل حال", nl: "Leer je kind dat Allaah hem altijd ziet", en: "Teach your child that Allaah always sees him" },
  { ar: "التربية على الصلاة تبدأ بالقدوة لا بالإجبار", nl: "Opvoeding op de salah begint met het goede voorbeeld, niet met dwang", en: "Education on salah starts with example, not compulsion" },
  { ar: "اجعل الذكر جزءاً من يوم طفلك", nl: "Maak dhikr een deel van de dag van je kind", en: "Make dhikr a part of your child's day" },
  { ar: "التربية على الأمانة من أوائل ما يُغرس", nl: "Opvoeding op amaanah is een van de eerste dingen die geplant moeten worden", en: "Education on amaanah is one of the first things to be planted" },
  { ar: "الرفق في التربية لا يعني التساهل في الحق", nl: "Zachtheid in opvoeding betekent niet nalatigheid in de waarheid", en: "Gentleness in education does not mean negligence in truth" },
  { ar: "علّم ابنك الفرق بين الحلال والحرام مبكراً", nl: "Leer je kind vroeg het verschil tussen halaal en haraam", en: "Teach your child early the difference between halaal and haraam" },
  { ar: "التربية على بر الوالدين تبدأ من معاملتك لوالديك", nl: "Opvoeding op birr al-waalidayn begint bij hoe jij je ouders behandelt", en: "Education on birr al-waalidayn starts with how you treat your parents" },
  { ar: "اجعل وقت الطعام فرصة للتعليم والتربية", nl: "Maak van de maaltijd een kans voor onderwijs en opvoeding", en: "Make mealtime an opportunity for teaching and education" },
  { ar: "التربية على الصدق أساس كل فضيلة", nl: "Opvoeding op eerlijkheid is de basis van elke deugd", en: "Education on truthfulness is the foundation of every virtue" },
  { ar: "ادعُ لأبنائك في السجود فإنه أقرب ما يكون العبد من ربه", nl: "Maak du3aa' voor je kinderen in sudjoed, want dat is het dichtst bij je Heer", en: "Make du3aa' for your children in sujood, for it is the closest to your Lord" },
];

// Backward-compatible Arabic-only array
export const TARBIYA_TIPS: string[] = TARBIYA_TIPS_I18N.map(t => t.ar);

export function getWidgetTarbiyaTip(lang?: string): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  const tip = TARBIYA_TIPS_I18N[dayOfYear % TARBIYA_TIPS_I18N.length];
  if (lang === "nl") return tip.nl;
  if (lang === "en") return tip.en;
  return tip.ar;
}
