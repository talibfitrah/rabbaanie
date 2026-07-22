import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  calculatePrayerTimes,
  PRAYER_LOCATION_KEY,
  PRAYER_METHOD_KEY,
  CALC_METHODS,
  type SavedPrayerLocation,
} from "./prayer-data";

// ============ STORAGE KEYS ============

export const ISLAMIC_REMINDERS_PREFS_KEY = "@islamic_reminders_prefs";
const LAST_NIGHT_REMINDER_KEY = "@last_night_reminder_date";

// ============ NOTIFICATION TYPES ============

const ISTIGHFAR_TYPE = "istighfar_reminder";
const MORNING_ADHKAR_TYPE = "morning_adhkar_reminder";
const EVENING_ADHKAR_TYPE = "evening_adhkar_reminder";
const QIYAM_TYPE = "qiyam_reminder";

// ============ ANDROID CHANNEL ============

const ISLAMIC_REMINDERS_CHANNEL_ID = "islamic_reminders";

// ============ TYPES ============

export interface IslamicRemindersPrefs {
  istighfar: {
    enabled: boolean;
    hour: number;
    minute: number;
  };
  morningAdhkar: {
    enabled: boolean;
    minutesAfterFajr: number; // minutes after Fajr to send reminder
  };
  eveningAdhkar: {
    enabled: boolean;
    minutesAfterAsr: number; // minutes after Asr to send reminder
  };
  qiyamAlLayl: {
    enabled: boolean;
    useLastThird: boolean; // schedule notification at last third of night
    detectAppOpen: boolean; // show reminder when app opened at night
  };
}

export const DEFAULT_ISLAMIC_REMINDERS_PREFS: IslamicRemindersPrefs = {
  istighfar: {
    enabled: true,
    hour: 13, // 1 PM - after Dhuhr
    minute: 0,
  },
  morningAdhkar: {
    enabled: true,
    minutesAfterFajr: 10,
  },
  eveningAdhkar: {
    enabled: true,
    minutesAfterAsr: 10,
  },
  qiyamAlLayl: {
    enabled: true,
    useLastThird: true,
    detectAppOpen: true,
  },
};

// ============ ISTIGHFAR TEXTS (rotating daily) ============

export const ISTIGHFAR_TEXTS = [
  {
    text: "أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ الَّذِي لَا إِلَٰهَ إِلَّا هُوَ الْحَيَّ الْقَيُّومَ وَأَتُوبُ إِلَيْهِ",
    reward: "من قالها غُفر له وإن كان فرّ من الزحف",
    source: "رواه أبو داود والترمذي",
  },
  {
    text: "رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ",
    reward: "كان النبي ﷺ يقولها في المجلس الواحد مئة مرة",
    source: "رواه أبو داود والترمذي",
  },
  {
    text: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ",
    reward: "سيد الاستغفار، من قالها موقناً بها فمات من يومه دخل الجنة",
    source: "رواه البخاري",
  },
  {
    text: "أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ",
    reward: "كان النبي ﷺ يستغفر الله في اليوم أكثر من سبعين مرة",
    source: "رواه البخاري",
  },
  {
    text: "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا أَنْتَ، أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ",
    reward: "كفارة المجلس، من قالها في مجلس غُفر له ما كان في مجلسه",
    source: "رواه أبو داود والنسائي",
  },
  {
    text: "اللَّهُمَّ اغْفِرْ لِي ذَنْبِي كُلَّهُ، دِقَّهُ وَجِلَّهُ، وَأَوَّلَهُ وَآخِرَهُ، وَعَلَانِيَتَهُ وَسِرَّهُ",
    reward: "دعاء شامل لمغفرة جميع الذنوب",
    source: "رواه مسلم",
  },
  {
    text: "اللَّهُمَّ إِنِّي ظَلَمْتُ نَفْسِي ظُلْمًا كَثِيرًا، وَلَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ، فَاغْفِرْ لِي مَغْفِرَةً مِنْ عِنْدِكَ، وَارْحَمْنِي إِنَّكَ أَنْتَ الْغَفُورُ الرَّحِيمُ",
    reward: "علّمه النبي ﷺ لأبي بكر الصديق رضي الله عنه",
    source: "رواه البخاري ومسلم",
  },
];

// ============ QIYAM AL-LAYL DATA ============

export const QIYAM_HADITH = {
  text: "مَنْ تَعَارَّ مِنَ اللَّيْلِ فَقَالَ: لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، الْحَمْدُ لِلَّهِ وَسُبْحَانَ اللَّهِ وَلَا إِلَٰهَ إِلَّا اللَّهُ وَاللَّهُ أَكْبَرُ وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ، ثُمَّ قَالَ: اللَّهُمَّ اغْفِرْ لِي، أَوْ دَعَا، اسْتُجِيبَ لَهُ، فَإِنْ تَوَضَّأَ وَصَلَّى قُبِلَتْ صَلَاتُهُ",
  source: "رواه البخاري",
  explanation: {
    ar: "«تعارَّ» أي: استيقظ من نومه في الليل",
    nl: "«Ta'arra» betekent: 's nachts wakker worden uit de slaap",
    en: "«Ta'arra» means: to wake up from sleep at night",
  },
};

export const QIYAM_INSTRUCTIONS = {
  ar: {
    title: "كيفية قيام الليل",
    steps: [
      "1. انوِ قيام الليل قبل النوم",
      "2. توضأ وأسبغ الوضوء",
      "3. صلِّ ركعتين ركعتين (مثنى مثنى)",
      "4. اقرأ ما تيسر من القرآن في كل ركعة",
      "5. أطِل السجود وادعُ الله فيه",
      "6. اختم بركعة وتر (ركعة واحدة أو ثلاث)",
      "7. أقل قيام الليل ركعتان + وتر",
    ],
    dua: "اللَّهُمَّ لَكَ الْحَمْدُ أَنْتَ نُورُ السَّمَاوَاتِ وَالْأَرْضِ وَمَنْ فِيهِنَّ، وَلَكَ الْحَمْدُ أَنْتَ قَيِّمُ السَّمَاوَاتِ وَالْأَرْضِ وَمَنْ فِيهِنَّ",
  },
  nl: {
    title: "Hoe het nachtgebed te verrichten",
    steps: [
      "1. Neem de intentie voor het nachtgebed vóór het slapen",
      "2. Maak wudu (rituele wassing)",
      "3. Bid twee raka'aat per keer",
      "4. Reciteer wat je kunt uit de Qur'aan in elke raka'ah",
      "5. Verleng de sudjoed en maak du'a daarin",
      "6. Sluit af met witr (1 of 3 raka'aat)",
      "7. Het minimum is 2 raka'aat + witr",
    ],
    dua: "O Allaah, alle lof is voor U. U bent het Licht van de hemelen en de aarde en wie daarin zijn.",
  },
  en: {
    title: "How to perform the night prayer",
    steps: [
      "1. Make the intention for night prayer before sleeping",
      "2. Make wudu (ablution)",
      "3. Pray two rak'aat at a time",
      "4. Recite what you can from the Qur'aan in each rak'ah",
      "5. Prolong your sujood and make du'a in it",
      "6. End with witr (1 or 3 rak'aat)",
      "7. The minimum is 2 rak'aat + witr",
    ],
    dua: "O Allaah, all praise is for You. You are the Light of the heavens and the earth and all that is in them.",
  },
};

// ============ CHANNEL SETUP ============

export async function setupIslamicRemindersChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(ISLAMIC_REMINDERS_CHANNEL_ID, {
    name: "تذكيرات إسلامية / Islamic Reminders",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: "default",
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableLights: true,
    lightColor: "#1B4332",
  });
}

// ============ PREFERENCES ============

export async function loadIslamicRemindersPrefs(): Promise<IslamicRemindersPrefs> {
  try {
    const raw = await AsyncStorage.getItem(ISLAMIC_REMINDERS_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        istighfar: { ...DEFAULT_ISLAMIC_REMINDERS_PREFS.istighfar, ...parsed.istighfar },
        morningAdhkar: { ...DEFAULT_ISLAMIC_REMINDERS_PREFS.morningAdhkar, ...parsed.morningAdhkar },
        eveningAdhkar: { ...DEFAULT_ISLAMIC_REMINDERS_PREFS.eveningAdhkar, ...parsed.eveningAdhkar },
        qiyamAlLayl: { ...DEFAULT_ISLAMIC_REMINDERS_PREFS.qiyamAlLayl, ...parsed.qiyamAlLayl },
      };
    }
  } catch {}
  return { ...DEFAULT_ISLAMIC_REMINDERS_PREFS };
}

export async function saveIslamicRemindersPrefs(prefs: IslamicRemindersPrefs): Promise<void> {
  await AsyncStorage.setItem(ISLAMIC_REMINDERS_PREFS_KEY, JSON.stringify(prefs));
}

// ============ SCHEDULING ============

/**
 * Schedule all Islamic reminders for the next 7 days.
 * Cancels existing Islamic reminder notifications first (targeted).
 */
export async function scheduleIslamicReminders(
  language: "nl" | "en" | "ar" = "ar"
): Promise<number> {
  if (Platform.OS === "web") return 0;

  // Cancel existing Islamic reminder notifications
  await cancelIslamicReminders();

  const prefs = await loadIslamicRemindersPrefs();

  // Load prayer location for time-based reminders
  const locationRaw = await AsyncStorage.getItem(PRAYER_LOCATION_KEY);
  const methodRaw = await AsyncStorage.getItem(PRAYER_METHOD_KEY);

  let scheduledCount = 0;

  // --- 1. ISTIGHFAR REMINDER (daily at fixed time) ---
  if (prefs.istighfar.enabled) {
    const dayOfYear = getDayOfYear();
    const istighfarIndex = dayOfYear % ISTIGHFAR_TEXTS.length;
    const istighfar = ISTIGHFAR_TEXTS[istighfarIndex];

    const title = language === "ar"
      ? "استغفر الله"
      : language === "en"
      ? "Seek Forgiveness (Istighfaar)"
      : "Vraag om vergeving (Istighfaar)";

    const body = istighfar.text;
    const subtitle = language === "ar"
      ? istighfar.reward
      : language === "en"
      ? `Reward: ${istighfar.reward}`
      : `Beloning: ${istighfar.reward}`;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          subtitle,
          data: { type: ISTIGHFAR_TYPE, url: "/details/adhkar?type=istighfar", showPopup: true, ruling: "سنة مؤكدة" },
          ...(Platform.OS === "android" ? { channelId: ISLAMIC_REMINDERS_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
          ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: prefs.istighfar.hour,
          minute: prefs.istighfar.minute,
        },
      });
      scheduledCount++;
    } catch (err) {
      console.warn("Failed to schedule istighfar reminder:", err);
    }
  }

  // --- 2 & 3. MORNING/EVENING ADHKAR (based on prayer times) ---
  if (locationRaw && (prefs.morningAdhkar.enabled || prefs.eveningAdhkar.enabled)) {
    let location: SavedPrayerLocation;
    try {
      location = JSON.parse(locationRaw);
    } catch {
      return scheduledCount;
    }

    if (location.lat && location.lng && location.tz) {
      const methodId = methodRaw || "uoif";
      const method = CALC_METHODS.find((m) => m.id === methodId) || CALC_METHODS[0];
      const now = new Date();

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const date = new Date(now);
        date.setDate(date.getDate() + dayOffset);

        const times = calculatePrayerTimes(date, location.lat, location.lng, method, location.tz);

        // Morning Adhkar
        if (prefs.morningAdhkar.enabled) {
          const [fH, fM] = times.fajr.split(":").map(Number);
          const morningDate = createTriggerDate(date, fH, fM + prefs.morningAdhkar.minutesAfterFajr, 0, location.tz);

          if (morningDate.getTime() > now.getTime()) {
            const title = language === "ar"
              ? "أذكار الصباح"
              : language === "en"
              ? "Morning Adhkaar"
              : "Ochtend-adhkaar";

            const body = language === "ar"
              ? "حان وقت أذكار الصباح. قال ﷺ: «من قال حين يصبح وحين يمسي: سبحان الله وبحمده مئة مرة، لم يأتِ أحد يوم القيامة بأفضل مما جاء به»"
              : language === "en"
              ? "Time for morning adhkaar. The Prophet ﷺ said: 'Whoever says SubhanAllaahi wa bihamdihi 100 times in the morning, none will come on the Day of Judgment with anything better.'"
              : "Tijd voor de ochtend-adhkaar. De Profeet ﷺ zei: 'Wie SubhanAllaahi wa bihamdihi 100 keer 's ochtends zegt, niemand komt op de Dag des Oordeels met iets beters.'";

            try {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title,
                  body,
                  data: { type: MORNING_ADHKAR_TYPE, url: "/details/adhkar?type=morning", showPopup: true, ruling: "سنة مؤكدة" },
                  ...(Platform.OS === "android" ? { channelId: ISLAMIC_REMINDERS_CHANNEL_ID } : {}),
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: morningDate,
                },
              });
              scheduledCount++;
            } catch (err) {
              console.warn("Failed to schedule morning adhkar:", err);
            }
          }
        }

        // Evening Adhkar
        if (prefs.eveningAdhkar.enabled) {
          const [aH, aM] = times.asr.split(":").map(Number);
          const eveningDate = createTriggerDate(date, aH, aM + prefs.eveningAdhkar.minutesAfterAsr, 0, location.tz);

          if (eveningDate.getTime() > now.getTime()) {
            const title = language === "ar"
              ? "أذكار المساء"
              : language === "en"
              ? "Evening Adhkaar"
              : "Avond-adhkaar";

            const body = language === "ar"
              ? "حان وقت أذكار المساء. قال ﷺ: «من قال حين يمسي: بسم الله الذي لا يضر مع اسمه شيء في الأرض ولا في السماء وهو السميع العليم ثلاث مرات، لم يضره شيء»"
              : language === "en"
              ? "Time for evening adhkaar. The Prophet ﷺ said: 'Whoever says Bismillaahil-ladhi laa yadurru ma'asmihi shay'un... 3 times, nothing will harm him.'"
              : "Tijd voor de avond-adhkaar. De Profeet ﷺ zei: 'Wie Bismillaahil-ladhi laa yadurru ma'asmihi shay'un... 3 keer zegt, niets zal hem schaden.'";

            try {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title,
                  body,
                  data: { type: EVENING_ADHKAR_TYPE, url: "/details/adhkar?type=evening", showPopup: true, ruling: "سنة مؤكدة" },
                  ...(Platform.OS === "android" ? { channelId: ISLAMIC_REMINDERS_CHANNEL_ID } : {}),
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: eveningDate,
                },
              });
              scheduledCount++;
            } catch (err) {
              console.warn("Failed to schedule evening adhkar:", err);
            }
          }
        }

        // --- 4. QIYAM AL-LAYL (last third of night) ---
        if (prefs.qiyamAlLayl.enabled && prefs.qiyamAlLayl.useLastThird) {
          const [maghribH, maghribM] = times.maghrib.split(":").map(Number);
          const [fajrH, fajrM] = times.fajr.split(":").map(Number);

          // Calculate last third of night
          // Night = Maghrib to Fajr (next day if Fajr < Maghrib)
          let nightMinutes: number;
          const maghribTotal = maghribH * 60 + maghribM;
          let fajrTotal = fajrH * 60 + fajrM;
          if (fajrTotal <= maghribTotal) {
            fajrTotal += 24 * 60; // Fajr is next day
          }
          nightMinutes = fajrTotal - maghribTotal;

          // Last third starts at 2/3 of the night
          const lastThirdStart = maghribTotal + Math.floor((nightMinutes * 2) / 3);
          const lastThirdH = Math.floor(lastThirdStart / 60) % 24;
          const lastThirdM = lastThirdStart % 60;

          // For qiyam, we schedule on the NEXT day's early morning (after midnight)
          // The date for Fajr is dayOffset+1 if lastThirdH < maghribH
          const qiyamDate = createTriggerDate(
            lastThirdH < maghribH ? new Date(date.getTime() + 86400000) : date,
            lastThirdH,
            lastThirdM,
            0,
            location.tz
          );

          if (qiyamDate.getTime() > now.getTime()) {
            const title = language === "ar"
              ? "قيام الليل - الثلث الأخير"
              : language === "en"
              ? "Night Prayer - Last Third"
              : "Nachtgebed - Laatste derde";

            const body = language === "ar"
              ? `${QIYAM_HADITH.text.substring(0, 100)}...`
              : language === "en"
              ? "Whoever wakes up at night and says: Laa ilaaha illAllaah... then asks Allaah for forgiveness, he will be answered."
              : "Wie 's nachts wakker wordt en zegt: Laa ilaaha illAllaah... en dan Allaah om vergeving vraagt, wordt verhoord.";

            try {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title,
                  body,
                  data: { type: QIYAM_TYPE, url: "/qiyam", showPopup: true, ruling: "سنة مؤكدة" },
                  ...(Platform.OS === "android" ? { channelId: ISLAMIC_REMINDERS_CHANNEL_ID } : {}),
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: qiyamDate,
                },
              });
              scheduledCount++;
            } catch (err) {
              console.warn("Failed to schedule qiyam reminder:", err);
            }
          }
        }
      }
    }
  }

  return scheduledCount;
}

/**
 * Cancel all Islamic reminder notifications (targeted).
 */
export async function cancelIslamicReminders(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      const type = notif.content.data?.type;
      if (
        type === ISTIGHFAR_TYPE ||
        type === MORNING_ADHKAR_TYPE ||
        type === EVENING_ADHKAR_TYPE ||
        type === QIYAM_TYPE
      ) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch {}
}

// ============ SMART NIGHT DETECTION ============

/**
 * Check if the app is being opened during the night (between midnight and Fajr).
 * If so, and if the user hasn't been reminded today, show the qiyam reminder.
 * Returns the qiyam data if should show, null otherwise.
 */
export async function checkNightAppOpen(
  language: "nl" | "en" | "ar" = "ar"
): Promise<{
  shouldShow: boolean;
  hadith: typeof QIYAM_HADITH;
  instructions: (typeof QIYAM_INSTRUCTIONS)["ar"];
} | null> {
  const prefs = await loadIslamicRemindersPrefs();
  if (!prefs.qiyamAlLayl.enabled || !prefs.qiyamAlLayl.detectAppOpen) return null;

  // Check if we already showed today
  const lastShown = await AsyncStorage.getItem(LAST_NIGHT_REMINDER_KEY);
  const today = new Date().toDateString();
  if (lastShown === today) return null;

  // Get current time and check if it's night
  const now = new Date();
  const currentHour = now.getHours();

  // Load prayer times to determine if it's between midnight and Fajr
  const locationRaw = await AsyncStorage.getItem(PRAYER_LOCATION_KEY);
  const methodRaw = await AsyncStorage.getItem(PRAYER_METHOD_KEY);

  if (!locationRaw) {
    // Fallback: consider night as 00:00 - 05:00
    if (currentHour >= 0 && currentHour < 5) {
      await AsyncStorage.setItem(LAST_NIGHT_REMINDER_KEY, today);
      const instructions = QIYAM_INSTRUCTIONS[language] || QIYAM_INSTRUCTIONS.ar;
      return { shouldShow: true, hadith: QIYAM_HADITH, instructions };
    }
    return null;
  }

  let location: SavedPrayerLocation;
  try {
    location = JSON.parse(locationRaw);
  } catch {
    return null;
  }

  if (!location.lat || !location.lng || !location.tz) return null;

  const methodId = methodRaw || "uoif";
  const method = CALC_METHODS.find((m) => m.id === methodId) || CALC_METHODS[0];
  const times = calculatePrayerTimes(now, location.lat, location.lng, method, location.tz);

  const [fajrH] = times.fajr.split(":").map(Number);

  // Night time = after midnight (00:00) and before Fajr
  if (currentHour >= 0 && currentHour < fajrH) {
    await AsyncStorage.setItem(LAST_NIGHT_REMINDER_KEY, today);
    const instructions = QIYAM_INSTRUCTIONS[language] || QIYAM_INSTRUCTIONS.ar;
    return { shouldShow: true, hadith: QIYAM_HADITH, instructions };
  }

  return null;
}

// ============ HELPERS ============

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Create a Date object for a specific time in a given timezone.
 */
function createTriggerDate(
  baseDate: Date,
  hours: number,
  minutes: number,
  minutesBefore: number,
  timezone: string
): Date {
  let totalMinutes = hours * 60 + minutes - minutesBefore;
  let dayOffset = 0;
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
    dayOffset = -1;
  } else if (totalMinutes >= 24 * 60) {
    totalMinutes -= 24 * 60;
    dayOffset = 1;
  }

  const targetH = Math.floor(totalMinutes / 60);
  const targetM = totalMinutes % 60;

  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate() + dayOffset;

  const tempDate = new Date(year, month, day, 12, 0, 0);
  const utcStr = tempDate.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = tempDate.toLocaleString("en-US", { timeZone: timezone });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  const offsetMs = tzDate.getTime() - utcDate.getTime();

  const targetLocal = new Date(year, month, day, targetH, targetM, 0, 0);
  const targetUTC = new Date(targetLocal.getTime() - offsetMs);

  return targetUTC;
}
