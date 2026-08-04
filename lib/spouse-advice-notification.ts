import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ============ CONSTANTS ============

const SPOUSE_ADVICE_CHANNEL_ID = "spouse_advice_v2";
const SPOUSE_ADVICE_TYPE = "spouse_advice";
const PREFS_KEY = "@spouse_advice_prefs";
const LAST_TIP_KEY = "@last_spouse_tip";

export interface SpouseAdvicePrefs {
  enabled: boolean;
  hour: number;
  minute: number;
}

const DEFAULT_PREFS: SpouseAdvicePrefs = {
  enabled: true,
  hour: 20, // 8 PM - after dinner
  minute: 30,
};

// ============ PREFS ============

export async function loadSpouseAdvicePrefs(): Promise<SpouseAdvicePrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

export async function saveSpouseAdvicePrefs(prefs: Partial<SpouseAdvicePrefs>): Promise<void> {
  const current = await loadSpouseAdvicePrefs();
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...prefs }));
}

export async function saveLastSpouseTip(tip: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_TIP_KEY, tip);
  } catch {}
}

export async function loadLastSpouseTip(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_TIP_KEY);
  } catch {
    return null;
  }
}

// ============ CHANNEL SETUP ============

export async function setupSpouseAdviceChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(SPOUSE_ADVICE_CHANNEL_ID, {
    name: "Partner Advies / Spouse Advice / نصائح الشريك",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

// ============ DAILY SPOUSE ADVICE NOTIFICATION ============

/**
 * Schedule a daily recurring notification with a spouse advice tip.
 * Default time: 20:30 (after dinner/Isha prayer).
 */
export async function scheduleSpouseAdviceNotification(
  language: "nl" | "en" | "ar" = "nl"
): Promise<boolean> {
  if (Platform.OS === "web") return false;

  // Cancel existing spouse advice notifications
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === SPOUSE_ADVICE_TYPE) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const prefs = await loadSpouseAdvicePrefs();
  if (!prefs.enabled) return false;

  const lastTip = await loadLastSpouseTip();

  const title =
    language === "ar"
      ? "اقتراح لشريك حياتك"
      : language === "en"
      ? "Suggestion for your spouse"
      : "Suggestie voor uw partner";

  const body = lastTip
    ? lastTip
    : language === "ar"
    ? "افتح التطبيق لرؤية اقتراح عملي لتقوية علاقتك بشريكك"
    : language === "en"
    ? "Open the app to see a practical suggestion to strengthen your relationship"
    : "Open de app voor een praktische suggestie om uw relatie te versterken";

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: SPOUSE_ADVICE_TYPE, url: "/(tabs)/family", showPopup: true, ruling: "مستحب" },
        ...(Platform.OS === "android" ? { channelId: SPOUSE_ADVICE_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
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
    console.warn("Failed to schedule spouse advice notification:", err);
    return false;
  }
}

/**
 * Cancel all spouse advice notifications.
 */
export async function cancelSpouseAdviceNotification(): Promise<void> {
  if (Platform.OS === "web") return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === SPOUSE_ADVICE_TYPE) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}
