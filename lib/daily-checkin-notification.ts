import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { loadDailyCheckinPrefs } from "./daily-checkin-prefs";

// ============ CONSTANTS ============

// Own channel so the reminder is labelled "Daily check-in" in Android settings
// and can be muted independently of the "Daily Advice" channel.
export const DAILY_CHECKIN_CHANNEL_ID = "daily_checkin_v1";
const DAILY_CHECKIN_TYPE = "daily_checkin_reminder";
// Morning review, distinct from the daily advice notification's 07:00 default.
const CHECKIN_HOUR = 8;
const CHECKIN_MINUTE = 30;

// ============ CHANNEL SETUP ============

export async function setupDailyCheckinChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(DAILY_CHECKIN_CHANNEL_ID, {
    name: "Dagelijkse check-in / Daily check-in",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

// ============ DAILY CHECK-IN REMINDER ============

let checkinQueue: Promise<unknown> = Promise.resolve();

/**
 * Schedule a daily recurring reminder to complete the personal review on the
 * home tab. Mirrors scheduleDailyAdviceNotification's shape
 * (lib/daily-advice-notification.ts): cancel any existing notification of
 * this type, then reschedule. No "already completed today" conditional —
 * matches the daily advice notification's own minimal behavior.
 *
 * Serialized through a module-level queue, the same pattern
 * scheduleAllNotifications uses in lib/notifications.ts: read-cancel-read
 * pref-schedule is not atomic, and this runs from the launch path
 * (app/_layout.tsx) and from the settings toggle. Interleaved, a disable pass
 * could finish cancelling before an in-flight launch pass wrote its alarm,
 * leaving a reminder scheduled while `{ enabled: false }` is what's stored.
 *
 * Its OWN queue rather than notifications.ts's: scheduleAllNotificationsInner
 * calls this function while already holding that one, so sharing it would
 * wait on a job that cannot finish until this call returns.
 */
export function scheduleDailyCheckinNotification(
  language: "nl" | "en" | "ar" = "nl"
): Promise<boolean> {
  const run = checkinQueue.then(() => scheduleDailyCheckinNotificationInner(language));
  checkinQueue = run.catch(() => {});
  return run;
}

/** The pass itself. Callers must hold the queue — see above. */
async function scheduleDailyCheckinNotificationInner(
  language: "nl" | "en" | "ar"
): Promise<boolean> {
  if (Platform.OS === "web") return false;

  // Cancel existing check-in reminder notifications
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === DAILY_CHECKIN_TYPE) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const prefs = await loadDailyCheckinPrefs();
  if (!prefs.enabled) return false;

  const title =
    language === "ar"
      ? "التقييم اليومي"
      : language === "en"
      ? "Daily Check-in"
      : "Dagelijkse check-in";

  // Names «المراجعة الشخصية» / Personal review / Persoonlijke evaluatie — the
  // check-in this reminder actually opens (components/daily-duo-row.tsx). The
  // prayer/mood form the old wording promised no longer exists.
  const body =
    language === "ar"
      ? "خذ لحظة لمراجعتك الشخصية اليوم"
      : language === "en"
      ? "Take a moment for today's personal review"
      : "Neem een moment voor uw persoonlijke evaluatie van vandaag";

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: DAILY_CHECKIN_TYPE, url: "/(tabs)", showPopup: true, ruling: "مستحب" },
        ...(Platform.OS === "android" ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
        ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
      },
      trigger: {
        // expo-notifications reads channelId off the TRIGGER; in the content
        // it is ignored and the reminder lands on the default channel, where
        // this module's own "Daily check-in" channel cannot mute it. Same
        // placement as every scheduler in lib/notifications.ts.
        channelId: DAILY_CHECKIN_CHANNEL_ID,
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: CHECKIN_HOUR,
        minute: CHECKIN_MINUTE,
      },
    });
    return true;
  } catch (err) {
    console.warn("Failed to schedule daily check-in notification:", err);
    return false;
  }
}
