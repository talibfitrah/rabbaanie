/**
 * Iqamah Auto-Silence Module
 * 
 * Automatically silences the phone at iqamah time (configurable minutes after adhan).
 * Restores ringer after a configurable silence duration.
 * 
 * Android: Uses react-native-volume-manager to change ringer mode to silent.
 * iOS: Sends a reminder notification since iOS doesn't allow programmatic ringer control.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { timezoneOffsetMs } from "@/lib/tz-offset";
import {
  calculatePrayerTimes,
  PRAYER_LOCATION_KEY,
  PRAYER_METHOD_KEY,
  CALC_METHODS,
  type SavedPrayerLocation,
} from "./prayer-data";
// Safe import — returns fallbacks on iOS/web, or when this module isn't
// linked (e.g. a dev client built before it existed). See modules/iqamah-alarm
// for why the killed-app case needs a native AlarmManager + BroadcastReceiver
// instead of the expo-notifications listeners below.
import * as IqamahAlarmNative from "../modules/iqamah-alarm/src";

// ============ STORAGE KEYS ============

export const IQAMAH_SILENCE_PREFS_KEY = "@iqamah_silence_prefs";
// Remembers the phone's ringer mode from just before we silenced it, so restore
// returns it to exactly that (vibrate stays vibrate, etc.) instead of forcing normal.
const IQAMAH_PRIOR_RINGER_KEY = "@iqamah_prior_ringer_mode";

// ============ TYPES ============

export interface IqamahSilencePrefs {
  enabled: boolean;
  /** Minutes after adhan to start silence (default: 10) */
  minutesAfterAdhan: number;
  /** Duration of silence in minutes (default: 10) */
  silenceDurationMinutes: number;
  /** Which prayers to silence for */
  prayers: {
    fajr: boolean;
    dhuhr: boolean;
    asr: boolean;
    maghrib: boolean;
    isha: boolean;
  };
}

export const DEFAULT_IQAMAH_SILENCE_PREFS: IqamahSilencePrefs = {
  enabled: true,
  minutesAfterAdhan: 10,
  silenceDurationMinutes: 10,
  prayers: {
    fajr: true,
    dhuhr: true,
    asr: true,
    maghrib: true,
    isha: true,
  },
};

// ============ PREFERENCES ============

export async function loadIqamahSilencePrefs(): Promise<IqamahSilencePrefs> {
  try {
    const raw = await AsyncStorage.getItem(IQAMAH_SILENCE_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_IQAMAH_SILENCE_PREFS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_IQAMAH_SILENCE_PREFS };
}

export async function saveIqamahSilencePrefs(prefs: IqamahSilencePrefs): Promise<void> {
  await AsyncStorage.setItem(IQAMAH_SILENCE_PREFS_KEY, JSON.stringify(prefs));
}

// ============ ANDROID CHANNEL ============

const IQAMAH_CHANNEL_ID = "iqamah_silence_v2";

async function setupIqamahChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(IQAMAH_CHANNEL_ID, {
    name: "إسكات الإقامة / Iqamah Silence",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableLights: true,
    lightColor: "#1B4332",
  });
}

// ============ SCHEDULING ============

/**
 * Schedule iqamah silence notifications/actions for the next 7 days.
 * On Android: schedules a notification that triggers the silence action.
 * On iOS: schedules a reminder notification to manually silence.
 */
export async function scheduleIqamahSilence(
  language: "nl" | "en" | "ar" = "nl"
): Promise<number> {
  if (Platform.OS === "web") return 0;

  // Cancel existing iqamah notifications
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (
      notif.content.data?.type === "iqamah_silence" ||
      notif.content.data?.type === "iqamah_restore"
    ) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const prefs = await loadIqamahSilencePrefs();
  if (!prefs.enabled) {
    // Empty list clears every previously-armed native alarm too — the
    // native module has no separate "cancel" call (see modules/iqamah-alarm).
    if (Platform.OS === "android") {
      try {
        await IqamahAlarmNative.scheduleSilenceAlarms([]);
      } catch {}
    }
    return 0;
  }

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

  await setupIqamahChannel();

  let scheduledCount = 0;
  const now = new Date();
  const prayerKeys = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
  // Handed to the native AlarmManager scheduler alongside (not instead of)
  // the notifications below — see modules/iqamah-alarm. requestCode must be
  // unique and stable per (dayOffset, prayer); IqamahAlarmModule cancels a
  // fixed 0..34 range (7 days x 5 prayers) on every call, so this formula
  // must stay in that range.
  const alarmEntries: IqamahAlarmNative.IqamahAlarmEntry[] = [];

  const PRAYER_NAMES = {
    ar: { fajr: "الفجر", dhuhr: "الظهر", asr: "العصر", maghrib: "المغرب", isha: "العشاء" },
    en: { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" },
    nl: { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" },
  };

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);

    const times = calculatePrayerTimes(date, location.lat, location.lng, method, location.tz);

    for (const prayer of prayerKeys) {
      if (!prefs.prayers[prayer]) continue;

      const timeStr = times[prayer];
      const [h, m] = timeStr.split(":").map(Number);

      // Calculate iqamah time (adhan + minutesAfterAdhan)
      const iqamahDate = createTriggerDateForIqamah(
        date, h, m, prefs.minutesAfterAdhan, location.tz
      );

      // Skip if in the past
      if (iqamahDate.getTime() <= now.getTime()) continue;

      alarmEntries.push({
        requestCode: dayOffset * 5 + prayerKeys.indexOf(prayer),
        triggerAtMs: iqamahDate.getTime(),
        durationMinutes: prefs.silenceDurationMinutes,
      });

      const prayerName = PRAYER_NAMES[language][prayer];

      // Schedule silence notification
      const silenceTitle = language === "ar"
        ? `🔇 إسكات الهاتف - إقامة ${prayerName}`
        : language === "en"
        ? `🔇 Phone silenced - ${prayerName} Iqamah`
        : `🔇 Telefoon gedempt - ${prayerName} Iqamah`;

      const silenceBody = language === "ar"
        ? `تم إسكات الهاتف تلقائياً لمدة ${prefs.silenceDurationMinutes} دقائق لصلاة ${prayerName}`
        : language === "en"
        ? `Phone auto-silenced for ${prefs.silenceDurationMinutes} min for ${prayerName} prayer`
        : `Telefoon automatisch gedempt voor ${prefs.silenceDurationMinutes} min voor ${prayerName} gebed`;

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: silenceTitle,
            body: silenceBody,
            data: {
              type: "iqamah_silence",
              prayer,
              action: "silence",
              durationMinutes: prefs.silenceDurationMinutes,
              showPopup: true,
              ruling: "واجب",
            },
            ...(Platform.OS === "android" ? { priority: Notifications.AndroidNotificationPriority.MAX, sticky: true } : {}),
            ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
          },
          trigger: {
            channelId: IQAMAH_CHANNEL_ID,
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: iqamahDate,
          },
        });
        scheduledCount++;
      } catch (err) {
        console.warn(`Failed to schedule iqamah silence for ${prayer}:`, err);
      }

      // Schedule restore notification (silence + duration)
      const restoreDate = new Date(iqamahDate.getTime() + prefs.silenceDurationMinutes * 60 * 1000);

      const restoreTitle = language === "ar"
        ? `🔔 تم إعادة صوت الهاتف`
        : language === "en"
        ? `🔔 Phone ringer restored`
        : `🔔 Telefoongeluid hersteld`;

      const restoreBody = language === "ar"
        ? `انتهت فترة الإسكات بعد صلاة ${prayerName}`
        : language === "en"
        ? `Silence period ended after ${prayerName} prayer`
        : `Stilteperiode beëindigd na ${prayerName} gebed`;

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: restoreTitle,
            body: restoreBody,
            data: {
              type: "iqamah_restore",
              prayer,
              action: "restore",
              showPopup: true,
              ruling: "مستحب",
            },
            ...(Platform.OS === "android" ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
            ...(Platform.OS === "ios" ? { interruptionLevel: "active" as const } : {}),
          },
          trigger: {
            channelId: IQAMAH_CHANNEL_ID,
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: restoreDate,
          },
        });
        scheduledCount++;
      } catch (err) {
        console.warn(`Failed to schedule iqamah restore for ${prayer}:`, err);
      }
    }
  }

  if (Platform.OS === "android") {
    try {
      await IqamahAlarmNative.scheduleSilenceAlarms(alarmEntries);
    } catch (err) {
      console.warn("Failed to schedule native iqamah alarms:", err);
    }
  }

  return scheduledCount;
}

/**
 * Handle the iqamah silence action when the notification fires (foreground,
 * or the user tapped it). Called from the notification response handler.
 *
 * This is the fallback path: it only runs while JS is running (foreground,
 * or the OS spins up the app to deliver a tap). The killed-app case is
 * covered by modules/iqamah-alarm's BroadcastReceiver instead, which is why
 * both this function AND the receiver funnel through the SAME native state
 * store (IqamahAlarmNative.captureRingerModeIfNeeded /
 * consumePriorRingerMode) rather than each keeping their own — two owners
 * of "what to restore to" is exactly how a mute survives with its restore
 * lost, leaving the phone stuck silent.
 *
 */
export async function handleIqamahSilenceAction(action: "silence" | "restore"): Promise<void> {
  if (Platform.OS !== "android") return;

  try {
    const { VolumeManager, RINGER_MODE } = await import("react-native-volume-manager");

    if (action === "silence") {
      // Check DND access first
      const hasAccess = await VolumeManager.checkDndAccess();
      if (!hasAccess) {
        // Request access - user needs to grant it manually
        await VolumeManager.requestDndAccess();
        return;
      }
      // Capture the ringer mode from BEFORE this silence period, exactly
      // once, so restore returns it precisely (vibrate stays vibrate). The
      // silence action can fire twice for one prayer — once when the
      // notification is received, once if the user taps it — AND the native
      // BroadcastReceiver (modules/iqamah-alarm) can independently fire the
      // same prayer's mute when the app is killed. All of that funnels
      // through IqamahAlarmNative's single SharedPreferences record when the
      // module is available, so whichever path fires first "wins" the
      // capture and none of them can re-capture our own "silent" over it.
      // AsyncStorage is only a fallback for when the native module isn't
      // linked at all (e.g. a dev client built before this module existed).
      if (IqamahAlarmNative.isAvailable()) {
        const { silenceDurationMinutes } = await loadIqamahSilencePrefs();
        await IqamahAlarmNative.captureRingerModeIfNeeded(silenceDurationMinutes);
      } else {
        try {
          const alreadyCaptured = await AsyncStorage.getItem(IQAMAH_PRIOR_RINGER_KEY);
          if (alreadyCaptured === null) {
            const current = await VolumeManager.getRingerMode();
            if (current !== undefined && current !== null && current !== RINGER_MODE.silent) {
              await AsyncStorage.setItem(IQAMAH_PRIOR_RINGER_KEY, String(current));
            }
          }
        } catch {}
      }
      // Mute the ringer for the iqamah period.
      await VolumeManager.setRingerMode(RINGER_MODE.silent);
    } else if (action === "restore") {
      const hasAccess = await VolumeManager.checkDndAccess();
      if (!hasAccess) return;
      // Restore to the exact mode from before we silenced. If nothing was
      // captured (silence never ran, DND wasn't granted, the phone was
      // already silent, or another path already consumed it), do NOTHING —
      // never force "normal", which would raise a phone the user had
      // deliberately left on vibrate/silent. Read-and-clear so a second
      // restore (received + tapped, or JS + native) is a harmless no-op.
      let priorMode: number | null = null;
      if (IqamahAlarmNative.isAvailable()) {
        priorMode = await IqamahAlarmNative.consumePriorRingerMode();
      } else {
        const stored = await AsyncStorage.getItem(IQAMAH_PRIOR_RINGER_KEY);
        if (stored !== null) {
          priorMode = Number(stored);
          await AsyncStorage.removeItem(IQAMAH_PRIOR_RINGER_KEY);
        }
      }
      if (priorMode === null) return;
      await VolumeManager.setRingerMode(priorMode as typeof RINGER_MODE.normal);
    }
  } catch (err) {
    console.warn("Failed to change ringer mode:", err);
  }
}

/**
 * Manually put the ringer back to normal. For when an iqamah silence period
 * didn't auto-restore (e.g. the app was closed when the restore notification
 * fired, so its handler never ran) and the phone is stuck silent. User-initiated
 * from settings, so forcing "normal" is intended here — unlike the automatic
 * restore, which deliberately never forces normal. Returns false if DND access
 * isn't granted (and requests it) or the volume module is unavailable.
 */
export async function restorePhoneSound(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const { VolumeManager, RINGER_MODE } = await import("react-native-volume-manager");
    const hasAccess = await VolumeManager.checkDndAccess();
    if (!hasAccess) {
      await VolumeManager.requestDndAccess();
      return false;
    }
    await VolumeManager.setRingerMode(RINGER_MODE.normal);
    // Clear whichever store might hold a (now moot) captured mode, so a
    // later auto-restore can't re-apply a stale value on top of this.
    if (IqamahAlarmNative.isAvailable()) {
      await IqamahAlarmNative.consumePriorRingerMode();
    } else {
      await AsyncStorage.removeItem(IQAMAH_PRIOR_RINGER_KEY);
    }
    return true;
  } catch (err) {
    console.warn("Failed to restore phone sound:", err);
    return false;
  }
}

// ============ HELPER ============

function createTriggerDateForIqamah(
  baseDate: Date,
  hours: number,
  minutes: number,
  minutesAfterAdhan: number,
  timezone: string
): Date {
  let totalMinutes = hours * 60 + minutes + minutesAfterAdhan;
  let dayOffset = 0;
  if (totalMinutes >= 24 * 60) {
    totalMinutes -= 24 * 60;
    dayOffset = 1;
  }

  const targetH = Math.floor(totalMinutes / 60);
  const targetM = totalMinutes % 60;

  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate() + dayOffset;

  const tempDate = new Date(year, month, day, 12, 0, 0);
  const offsetMs = timezoneOffsetMs(tempDate, timezone);

  // targetH:targetM is wall-clock in `timezone`; build as UTC wall-clock then
  // subtract the tz offset. (new Date(y,m,d,H,M) would re-apply the device
  // offset on top of offsetMs, firing 1-2h early off UTC.)
  const targetUTC = new Date(Date.UTC(year, month, day, targetH, targetM, 0, 0) - offsetMs);

  return targetUTC;
}
