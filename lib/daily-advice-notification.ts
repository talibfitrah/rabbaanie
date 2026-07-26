import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  loadDailyAdvicePrefs,
  loadLastAdviceTitle,
  loadWidgetEnabled,
} from "./advice-prefs";

// ============ CONSTANTS ============

const DAILY_ADVICE_CHANNEL_ID = "daily_advice_v2";
const WIDGET_CHANNEL_ID = "advice_widget";
const DAILY_ADVICE_TYPE = "daily_advice";
const WIDGET_TYPE = "advice_widget";

// ============ CHANNEL SETUP ============

export async function setupDailyAdviceChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(DAILY_ADVICE_CHANNEL_ID, {
    name: "Dagelijks Advies / Daily Advice",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });

  await Notifications.setNotificationChannelAsync(WIDGET_CHANNEL_ID, {
    name: "Advies Widget / Advice Widget",
    importance: Notifications.AndroidImportance.LOW,
    sound: undefined,
  });
}

// ============ DAILY ADVICE NOTIFICATION ============

/**
 * Schedule a daily recurring notification with the last generated advice title.
 * Cancels any existing daily advice notifications first (targeted cancellation).
 */
export async function scheduleDailyAdviceNotification(
  language: "nl" | "en" | "ar" = "nl"
): Promise<boolean> {
  if (Platform.OS === "web") return false;

  // Cancel existing daily advice notifications
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === DAILY_ADVICE_TYPE) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const prefs = await loadDailyAdvicePrefs();
  if (!prefs.enabled) return false;

  const lastTitle = await loadLastAdviceTitle();

  const title =
    language === "ar"
      ? "نصيحة اليوم"
      : language === "en"
      ? "Today's Advice"
      : "Advies van vandaag";

  const body = lastTitle
    ? lastTitle
    : language === "ar"
    ? "افتح التطبيق لقراءة نصيحتك الشخصية اليوم"
    : language === "en"
    ? "Open the app to read your personal advice today"
    : "Open de app om je persoonlijk advies van vandaag te lezen";

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: DAILY_ADVICE_TYPE, url: "/details/personal-advice", showPopup: true, ruling: "مستحب" },
        ...(Platform.OS === "android" ? { channelId: DAILY_ADVICE_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
        ...(Platform.OS === "ios" ? { interruptionLevel: "timeSensitive" as const } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: prefs.hour,
        minute: prefs.minute,
      },
    });
    return true;
  } catch (err) {
    console.warn("Failed to schedule daily advice notification:", err);
    return false;
  }
}

/**
 * Cancel all daily advice notifications.
 */
export async function cancelDailyAdviceNotification(): Promise<void> {
  if (Platform.OS === "web") return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === DAILY_ADVICE_TYPE) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

// ============ WIDGET (STICKY NOTIFICATION) ============

/**
 * Show a persistent (sticky) notification with today's advice.
 * This acts as a "widget" on Android since Expo doesn't support home screen widgets.
 * The notification stays visible until dismissed or updated.
 */
export async function showAdviceWidget(
  language: "nl" | "en" | "ar" = "nl"
): Promise<void> {
  if (Platform.OS === "web") return;

  // Cancel existing widget notifications
  await dismissAdviceWidget();

  const widgetEnabled = await loadWidgetEnabled();
  if (!widgetEnabled) return;

  const lastTitle = await loadLastAdviceTitle();

  const title =
    language === "ar"
      ? "نصيحة اليوم"
      : language === "en"
      ? "Today's Advice"
      : "Advies van vandaag";

  const body = lastTitle
    ? lastTitle
    : language === "ar"
    ? "افتح التطبيق لقراءة نصيحتك الشخصية"
    : language === "en"
    ? "Open the app to read your personal advice"
    : "Open de app om je persoonlijk advies te lezen";

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: WIDGET_TYPE, url: "/details/personal-advice" },
        sticky: true,
        autoDismiss: false,
        ...(Platform.OS === "android" ? { channelId: WIDGET_CHANNEL_ID } : {}),
      },
      trigger: null, // Immediate
    });
  } catch (err) {
    console.warn("Failed to show advice widget notification:", err);
  }
}

/**
 * Dismiss the sticky widget notification.
 */
export async function dismissAdviceWidget(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const notif of presented) {
      if (notif.request.content.data?.type === WIDGET_TYPE) {
        await Notifications.dismissNotificationAsync(notif.request.identifier);
      }
    }
  } catch {}
}
