/**
 * Iman (Faith) Notifications Service
 * Schedules muraqaba (self-monitoring), ikhlas (sincerity), khushoo (humility in prayer),
 * and tarbiya (parenting) reminders.
 * These are ADDITIONAL to the existing islamic-reminders.ts notifications.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadUnifiedNotifPrefs,
  type UnifiedNotifPrefs,
} from "./notification-settings";
import {
  MURAQABA_ADHKAR,
  IKHLAS_ADHKAR,
  KHUSHOO_ADHKAR,
  DUA_FOR_CHILDREN,
  getNotificationForCategory,
} from "./adhkar-data";
import {
  calculatePrayerTimes,
  PRAYER_LOCATION_KEY,
  PRAYER_METHOD_KEY,
  CALC_METHODS,
  type SavedPrayerLocation,
} from "./prayer-data";

// ============ NOTIFICATION TYPES ============

const MURAQABA_TYPE = "muraqaba_reminder";
const IKHLAS_TYPE = "ikhlas_reminder";
const KHUSHOO_TYPE = "khushoo_reminder";
const DUA_CHILDREN_TYPE = "dua_children_reminder";
const TARBIYA_MOMENT_TYPE = "tarbiya_moment_reminder";
const SPOUSE_MOMENT_TYPE = "spouse_moment_reminder";
const DAILY_GOAL_TYPE = "daily_goal_after_fajr";
const FRIDAY_ACCEPTANCE_TYPE = "friday_hour_acceptance";
const FRIDAY_SALAT_TYPE = "friday_salat_prophet";

// ============ ANDROID CHANNEL ============

const IMAN_CHANNEL_ID = "iman_reminders_v2";

export async function setupImanChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(IMAN_CHANNEL_ID, {
    name: "تذكيرات إيمانية / Faith Reminders",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 200, 200, 200],
    sound: "default",
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableLights: true,
    lightColor: "#C4A35A",
  });
}

// ============ SCHEDULING ============

/**
 * Schedule all iman/tarbiya notifications based on unified prefs.
 * Should be called on app launch and when settings change.
 */
export async function scheduleImanNotifications(
  language: "nl" | "en" | "ar" = "ar"
): Promise<number> {
  if (Platform.OS === "web") return 0;

  // Cancel existing iman notifications
  await cancelImanNotifications();

  const prefs = await loadUnifiedNotifPrefs();
  if (!prefs.masterEnabled) return 0;

  let scheduledCount = 0;

  // --- 1. MURAQABA (Self-Monitoring) Reminder ---
  if (prefs.iman.muraqabaEnabled) {
    const randomIndex = Math.floor(Math.random() * MURAQABA_ADHKAR.length);
    const dhikr = MURAQABA_ADHKAR[randomIndex];

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: language === "ar" ? "المراقبة - الله يراك" : language === "en" ? "Self-Monitoring - Allah Sees You" : "Zelfreflectie - Allah Ziet Je",
          body: dhikr.text,
          subtitle: dhikr.reward || "",
          data: { type: MURAQABA_TYPE, url: "/details/adhkar?type=muraqaba", ruling: "واجب", showPopup: true },
          ...(Platform.OS === "android" ? { channelId: IMAN_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.MAX, sticky: true } : {}),
          ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: prefs.iman.muraqabaHour,
          minute: prefs.iman.muraqabaMinute,
        },
      });
      scheduledCount++;
    } catch (err) {
      console.warn("Failed to schedule muraqaba reminder:", err);
    }
  }

  // --- 2. IKHLAS (Sincerity) Before Prayer ---
  if (prefs.iman.ikhlasBeforePrayer) {
    const locationRaw = await AsyncStorage.getItem(PRAYER_LOCATION_KEY);
    const methodRaw = await AsyncStorage.getItem(PRAYER_METHOD_KEY);

    if (locationRaw) {
      try {
        const location: SavedPrayerLocation = JSON.parse(locationRaw);
        if (location.lat && location.lng && location.tz) {
          const methodId = methodRaw || "uoif";
          const method = CALC_METHODS.find((m) => m.id === methodId) || CALC_METHODS[0];
          const now = new Date();

          // Schedule for next 3 days before Dhuhr (as a sample - sincerity before prayer)
          for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
            const date = new Date(now);
            date.setDate(date.getDate() + dayOffset);
            const times = calculatePrayerTimes(date, location.lat, location.lng, method, location.tz);

            const [dH, dM] = times.dhuhr.split(":").map(Number);
            const triggerDate = createTriggerDate(date, dH, dM - 5, location.tz); // 5 min before Dhuhr

            if (triggerDate.getTime() > now.getTime()) {
              const randomIkhlas = IKHLAS_ADHKAR[Math.floor(Math.random() * IKHLAS_ADHKAR.length)];
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: language === "ar" ? "الإخلاص قبل الصلاة" : language === "en" ? "Sincerity Before Prayer" : "Oprechtheid Vóór het Gebed",
                    body: randomIkhlas.text,
                    data: { type: IKHLAS_TYPE, url: "/details/adhkar?type=ikhlas", ruling: "واجب", showPopup: true },
                    ...(Platform.OS === "android" ? { channelId: IMAN_CHANNEL_ID } : {}),
                  },
                  trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date: triggerDate,
                  },
                });
                scheduledCount++;
              } catch {}
            }
          }
        }
      } catch {}
    }
  }

  // --- 3. KHUSHOO (Humility in Prayer) Reminder ---
  if (prefs.iman.khushooReminder) {
    const randomKhushoo = KHUSHOO_ADHKAR[Math.floor(Math.random() * KHUSHOO_ADHKAR.length)];
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: language === "ar" ? "الخشوع في الصلاة" : language === "en" ? "Humility in Prayer" : "Khushoo in het Gebed",
          body: randomKhushoo.text,
          subtitle: randomKhushoo.reward || "",
          data: { type: KHUSHOO_TYPE, url: "/details/adhkar?type=khushoo", ruling: "واجب", showPopup: true },
          ...(Platform.OS === "android" ? { channelId: IMAN_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.MAX, sticky: true } : {}),
          ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 12, // Before Dhuhr generally
          minute: 0,
        },
      });
      scheduledCount++;
    } catch (err) {
      console.warn("Failed to schedule khushoo reminder:", err);
    }
  }

  // --- 4. DUA FOR CHILDREN ---
  if (prefs.tarbiya.duaForChildren) {
    const randomDua = DUA_FOR_CHILDREN[Math.floor(Math.random() * DUA_FOR_CHILDREN.length)];
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: language === "ar" ? "الدعاء لأولادك" : language === "en" ? "Du'a for Your Children" : "Smeekbede voor Je Kinderen",
          body: randomDua.text,
          subtitle: randomDua.source || "",
          data: { type: DUA_CHILDREN_TYPE, url: "/details/adhkar?type=dua-children", ruling: "مستحب", showPopup: true },
          ...(Platform.OS === "android" ? { channelId: IMAN_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
          ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: prefs.tarbiya.duaForChildrenHour,
          minute: prefs.tarbiya.duaForChildrenMinute,
        },
      });
      scheduledCount++;
    } catch (err) {
      console.warn("Failed to schedule dua for children:", err);
    }
  }

  // --- 5. TARBIYA MOMENT (Daily parenting moment) ---
  if (prefs.tarbiya.dailyMomentEnabled) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: language === "ar" ? "لحظة تربوية" : language === "en" ? "Parenting Moment" : "Opvoedmoment",
          body: language === "ar"
            ? "خصص 15 دقيقة الآن لأولادك: اجلس معهم، استمع إليهم، وذكّرهم بالله."
            : language === "en"
            ? "Dedicate 15 minutes now for your children: sit with them, listen to them, and remind them of Allah."
            : "Neem nu 15 minuten voor je kinderen: zit bij hen, luister naar hen, en herinner hen aan Allah.",
          data: { type: TARBIYA_MOMENT_TYPE, url: "/(tabs)/weekly", ruling: "مستحب", showPopup: true },
          ...(Platform.OS === "android" ? { channelId: IMAN_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
          ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: prefs.tarbiya.dailyMomentHour,
          minute: prefs.tarbiya.dailyMomentMinute,
        },
      });
      scheduledCount++;
    } catch (err) {
      console.warn("Failed to schedule tarbiya moment:", err);
    }
  }

  // --- 6. SPOUSE MOMENT ---
  if (prefs.tarbiya.spouseMoment) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: language === "ar" ? "لحظة مع الزوج/ة" : language === "en" ? "Spouse Moment" : "Partnermoment",
          body: language === "ar"
            ? "خصص وقتاً لشريك حياتك الآن. تحدثا عن أولادكما وخططكما التربوية."
            : language === "en"
            ? "Take time for your spouse now. Talk about your children and your parenting plans."
            : "Neem nu tijd voor je partner. Bespreek jullie kinderen en opvoedplannen.",
          data: { type: SPOUSE_MOMENT_TYPE, url: "/(tabs)/family", ruling: "مستحب", showPopup: true },
          ...(Platform.OS === "android" ? { channelId: IMAN_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
          ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: prefs.tarbiya.spouseMomentHour,
          minute: prefs.tarbiya.spouseMomentMinute,
        },
      });
      scheduledCount++;
    } catch (err) {
      console.warn("Failed to schedule spouse moment:", err);
    }
  }

  // --- 7. FRIDAY: HOUR OF ACCEPTANCE ---
  if (prefs.weekly.hourOfAcceptanceFriday) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: language === "ar" ? "ساعة الإجابة - يوم الجمعة" : language === "en" ? "Hour of Acceptance - Friday" : "Uur van Verhoring - Vrijdag",
          body: language === "ar"
            ? "إن في الجمعة لساعة لا يوافقها عبد مسلم يسأل الله فيها خيراً إلا أعطاه إياه. ادعُ الله لأولادك!"
            : language === "en"
            ? "There is an hour on Friday when no Muslim asks Allah for good except that He gives it. Make du'a for your children!"
            : "Er is een uur op vrijdag waarin geen moslim Allah om iets goeds vraagt of Hij geeft het. Maak du'a voor je kinderen!",
          data: { type: FRIDAY_ACCEPTANCE_TYPE, url: "/details/adhkar?type=dua-children", ruling: "سنة مؤكدة", showPopup: true },
          ...(Platform.OS === "android" ? { channelId: IMAN_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
          ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: 6, // Friday
          hour: 14, // Between Asr and Maghrib typically
          minute: 30,
        },
      });
      scheduledCount++;
    } catch (err) {
      console.warn("Failed to schedule Friday acceptance hour:", err);
    }
  }

  // --- 8. FRIDAY: SALAT ON PROPHET ---
  if (prefs.weekly.salatOnProphetFriday) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: language === "ar" ? "الصلاة على النبي ﷺ" : language === "en" ? "Send Salat on the Prophet ﷺ" : "Stuur Salaat op de Profeet ﷺ",
          body: language === "ar"
            ? "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ"
            : language === "en"
            ? "Allahumma salli 'ala Muhammad wa 'ala aali Muhammad, kama sallayta 'ala Ibrahim wa 'ala aali Ibrahim, innaka Hameedun Majeed"
            : "Allahumma salli 'ala Muhammad wa 'ala aali Muhammad, kama sallayta 'ala Ibrahim wa 'ala aali Ibrahim, innaka Hameedun Majeed",
          data: { type: FRIDAY_SALAT_TYPE, ruling: "سنة مؤكدة", showPopup: true },
          ...(Platform.OS === "android" ? { channelId: IMAN_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
          ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: 6, // Friday
          hour: 10,
          minute: 0,
        },
      });
      scheduledCount++;
    } catch (err) {
      console.warn("Failed to schedule Friday salat reminder:", err);
    }
  }

  // --- 9. DAILY GOAL AFTER FAJR ---
  if (prefs.tarbiya.dailyGoalAfterFajr) {
    const locationRaw = await AsyncStorage.getItem(PRAYER_LOCATION_KEY);
    const methodRaw = await AsyncStorage.getItem(PRAYER_METHOD_KEY);

    if (locationRaw) {
      try {
        const location: SavedPrayerLocation = JSON.parse(locationRaw);
        if (location.lat && location.lng && location.tz) {
          const methodId = methodRaw || "uoif";
          const method = CALC_METHODS.find((m) => m.id === methodId) || CALC_METHODS[0];
          const now = new Date();

          // Schedule for next 3 days
          for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
            const date = new Date(now);
            date.setDate(date.getDate() + dayOffset);
            const times = calculatePrayerTimes(date, location.lat, location.lng, method, location.tz);

            const [fH, fM] = times.fajr.split(":").map(Number);
            const triggerDate = createTriggerDate(date, fH, fM + 30, location.tz); // 30 min after Fajr

            if (triggerDate.getTime() > now.getTime()) {
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: language === "ar" ? "هدف اليوم التربوي" : language === "en" ? "Today's Parenting Goal" : "Opvoeddoel van Vandaag",
                    body: language === "ar"
                      ? "ما هدفك التربوي اليوم؟ افتح التطبيق وراجع أهدافك الأسبوعية."
                      : language === "en"
                      ? "What's your parenting goal today? Open the app and review your weekly goals."
                      : "Wat is je opvoeddoel vandaag? Open de app en bekijk je weekdoelen.",
                    data: { type: DAILY_GOAL_TYPE, url: "/(tabs)/weekly", ruling: "مستحب", showPopup: true },
                    ...(Platform.OS === "android" ? { channelId: IMAN_CHANNEL_ID } : {}),
                  },
                  trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date: triggerDate,
                  },
                });
                scheduledCount++;
              } catch {}
            }
          }
        }
      } catch {}
    }
  }

  return scheduledCount;
}

/**
 * Cancel all iman/tarbiya notifications (targeted).
 */
export async function cancelImanNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  const types = [
    MURAQABA_TYPE, IKHLAS_TYPE, KHUSHOO_TYPE,
    DUA_CHILDREN_TYPE, TARBIYA_MOMENT_TYPE, SPOUSE_MOMENT_TYPE,
    DAILY_GOAL_TYPE, FRIDAY_ACCEPTANCE_TYPE, FRIDAY_SALAT_TYPE,
  ];
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      const type = notif.content.data?.type;
      if (types.includes(type as string)) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch {}
}

// ============ HELPERS ============

function createTriggerDate(
  baseDate: Date,
  hours: number,
  minutes: number,
  timezone: string
): Date {
  let totalMinutes = hours * 60 + minutes;
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

  // targetH:targetM is wall-clock in `timezone`; build as UTC wall-clock then
  // subtract the tz offset (avoids double-counting the device offset).
  const targetUTC = new Date(Date.UTC(year, month, day, targetH, targetM, 0, 0) - offsetMs);

  return targetUTC;
}
