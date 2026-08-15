import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { parsePlanText } from "@/lib/plan-blocks";
import { planProgressKey } from "@/lib/plan-progress";

// ============ CONSTANTS ============

const WEEKLY_GOALS_CHANNEL_ID = "weekly_goals_v2";
const WEEKLY_GOALS_TYPE = "weekly_goals_reminder";
const PREFS_KEY = "@weekly_goals_notification_prefs";

// ============ TYPES ============

export interface WeeklyGoalsNotifPrefs {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
}

export const DEFAULT_WEEKLY_GOALS_PREFS: WeeklyGoalsNotifPrefs = {
  enabled: true,
  hour: 8,
  minute: 30,
};

// ============ PREFS STORAGE ============

export async function loadWeeklyGoalsNotifPrefs(): Promise<WeeklyGoalsNotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_WEEKLY_GOALS_PREFS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_WEEKLY_GOALS_PREFS };
}

export async function saveWeeklyGoalsNotifPrefs(prefs: WeeklyGoalsNotifPrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// ============ CHANNEL SETUP ============

export async function setupWeeklyGoalsChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(WEEKLY_GOALS_CHANNEL_ID, {
    name: "أهداف أسبوعية / Weekly Goals",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

// ============ SCHEDULE NOTIFICATION ============

/**
 * Schedule a daily recurring notification with the current weekly goal.
 * Reads the current goals from AsyncStorage and picks the appropriate one for today.
 */
export async function scheduleWeeklyGoalsNotification(
  language: "nl" | "en" | "ar" = "ar"
): Promise<boolean> {
  if (Platform.OS === "web") return false;

  // Cancel existing weekly goals notifications
  await cancelWeeklyGoalsNotification();

  const prefs = await loadWeeklyGoalsNotifPrefs();
  if (!prefs.enabled) return false;

  // Get today's goal from stored weekly data
  const goalText = await getCurrentGoalText(language);

  const title =
    language === "ar"
      ? "هدفك التربوي اليوم"
      : language === "en"
      ? "Today's Parenting Goal"
      : "Je opvoeddoel vandaag";

  const body = goalText || getDefaultBody(language);

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: WEEKLY_GOALS_TYPE, url: "/(tabs)/weekly", showPopup: true, ruling: "مستحب" },
        ...(Platform.OS === "android" ? { channelId: WEEKLY_GOALS_CHANNEL_ID, priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
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
    console.warn("Failed to schedule weekly goals notification:", err);
    return false;
  }
}

/**
 * Cancel all weekly goals notifications.
 */
export async function cancelWeeklyGoalsNotification(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.content.data?.type === WEEKLY_GOALS_TYPE) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch {}
}

// ============ HELPERS ============

/**
 * Get the current goal text for today from the stored weekly goals.
 * Prioritizes child-specific advisor plans, then general weekly goals.
 * Cycles through the goals based on the day of the week.
 */
/**
 * The tasks in a plan the parents have not ticked off yet.
 *
 * Read through the same parser that draws the checkboxes, and matched by the
 * same task keys it stores, so "which are left" cannot drift from "how many are
 * done". Counting with a second parser meant the reminder could skip past work
 * that had never been done, or drop a plan it could not parse.
 *
 * Plans saved before the advisor kept its own text have only the parsed phases,
 * and those are still read the way they always were.
 */
async function remainingPlanTasks(plan: any): Promise<string[]> {
  const tasks = plan?.content
    ? parsePlanText(plan.content).filter((b) => b.type === "task")
    : [];
  if (tasks.length > 0) {
    const raw = await AsyncStorage.getItem(planProgressKey(plan.id));
    const done = new Set<string>(raw ? JSON.parse(raw) : []);
    return tasks
      .filter((t) => !done.has((t as { key: string }).key))
      .map((t) => (t as { text: string }).text);
  }
  return (plan?.phases ?? []).flatMap((ph: any) =>
    (ph?.steps ?? [])
      .filter((s: any) => !(plan.completedSteps ?? []).includes(s.id))
      .map((s: any) => s.text),
  );
}

export async function getCurrentGoalText(language: string): Promise<string | null> {
  try {
    const dayIndex = new Date().getDay();

    // Priority 1: Advisor action plans (child-specific). Newest first, taking
    // the first plan with work still to do.
    const plansRaw = await AsyncStorage.getItem("@advisor_action_plans");
    if (plansRaw) {
      const plans = JSON.parse(plansRaw);
      for (let i = plans.length - 1; i >= 0; i--) {
        const plan = plans[i];
        const remaining = await remainingPlanTasks(plan);
        if (remaining.length === 0) continue;
        const childName = plan.childName || "";
        const prefix = childName
          ? (language === "ar" ? `ل${childName}: ` : language === "en" ? `For ${childName}: ` : `Voor ${childName}: `)
          : "";
        return prefix + remaining[dayIndex % remaining.length];
      }
    }

    // Priority 2: Weekly goals from data cache
    const weeklyCache = await AsyncStorage.getItem("@weekly_goals_cache");
    if (weeklyCache) {
      const goals: { title: string; explanation: string }[] = JSON.parse(weeklyCache);
      if (goals.length > 0) {
        const goal = goals[dayIndex % goals.length];
        return goal.title || goal.explanation;
      }
    }
  } catch (e) {
    console.warn("Error getting current goal text:", e);
  }
  return null;
}

function getDefaultBody(language: string): string {
  if (language === "ar") {
    return "افتح التطبيق لمراجعة أهدافك التربوية لهذا الأسبوع";
  } else if (language === "en") {
    return "Open the app to review your parenting goals for this week";
  }
  return "Open de app om je opvoeddoelen voor deze week te bekijken";
}

/**
 * Save goals to cache for notification use.
 * Call this when weekly goals are loaded/updated.
 */
export async function cacheWeeklyGoalsForNotification(
  goals: { title: string; explanation: string }[]
): Promise<void> {
  try {
    await AsyncStorage.setItem("@weekly_goals_cache", JSON.stringify(goals));
  } catch {}
}
