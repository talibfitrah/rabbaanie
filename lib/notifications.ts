import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { timezoneOffsetMs } from "@/lib/tz-offset";
import {
  calculatePrayerTimes,
  PRAYER_LOCATION_KEY,
  PRAYER_METHOD_KEY,
  CALC_METHODS,
  type SavedPrayerLocation,
  type CalcMethod,
  type PrayerTimesResult,
} from "./prayer-data";
import { ADHAN_SOUND_IDS } from "./adhan-sound-ids.js";
import { scheduleDays } from "./notification-horizons";
import { enqueue } from "./notification-queue";

/*
 * WHICH notifications may set interruptionLevel: "timeSensitive" — and why most
 * of this app's may not.
 *
 * The entitlement (com.apple.developer.usernotifications.time-sensitive, granted
 * in app.config.ts) has to be justified to Apple when the capability is enabled
 * on the App ID, and review looks at how it is actually used. Apple's bar is
 * information that requires immediate attention. A sweep once applied the level
 * to all 17 notification sites in this app; 12 of them were habit nudges with no
 * time window at all — daily advice, spouse advice, seven iman/tarbiya
 * reminders, daily istighfar, the weekly reminder and the weekly-goal reminder.
 * "Take 15 minutes for your children now" piercing Do Not Disturb is exactly the
 * pattern that gets the capability questioned, and the justification is one
 * claim for the whole app: over-claim on the nudges and the prayer case goes
 * with it.
 *
 * So the level is scoped to what a prayer app can defend, all of it anchored to
 * a real clock:
 *
 *   lib/notifications.ts   prayer reminder (fard, ruling واجب), the adhan test
 *                          notification, morning and evening adhkaar
 *   lib/iqamah-silence.ts  the iqamah reminder
 *
 * Everything else keeps its `sound` and drops to the default level. Note the
 * shape when editing: `sound` and `interruptionLevel` travel together in one
 * iOS spread, and dropping the whole spread would take the sound with it — that
 * is the silent-iOS-notification bug tests/adhan-ios-sound.test.ts exists to
 * catch. Remove the level, keep the sound.
 */
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

/**
 * The bundled CAF that iOS plays for a given adhan choice. iOS takes its sound
 * from the notification CONTENT — channels are an Android-only concept and
 * `trigger.channelId` is ignored there — so while the channel above is all
 * Android needs, iOS needs this on every request or it gets nothing. It really
 * is nothing, not a fallback chime: expo-notifications only assigns
 * `content.sound` inside an `if let sound = sound` guard, so an absent field
 * leaves UNNotificationContent.sound nil, and nil means silence.
 *
 * Basename only — `UNNotificationSound(named:)` resolves it against the app
 * bundle, where the expo-notifications plugin puts the files it collects by
 * mapping over ADHAN_SOUND_IDS. Both halves derive from the same id, so they
 * cannot drift.
 *
 * `.caf` because UNNotificationSound rejects `.mp3` outright; the MP3s stay put
 * for the Android res/raw copy that withAdhanSoundResources makes. Adding a
 * 4th sound therefore means shipping a CAF too, and keeping it under iOS's
 * 30-second ceiling — past that iOS silently substitutes the default sound.
 * takbeer_2 and takbeer_3 are trimmed to 29.9s for exactly that reason.
 */
function adhanSoundFile(sound: AdhanSoundOption): string {
  // The stored preference is NOT validated on the way in: loadNotificationPrefs
  // clamps minutesBefore but spreads whatever else is in @notification_prefs
  // over the defaults, so an id that has since been renamed or removed arrives
  // here as a string that no longer resolves in the bundle. UNNotificationSound
  // does not throw on a name it cannot find — iOS silently plays nothing, which
  // is the exact failure this whole change exists to eliminate, and the one
  // failure mode with no log to find it by. An unknown id falls back to the
  // default rather than shipping silence. No stale ids exist today; this is the
  // guard for the day a 4th sound replaces a 3rd.
  // Checked against ADHAN_SOUND_IDS, not ADHAN_SOUND_OPTIONS. The IDS list is
  // what actually drives bundling — withAdhanSoundResources and
  // withIosAdhanSounds both map over it, and assert-ios-artifact.sh reads it —
  // so it is the only list that answers "is there a file with this name in the
  // bundle". Validating against OPTIONS would accept a 4th sound added to the
  // picker but not to IDS, return a filename nothing ships, and produce exactly
  // the silence this guard exists to prevent.
  const known = (ADHAN_SOUND_IDS as readonly string[]).includes(sound);
  return `adhan_${known ? sound : DEFAULT_NOTIFICATION_PREFS.adhanSound}.caf`;
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
        ? { priority: Notifications.AndroidNotificationPriority.MAX }
        : {}),
      ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const, sound: adhanSoundFile(adhanSound) } : {}),
    },
    // Immediate delivery, but still on the chosen adhan's channel. `channelId`
    // has no slot on the content — expo reads it from the TRIGGER, and the
    // channel-aware trigger below is the immediate form (trigger: null would
    // fall back to expo's default channel and play the system sound instead of
    // the adhan, which is exactly what shipped).
    trigger: Platform.OS === "android" ? { channelId: prayerChannelId(adhanSound) } : null,
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
 * The notification types scheduleAllNotifications owns. Declared once and used
 * by both its schedule calls and its cancel pass, so the two cannot drift apart
 * — a cancel that does not match what is scheduled is what made this function
 * delete other modules' notifications.
 */
const PRAYER_TYPE = "prayer";
const ADHKAAR_TYPE = "adhkaar";
const SCHEDULE_ALL_OWN_TYPES: readonly string[] = [PRAYER_TYPE, ADHKAAR_TYPE];

/**
 * Schedule prayer and adhkaar notifications based on prayer times, for as many
 * days as scheduleDays("prayer") allows on this platform (7 on Android; fewer on
 * iOS, which caps the app at 64 pending requests — see lib/notification-horizons).
 * Cancels this module's own prayer and adhkaar notifications first, and only
 * those.
 *
 * Serialized through the shared scheduler queue: read-cancel-schedule is not
 * atomic, and a settings toggle racing the boot-path call used to interleave two
 * runs into double-scheduled alarms. The queue makes the later call wait and
 * then re-run from scratch, so the end state is the LAST call's output.
 */
export function scheduleAllNotifications(
  language: "nl" | "en" | "ar" = "nl"
): Promise<number> {
  return enqueue(() => scheduleAllNotificationsInner(language));
}

/**
 * Cancels exactly what scheduleAllNotifications schedules, and nothing else.
 *
 * Exported because the settings screens need it too: turning the prayer master
 * toggle off called cancelAllScheduledNotificationsAsync(), which also deleted
 * every other module's work — iqaamah silence, iman, islamic reminders, weekly
 * goals, spouse advice, the monitoring notice. Switching off one feature must
 * not silently switch off five others.
 *
 * Shares scheduleAllNotifications' queue: a master-off toggle running while a
 * scheduling pass is mid-flight would otherwise cancel the alarms already
 * written and leave the ones still being written, i.e. "off" that is partly on.
 */
export function cancelScheduleAllNotifications(): Promise<void> {
  return enqueue(cancelOwnScheduled);
}

/** The cancel pass itself. Callers must hold the queue — see above. */
async function cancelOwnScheduled(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (SCHEDULE_ALL_OWN_TYPES.includes(notif.content.data?.type as string)) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

async function scheduleAllNotificationsInner(
  language: "nl" | "en" | "ar"
): Promise<number> {
  // The raw pass, not the queued wrapper: this already runs inside the queue,
  // and re-entering it would wait on a job that cannot finish until we return.
  await cancelOwnScheduled();

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

  // Schedule for the next scheduleDays("prayer") days — 7 on Android, fewer on
  // iOS, which caps the whole app at 64 pending requests (notification-horizons).
  const prayerDays = scheduleDays("prayer");
  for (let dayOffset = 0; dayOffset < prayerDays; dayOffset++) {
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
            data: { type: PRAYER_TYPE, prayer, showPopup: true, ruling: "واجب" },
            ...(Platform.OS === "android" ? { priority: Notifications.AndroidNotificationPriority.MAX, sticky: true } : {}),
            ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const, sound: adhanSoundFile(prefs.adhanSound) } : {}),
          },
          trigger: {
            channelId: prayerChannelId(prefs.adhanSound),
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
              data: { type: ADHKAAR_TYPE, adhkaarType: "morning", showPopup: true, ruling: "سنة مؤكدة" },
              ...(Platform.OS === "android" ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
              ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const, sound: "default" } : {}),
            },
            trigger: {
            channelId: ADHKAAR_CHANNEL_ID,
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
              data: { type: ADHKAAR_TYPE, adhkaarType: "evening", showPopup: true, ruling: "سنة مؤكدة" },
              ...(Platform.OS === "android" ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
              ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const, sound: "default" } : {}),
            },
            trigger: {
            channelId: ADHKAAR_CHANNEL_ID,
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

  // Keeps the daily advice notification in step with the active language. It no
  // longer needs *restoring* (the cancel above leaves it alone), but several
  // callers change language and re-run only this function.
  //
  // The UNQUEUED pass, not the exported wrapper: we already hold the shared
  // scheduler queue, and re-entering it here would wait on a job that cannot
  // finish until this function returns.
  try {
    const { scheduleDailyAdviceUnqueued } = await import("./daily-advice-notification");
    await scheduleDailyAdviceUnqueued(language);
  } catch (_) {}

  // Same treatment for the daily check-in reminder. The boot path in _layout.tsx
  // is what covers users without a saved prayer location (this inner call sits
  // after the location gate); this one keeps it in step with the active language.
  try {
    const { scheduleDailyCheckinNotification } = await import("./daily-checkin-notification");
    await scheduleDailyCheckinNotification(language);
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
  const offsetMs = timezoneOffsetMs(tempDate, timezone);

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
export function scheduleWeeklyReminder(
  language: "nl" | "en" | "ar" = "nl",
  unfinishedCount?: number
): Promise<boolean> {
  return enqueue(() => scheduleWeeklyReminderInner(language, unfinishedCount));
}

async function scheduleWeeklyReminderInner(
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
        ...(Platform.OS === "android" ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
        ...(Platform.OS === "ios" ? { sound: "default" } : {}),
      },
      trigger: {
            channelId: WEEKLY_CHANNEL_ID,
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
export function scheduleInactivityReminder(
  language: "nl" | "en" | "ar" = "nl"
): Promise<void> {
  return enqueue(() => scheduleInactivityReminderInner(language));
}

async function scheduleInactivityReminderInner(
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
        ...(Platform.OS === "android" ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
        ...(Platform.OS === "ios" ? { interruptionLevel: "active" as const, sound: "default" } : {}),
      },
      trigger: {
            channelId: INACTIVITY_CHANNEL_ID,
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
export function scheduleGoalsIncompleteReminder(
  language: "nl" | "en" | "ar" = "nl"
): Promise<void> {
  return enqueue(() => scheduleGoalsIncompleteReminderInner(language));
}

async function scheduleGoalsIncompleteReminderInner(
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
        ...(Platform.OS === "android" ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
        ...(Platform.OS === "ios" ? { interruptionLevel: "active" as const, sound: "default" } : {}),
      },
      trigger: {
            channelId: GOALS_INCOMPLETE_CHANNEL_ID,
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

/** Exported for tests only — see tests/trigger-date-timezone.test.ts. */
export const __test_createTriggerDate = createTriggerDate;
