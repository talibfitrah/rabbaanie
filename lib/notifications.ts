import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  calculatePrayerTimes,
  PRAYER_LOCATION_KEY,
  PRAYER_METHOD_KEY,
  CALC_METHODS,
  type SavedPrayerLocation,
  type CalcMethod,
  type PrayerTimesResult,
} from "./prayer-data";
// ============ STORAGE KEYS ============

export const NOTIFICATION_PREFS_KEY = "@notification_prefs";

// ============ TYPES ============

export type AdhanSoundOption = "takbeer_1" | "takbeer_2" | "takbeer_3";
export type NatureSoundOption = "water_stream" | "birds_chirp" | "wind_gentle" | "rain_soft";

// Lead-time bounds for "remind me N minutes before prayer" — shared by the
// load-time clamp below and the stepper buttons in notification-settings.tsx.
export const MIN_MINUTES_BEFORE = 1;
export const MAX_MINUTES_BEFORE = 10;

export interface NotificationPrefs {
  enabled: boolean;
  prayers: {
    fajr: boolean;
    sunrise: boolean;
    dhuhr: boolean;
    asr: boolean;
    maghrib: boolean;
    isha: boolean;
  };
  adhkaar: {
    morning: boolean;
    evening: boolean;
  };
  minutesBefore: number; // 1-10
  adhanSound: AdhanSoundOption; // Sound for prayer notifications
  natureSound: NatureSoundOption; // Sound for other notifications (adhkaar, reminders)
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  prayers: {
    fajr: true,
    sunrise: true,
    dhuhr: true,
    asr: true,
    maghrib: true,
    isha: true,
  },
  adhkaar: {
    morning: true,
    evening: true,
  },
  minutesBefore: 5,
  adhanSound: "takbeer_1",
  natureSound: "water_stream",
};

// Sound display names for UI
export const ADHAN_SOUND_OPTIONS: { id: AdhanSoundOption; nameAr: string; nameNl: string; nameEn: string }[] = [
  { id: "takbeer_1", nameAr: "أذان مكة - التكبيرات الأربع", nameNl: "Adhan Mekka - Vier Takbeer", nameEn: "Adhan Makkah - Four Takbeer" },
  { id: "takbeer_2", nameAr: "أذان المدينة المنورة", nameNl: "Adhan Medina", nameEn: "Adhan Madinah" },
  { id: "takbeer_3", nameAr: "أذان القدس", nameNl: "Adhan Al-Quds (Jeruzalem)", nameEn: "Adhan Al-Quds (Jerusalem)" },
];

export const NATURE_SOUND_OPTIONS: { id: NatureSoundOption; nameAr: string; nameNl: string; nameEn: string }[] = [
  { id: "water_stream", nameAr: "خرير الماء", nameNl: "Stromend water", nameEn: "Water stream" },
  { id: "birds_chirp", nameAr: "زقزقة العصافير", nameNl: "Vogelgezang", nameEn: "Birds chirping" },
  { id: "wind_gentle", nameAr: "نسيم هادئ", nameNl: "Zachte wind", nameEn: "Gentle breeze" },
  { id: "rain_soft", nameAr: "قطرات المطر", nameNl: "Zachte regen", nameEn: "Soft rain" },
];

// ============ NOTIFICATION CHANNELS (Android) ============

// One immutable channel per adhan sound choice — Android never lets an
// existing channel's sound change, so switching the user's preference means
// switching which pre-created channel gets used, not editing prayer_times_v2
// (now legacy, see LEGACY_CHANNEL_IDS in notification-channels.ts). The raw
// resource filename must match the AdhanSoundOption id exactly (see the
// withAdhanSoundResources config plugin in app.config.ts).
export function prayerChannelId(sound: AdhanSoundOption): string {
  return `prayer_times_v3_${sound}`;
}
const ADHKAAR_CHANNEL_ID = "adhkaar_reminders_v2";
const WEEKLY_CHANNEL_ID = "weekly_reminders_v2";

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Promise.all(
    ADHAN_SOUND_OPTIONS.map(({ id: sound }) =>
      Notifications.setNotificationChannelAsync(prayerChannelId(sound), {
        name: `Gebedstijden / Prayer Times (${sound})`,
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableLights: true,
        lightColor: "#1B4332",
      }),
    ),
  );

  await Notifications.setNotificationChannelAsync(ADHKAAR_CHANNEL_ID, {
    name: "Adhkaar Herinneringen / Adhkaar Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableLights: true,
    lightColor: "#C4A35A",
  });

  await Notifications.setNotificationChannelAsync(WEEKLY_CHANNEL_ID, {
    name: "Weekdoelen Herinneringen / Weekly Goals Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableLights: true,
    lightColor: "#2563EB",
  });
}

// ============ PERMISSIONS ============

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

// ============ BATTERY OPTIMIZATION ============

const BATTERY_OPT_PROMPTED_KEY = "@battery_opt_prompted";

/**
 * Ask Android to exempt the app from battery optimization. This is the #1 reason
 * notifications "only work when the app is open": Doze and OEM battery managers
 * (Samsung, Xiaomi, …) cancel the app's pending alarms once it's swiped away, so
 * scheduled prayer/advice notifications never fire while it's closed. Shows the
 * system's direct allow-dialog; falls back to the battery-optimization list.
 */
export async function requestDisableBatteryOptimization(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const IntentLauncher = require("expo-intent-launcher");
    let pkg = "com.app.opvoedadvies.apk";
    try {
      const Application = require("expo-application");
      if (Application?.applicationId) pkg = Application.applicationId;
    } catch {}
    try {
      await IntentLauncher.startActivityAsync(
        "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
        { data: "package:" + pkg }
      );
    } catch {
      // Some OEMs block the direct request — open the battery-optimization list.
      await IntentLauncher.startActivityAsync(
        "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS"
      );
    }
  } catch {}
}

/**
 * Prompt the battery-optimization exemption once (first launch after install or
 * update). Flagged in AsyncStorage so it never nags; re-triggerable from the
 * permissions screen and settings.
 */
export async function maybePromptBatteryOptimization(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const done = await AsyncStorage.getItem(BATTERY_OPT_PROMPTED_KEY);
    if (done) return;
    await AsyncStorage.setItem(BATTERY_OPT_PROMPTED_KEY, "1");
    await requestDisableBatteryOptimization();
  } catch {}
}

// ============ TEST / DIAGNOSTICS ============

/**
 * Fire an immediate high-priority notification so the user can verify on-device,
 * right now, that notifications pop up (heads-up) and play a sound — without
 * waiting for a prayer time. Uses the prayer channel for the given adhanSound
 * (MAX importance + that sound specifically) so the preview matches what a
 * real prayer notification actually plays. The popup is guaranteed via
 * resolveShouldShowPopup's type === "test_reminder" special case, not by the
 * showPopup field on this notification's data payload.
 */
export async function sendTestNotification(
  language: "nl" | "en" | "ar" = "ar",
  adhanSound: AdhanSoundOption = DEFAULT_NOTIFICATION_PREFS.adhanSound,
): Promise<void> {
  if (Platform.OS === "web") return;
  const title =
    language === "ar" ? "🔔 إشعار تجريبي" : language === "en" ? "🔔 Test notification" : "🔔 Testmelding";
  const body =
    language === "ar"
      ? "إذا رأيت هذا وسمعت الصوت فالإشعارات تعمل. جرّبه أيضاً والتطبيق مغلق."
      : language === "en"
      ? "If you see and hear this, notifications work. Try it with the app closed too."
      : "Als je dit ziet en hoort, werken meldingen. Probeer het ook met de app gesloten.";
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: "test_reminder", showPopup: true, ruling: "مستحب" },
      ...(Platform.OS === "android"
        ? { channelId: prayerChannelId(adhanSound), priority: Notifications.AndroidNotificationPriority.MAX }
        : {}),
      ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
    },
    trigger: null, // immediate
  });
}

/**
 * Whether a usable prayer location is saved. Without it, prayer/iqamah/adhkaar
 * notifications schedule nothing (the schedulers return 0), so the settings
 * screen surfaces this as the likely reason "no prayer reminders arrive".
 */
export async function isPrayerLocationSet(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PRAYER_LOCATION_KEY);
    if (!raw) return false;
    const loc = JSON.parse(raw);
    return !!(loc?.lat && loc?.lng && loc?.tz);
  } catch {
    return false;
  }
}

// ============ PREFERENCES PERSISTENCE ============

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  let prefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...parsed };
    }
  } catch {}
  // Prayer reminders are obligatory: force the master flag and the 5 daily fard
  // prayers ON for EVERY user, regardless of stored prefs. Sunrise (Shurooq),
  // which is not a prayer, stays user-controlled.
  prefs.enabled = true;
  prefs.prayers = {
    ...DEFAULT_NOTIFICATION_PREFS.prayers,
    ...prefs.prayers,
    fajr: true,
    dhuhr: true,
    asr: true,
    maghrib: true,
    isha: true,
  };
  prefs.minutesBefore = Number.isFinite(prefs.minutesBefore)
    ? Math.min(MAX_MINUTES_BEFORE, Math.max(MIN_MINUTES_BEFORE, prefs.minutesBefore))
    : DEFAULT_NOTIFICATION_PREFS.minutesBefore;
  return prefs;
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
}

// ============ NOTIFICATION TEXT ============

type PrayerName = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";

const PRAYER_NAMES_NL: Record<PrayerName, string> = {
  fajr: "Fajr",
  sunrise: "Shurooq",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

const PRAYER_NAMES_EN: Record<PrayerName, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

const PRAYER_NAMES_AR: Record<PrayerName, string> = {
  fajr: "الفجر",
  sunrise: "الشروق",
  dhuhr: "الظهر",
  asr: "العصر",
  maghrib: "المغرب",
  isha: "العشاء",
};

function getNotificationContent(
  prayer: PrayerName,
  time: string,
  minutesBefore: number,
  language: "nl" | "en" | "ar"
): { title: string; body: string } {
  const name = language === "ar" ? PRAYER_NAMES_AR[prayer] : language === "en" ? PRAYER_NAMES_EN[prayer] : PRAYER_NAMES_NL[prayer];

  return {
    title: language === "ar" ? `${name} بعد ${minutesBefore} دقائق` : language === "en" ? `${name} in ${minutesBefore} min` : `${name} over ${minutesBefore} min`,
    body: language === "ar"
      ? `صلاة ${name} تبدأ في ${time}`
      : language === "en"
      ? `${name} starts at ${time}`
      : `${name} begint om ${time}`,
  };
}

function getAdhkaarContent(
  type: "morning" | "evening",
  language: "nl" | "en" | "ar"
): { title: string; body: string } {
  if (type === "morning") {
    return {
      title: language === "ar" ? "أذكار الصباح" : language === "en" ? "Morning Adhkaar" : "Ochtend-adhkaar",
      body: language === "ar"
        ? "حان وقت أذكار الصباح (بعد الفجر حتى الشروق)"
        : language === "en"
        ? "It's time for morning adhkaar (after Fajr until sunrise)"
        : "Het is tijd voor de ochtend-adhkaar (na Fajr tot zonsopgang)",
    };
  }
  return {
    title: language === "ar" ? "أذكار المساء" : language === "en" ? "Evening Adhkaar" : "Avond-adhkaar",
    body: language === "ar"
      ? "حان وقت أذكار المساء (بعد العصر حتى المغرب)"
      : language === "en"
      ? "It's time for evening adhkaar (after Asr until Maghrib)"
      : "Het is tijd voor de avond-adhkaar (na Asr tot Maghrib)",
  };
}

// ============ SCHEDULING ============

/**
 * Schedule notifications for the next 7 days based on prayer times.
 * Cancels all existing scheduled notifications first.
 */
export async function scheduleAllNotifications(
  language: "nl" | "en" | "ar" = "nl"
): Promise<number> {
  // Cancel all existing
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Load preferences
  const prefs = await loadNotificationPrefs();
  if (!prefs.enabled) return 0;

  // Load prayer location and method
  const locationRaw = await AsyncStorage.getItem(PRAYER_LOCATION_KEY);
  const methodRaw = await AsyncStorage.getItem(PRAYER_METHOD_KEY);

  if (!locationRaw) return 0;

  let location: SavedPrayerLocation;
  try {
    location = JSON.parse(locationRaw);
  } catch {
    return 0;
  }

  if (!location.lat || !location.lng || !location.tz) return 0;

  const methodId = methodRaw || "uoif";
  const method = CALC_METHODS.find((m) => m.id === methodId) || CALC_METHODS[0];

  let scheduledCount = 0;
  const now = new Date();

  // Schedule for next 7 days
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);

    const times = calculatePrayerTimes(date, location.lat, location.lng, method, location.tz);

    // Schedule prayer notifications
    const prayerKeys: PrayerName[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

    for (const prayer of prayerKeys) {
      if (!prefs.prayers[prayer]) continue;

      const timeStr = times[prayer];
      const [h, m] = timeStr.split(":").map(Number);

      // Create trigger date in the prayer's timezone
      const triggerDate = createTriggerDate(date, h, m, prefs.minutesBefore, location.tz);

      // Skip if in the past
      if (triggerDate.getTime() <= now.getTime()) continue;

      const content = getNotificationContent(prayer, timeStr, prefs.minutesBefore, language);

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: content.title,
            body: content.body,
            data: { type: "prayer", prayer, showPopup: true, ruling: "واجب" },
            ...(Platform.OS === "android" ? { channelId: prayerChannelId(prefs.adhanSound), priority: Notifications.AndroidNotificationPriority.MAX, sticky: true } : {}),
            ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
          },
        });
        scheduledCount++;
      } catch (err) {
        // Silently skip if scheduling fails for a specific time
        console.warn(`Failed to schedule ${prayer} notification:`, err);
      }
    }

    // Schedule adhkaar notifications
    if (prefs.adhkaar.morning) {
      const [fH, fM] = times.fajr.split(":").map(Number);
      // Morning adhkaar: 5 minutes after Fajr
      const morningDate = createTriggerDate(date, fH, fM + 5, 0, location.tz);

      if (morningDate.getTime() > now.getTime()) {
        const content = getAdhkaarContent("morning", language);
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: content.title,
              body: content.body,
              data: { type: "adhkaar", adhkaarType: "morning", showPopup: true, ruling: "سنة مؤكدة" },
              ...(Platform.OS === "android" ? { channelId: ADHKAAR_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
              ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: morningDate,
            },
          });
          scheduledCount++;
        } catch (err) {
          console.warn("Failed to schedule morning adhkaar:", err);
        }
      }
    }

    if (prefs.adhkaar.evening) {
      const [aH, aM] = times.asr.split(":").map(Number);
      // Evening adhkaar: at Asr time
      const eveningDate = createTriggerDate(date, aH, aM, 0, location.tz);

      if (eveningDate.getTime() > now.getTime()) {
        const content = getAdhkaarContent("evening", language);
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: content.title,
              body: content.body,
              data: { type: "adhkaar", adhkaarType: "evening", showPopup: true, ruling: "سنة مؤكدة" },
              ...(Platform.OS === "android" ? { channelId: ADHKAAR_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
              ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: eveningDate,
            },
          });
          scheduledCount++;
        } catch (err) {
          console.warn("Failed to schedule evening adhkaar:", err);
        }
      }
    }
  }

  // Re-schedule daily advice notification (it was cancelled by cancelAllScheduledNotificationsAsync)
  try {
    const { scheduleDailyAdviceNotification } = await import("./daily-advice-notification");
    await scheduleDailyAdviceNotification(language);
  } catch (_) {}

  return scheduledCount;
}

// ============ HELPERS ============

/**
 * Create a Date object for a specific time in a given timezone.
 * Converts from the prayer's local time to a UTC-based Date that the system scheduler can use.
 */
function createTriggerDate(
  baseDate: Date,
  hours: number,
  minutes: number,
  minutesBefore: number,
  timezone: string
): Date {
  // Normalize minutes overflow
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

  // Create a date string in the target timezone, then convert to UTC
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate() + dayOffset;

  // Build a local date in the target timezone
  // We need to find the UTC time that corresponds to targetH:targetM in the given timezone
  const tempDate = new Date(year, month, day, 12, 0, 0); // noon as reference

  // Get timezone offset at this date
  const utcStr = tempDate.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = tempDate.toLocaleString("en-US", { timeZone: timezone });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  const offsetMs = tzDate.getTime() - utcDate.getTime();

  // targetH:targetM is a WALL-CLOCK time in `timezone`. Build it as a UTC
  // wall-clock (Date.UTC), then subtract the tz offset to get the real UTC
  // instant. Using new Date(y,m,d,H,M) here would re-apply the DEVICE offset
  // on top of offsetMs (double-counting), firing every prayer 1-2h early for
  // any user not on UTC.
  const targetUTC = new Date(Date.UTC(year, month, day, targetH, targetM, 0, 0) - offsetMs);

  return targetUTC;
}

/**
 * Get the count of currently scheduled notifications.
 */
export async function getScheduledCount(): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.length;
}

// ============ WEEKLY GOAL REMINDERS ============

export const WEEKLY_REMINDER_PREFS_KEY = "@weekly_reminder_prefs";

export interface WeeklyReminderPrefs {
  enabled: boolean;
  dayOfWeek: number; // 1=Sunday, 2=Monday, ... 6=Friday, 7=Saturday (Expo weekday format)
  hour: number;
  minute: number;
}

export const DEFAULT_WEEKLY_REMINDER_PREFS: WeeklyReminderPrefs = {
  enabled: true,
  dayOfWeek: 6, // Friday
  hour: 18,
  minute: 0,
};

export async function loadWeeklyReminderPrefs(): Promise<WeeklyReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(WEEKLY_REMINDER_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_WEEKLY_REMINDER_PREFS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_WEEKLY_REMINDER_PREFS };
}

export async function saveWeeklyReminderPrefs(prefs: WeeklyReminderPrefs): Promise<void> {
  await AsyncStorage.setItem(WEEKLY_REMINDER_PREFS_KEY, JSON.stringify(prefs));
}

/**
 * Schedule a weekly recurring notification to remind the user about unfinished goals.
 * Uses a weekly trigger that fires on the specified day/time.
 * Includes the number of unfinished goals in the notification body.
 */
export async function scheduleWeeklyReminder(
  language: "nl" | "en" | "ar" = "nl",
  unfinishedCount?: number
): Promise<boolean> {
  // Cancel any existing weekly reminders
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === "weekly_reminder") {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const prefs = await loadWeeklyReminderPrefs();
  if (!prefs.enabled) return false;

  const title = language === "ar"
    ? "📚 تذكير الأهداف الأسبوعية"
    : language === "en"
    ? "📚 Weekly Goals Reminder"
    : "📚 Weekdoelen Herinnering";

  let body: string;
  if (unfinishedCount !== undefined && unfinishedCount > 0) {
    body = language === "ar"
      ? `لا يزال لديك ${unfinishedCount} هدفًا لم يكتمل هذا الأسبوع. افتح التطبيق لإكمالها!`
      : language === "en"
      ? `You still have ${unfinishedCount} unfinished goals this week. Open the app to complete them!`
      : `Je hebt nog ${unfinishedCount} onafgeronde doelen deze week. Open de app om ze af te ronden!`;
  } else if (unfinishedCount === 0) {
    body = language === "ar"
      ? "ما شاء الله! لقد أكملت جميع أهدافك هذا الأسبوع. بارك الله فيك!"
      : language === "en"
      ? "Maa shaa Allaah! You completed all your goals this week. Barak Allaahu fiek!"
      : "Maa shaa Allaah! Je hebt alle doelen deze week behaald. Barak Allaahu fiek!";
  } else {
    body = language === "ar"
      ? "هل أكملت أهداف التربية هذا الأسبوع؟ افتح التطبيق لمراجعة تقدمك."
      : language === "en"
      ? "Have you completed your parenting goals this week? Open the app to review your progress."
      : "Heb je je opvoedingsdoelen deze week afgerond? Open de app om je voortgang te bekijken.";
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: "weekly_reminder", url: "/(tabs)/weekly", showPopup: true, ruling: "مستحب" },
        ...(Platform.OS === "android" ? { channelId: WEEKLY_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
        ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: prefs.dayOfWeek,
        hour: prefs.hour,
        minute: prefs.minute,
      },
    });
    return true;
  } catch (err) {
    console.warn("Failed to schedule weekly reminder:", err);
    return false;
  }
}

/**
 * Get the count of unfinished weekly goals from AsyncStorage.
 * Used to provide data-aware weekly reminders.
 */
export async function getUnfinishedGoalCount(): Promise<number | undefined> {
  try {
    const progressRaw = await AsyncStorage.getItem("@weekly_progress");
    const completed: string[] = progressRaw ? JSON.parse(progressRaw) : [];
    // We estimate total goals per week as ~15 (typical: 4 tasfiyah + 5 tazkiyah + 6 tarbiyah)
    // The actual count depends on the week data, but for notification purposes we use a heuristic
    // A more precise count would require loading the weekly_advice.json which is heavy
    // Instead, count how many goals were completed this week vs a reasonable estimate
    const currentWeekGoals = completed.filter(id => {
      // Goal IDs look like: childId_yearKey_wN_category_index
      const parts = id.split("_");
      // Get the week number from the ID
      const weekPart = parts.find(p => p.startsWith("w"));
      if (!weekPart) return false;
      const weekNum = parseInt(weekPart.slice(1));
      // Check if it's roughly the current week (within 1 week)
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const currentWeek = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
      return weekNum === currentWeek;
    });
    // Estimate: if less than 15 goals completed, return remaining
    const estimatedTotal = 15;
    const remaining = Math.max(0, estimatedTotal - currentWeekGoals.length);
    return remaining;
  } catch {
    return undefined;
  }
}

// ============ INACTIVITY REMINDER (Fix #10) ============

const INACTIVITY_CHANNEL_ID = "inactivity_reminder_v2";
const LAST_OPENED_KEY = "@last_opened_at";

/**
 * Record the current time as "last opened" in AsyncStorage.
 * Called on app launch.
 */
export async function recordAppOpened(): Promise<void> {
  await AsyncStorage.setItem(LAST_OPENED_KEY, new Date().toISOString());
}

/**
 * Schedule a push notification that fires 24 hours from now.
 * If the user opens the app again before then, this will be cancelled and rescheduled.
 */
export async function scheduleInactivityReminder(
  language: "nl" | "en" | "ar" = "nl"
): Promise<void> {
  if (Platform.OS === "web") return;

  // Cancel any existing inactivity reminders
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === "inactivity_reminder") {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  // Set up Android channel if needed
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(INACTIVITY_CHANNEL_ID, {
      name: "Herinneringen / Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
  }

  const title = language === "ar"
    ? "🌟 نفتقدك!"
    : language === "en"
    ? "🌟 We miss you!"
    : "🌟 We missen je!";

  const body = language === "ar"
    ? "لم تفتح التطبيق منذ يوم. تعال وراجع أهدافك التربوية وأذكارك."
    : language === "en"
    ? "You haven't opened the app in a day. Come check your parenting goals and adhkaar."
    : "Je hebt de app al een dag niet geopend. Kom je opvoedingsdoelen en adhkaar bekijken.";

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: "inactivity_reminder", url: "/(tabs)", showPopup: true, ruling: "مستحب" },
        ...(Platform.OS === "android" ? { channelId: INACTIVITY_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
        ...(Platform.OS === "ios" ? { interruptionLevel: "active" as const } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 24 * 60 * 60, // 24 hours
        repeats: false,
      },
    });
  } catch (err) {
    console.warn("Failed to schedule inactivity reminder:", err);
  }
}

// ============ 3-DAY INCOMPLETE GOALS REMINDER ============

const GOALS_INCOMPLETE_TYPE = "goals_incomplete_3days";
const GOALS_INCOMPLETE_CHANNEL_ID = "goals_incomplete_v2";
const LAST_GOAL_COMPLETED_KEY = "@last_goal_completed_at";

/**
 * Record that the user completed a goal today.
 * Call this whenever a weekly goal is marked as completed.
 */
export async function recordGoalCompleted(): Promise<void> {
  await AsyncStorage.setItem(LAST_GOAL_COMPLETED_KEY, new Date().toISOString());
}

/**
 * Schedule a notification that fires after 3 days of no goal completion.
 * If the user completes a goal, call recordGoalCompleted() which will reset the timer.
 * This function should be called on app launch and after each goal completion.
 */
export async function scheduleGoalsIncompleteReminder(
  language: "nl" | "en" | "ar" = "nl"
): Promise<void> {
  if (Platform.OS === "web") return;

  // Cancel any existing goals incomplete reminders
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === GOALS_INCOMPLETE_TYPE) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  // Check when the last goal was completed
  const lastCompletedRaw = await AsyncStorage.getItem(LAST_GOAL_COMPLETED_KEY);
  const lastCompleted = lastCompletedRaw ? new Date(lastCompletedRaw) : null;

  // If no goal was ever completed, schedule from now (3 days)
  // If a goal was completed, schedule 3 days from that date
  let secondsUntilReminder: number;

  if (lastCompleted) {
    const threeDaysAfterLast = new Date(lastCompleted.getTime() + 3 * 24 * 60 * 60 * 1000);
    const now = new Date();
    
    if (threeDaysAfterLast <= now) {
      // Already past 3 days - schedule for 1 hour from now to give user a chance
      secondsUntilReminder = 60 * 60; // 1 hour
    } else {
      secondsUntilReminder = Math.ceil((threeDaysAfterLast.getTime() - now.getTime()) / 1000);
    }
  } else {
    // No goal ever completed - schedule 3 days from now
    secondsUntilReminder = 3 * 24 * 60 * 60;
  }

  // Also check if there are actually unfinished goals
  const unfinished = await getUnfinishedGoalCount();
  if (unfinished === 0 || unfinished === undefined) {
    // All goals completed or can't determine - no need for reminder
    return;
  }

  // Set up Android channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(GOALS_INCOMPLETE_CHANNEL_ID, {
      name: "تذكير الأهداف / Goals Reminder",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
  }

  const title = language === "ar"
    ? "📋 أهدافك الأسبوعية تنتظرك"
    : language === "en"
    ? "📋 Your weekly goals are waiting"
    : "📋 Je weekdoelen wachten op je";

  const body = language === "ar"
    ? `لم تكمل أهدافك منذ 3 أيام. لديك ${unfinished} أهداف متبقية هذا الأسبوع. اضغط هنا للمتابعة.`
    : language === "en"
    ? `You haven't completed any goals in 3 days. You have ${unfinished} goals remaining this week. Tap to continue.`
    : `Je hebt al 3 dagen geen doelen afgerond. Je hebt nog ${unfinished} doelen deze week. Tik om verder te gaan.`;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: GOALS_INCOMPLETE_TYPE, url: "/(tabs)/weekly", showPopup: true, ruling: "مستحب" },
        ...(Platform.OS === "android" ? { channelId: GOALS_INCOMPLETE_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
        ...(Platform.OS === "ios" ? { interruptionLevel: "active" as const } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntilReminder,
        repeats: false,
      },
    });
  } catch (err) {
    console.warn("Failed to schedule goals incomplete reminder:", err);
  }
}

/**
 * Cancel the goals incomplete reminder.
 * Call this when the user completes all goals for the week.
 */
export async function cancelGoalsIncompleteReminder(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.content.data?.type === GOALS_INCOMPLETE_TYPE) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch {}
}
