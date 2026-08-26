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

/**
 * Schedule a daily recurring reminder to complete the daily check-in
 * (prayer + mood, home tab). Mirrors scheduleDailyAdviceNotification's shape
 * (lib/daily-advice-notification.ts): cancel any existing notification of
 * this type, then reschedule. No "already completed today" conditional —
 * matches the daily advice notification's own minimal behavior.
 */
export async function scheduleDailyCheckinNotification(
  language: "nl" | "en" | "ar" = "nl"
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

  const body =
    language === "ar"
      ? "خذ لحظة لتسجيل صلاتك ومزاجك اليوم"
      : language === "en"
      ? "Take a moment to log your prayer and mood today"
      : "Neem een moment om je gebed en stemming van vandaag te registreren";

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: DAILY_CHECKIN_TYPE, url: "/(tabs)", showPopup: true, ruling: "مستحب" },
        ...(Platform.OS === "android" ? { channelId: DAILY_CHECKIN_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
        ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
      },
      trigger: {
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
