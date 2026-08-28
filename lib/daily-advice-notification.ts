import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  loadDailyAdvicePrefs,
  loadLastAdviceTitle,
  loadWidgetEnabled,
} from "./advice-prefs";
import { enqueue } from "./notification-queue";

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
    // Android-only. iOS has no notification channels at all, so every scheduled
    // content below carries its own matching sound; without one it arrives silent
    // and nothing throws. See tests/adhan-ios-sound.test.ts.
    sound: "default",
  });

  await Notifications.setNotificationChannelAsync(WIDGET_CHANNEL_ID, {
    name: "Advies Widget / Advice Widget",
    importance: Notifications.AndroidImportance.LOW,
    // Silent on purpose, and showAdviceWidget stays silent on iOS to match: the
    // "widget" is a sticky status line re-posted every time the advice text
    // changes, so a sound here would chime at the user for a redraw.
    sound: undefined,
  });
}

// ============ DAILY ADVICE NOTIFICATION ============

/**
 * Schedule a daily recurring notification with the last generated advice title.
 * Cancels any existing daily advice notifications first (targeted cancellation).
 */
export function scheduleDailyAdviceNotification(
  language: "nl" | "en" | "ar" = "nl",
): Promise<boolean> {
  return enqueue(() => scheduleDailyAdviceUnqueued(language));
}

/**
 * The pass itself, without the queue.
 *
 * Exported only for scheduleAllNotifications, which reschedules the daily advice
 * notification from inside its own queued job — going through the wrapper above
 * from there would deadlock. Every other caller must use
 * scheduleDailyAdviceNotification.
 */
export async function scheduleDailyAdviceUnqueued(
  language: "nl" | "en" | "ar" = "nl",
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
        data: {
          type: DAILY_ADVICE_TYPE,
          url: "/details/personal-advice",
          showPopup: true,
          ruling: "مستحب",
        },
        ...(Platform.OS === "android"
          ? {
              channelId: DAILY_ADVICE_CHANNEL_ID,
              priority: Notifications.AndroidNotificationPriority.HIGH,
            }
          : {}),
        ...(Platform.OS === "ios" ? { sound: "default" } : {}),
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
  language: "nl" | "en" | "ar" = "nl",
): Promise<void> {
  // Android only, which the docstring above already says and the code did not
  // enforce. The whole construct is `sticky` + `autoDismiss: false` — both
  // Android-only fields — standing in for a home-screen widget Expo cannot
  // build. iOS has no sticky notification, so there it degraded into an
  // ordinary Notification Center entry re-posted every time the advice text
  // changed: a notification the user never asked for, recurring, with no
  // widget behind it. Nothing to clean up on the way in — this is the first
  // iOS release, so no iOS install has ever posted one.
  if (Platform.OS !== "android") return;

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
