import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
async function getCurrentGoalText(language: string): Promise<string | null> {
  try {
    const dayIndex = new Date().getDay();

    // Priority 1: Advisor action plans (child-specific)
    const plansRaw = await AsyncStorage.getItem("@advisor_action_plans");
    if (plansRaw) {
      const plans = JSON.parse(plansRaw);
      // Get active plans (not fully completed)
      const activePlans = plans.filter((p: any) => {
        if (!p.phases || p.phases.length === 0) return false;
        const totalSteps = p.phases.reduce((sum: number, ph: any) => sum + (ph.steps?.length || 0), 0);
        const completedSteps = (p.completedSteps || []).length;
        return completedSteps < totalSteps;
      });

      if (activePlans.length > 0) {
        // Pick the most recent active plan
        const latestPlan = activePlans[activePlans.length - 1];
        const childName = latestPlan.childName || "";
        
        // Find today's uncompleted step
        const allSteps: { text: string }[] = [];
        for (const phase of latestPlan.phases) {
          if (phase.steps) {
            for (const step of phase.steps) {
              if (!(latestPlan.completedSteps || []).includes(step.id)) {
                allSteps.push(step);
              }
            }
          }
        }

        if (allSteps.length > 0) {
          const step = allSteps[dayIndex % allSteps.length];
          const prefix = childName 
            ? (language === "ar" ? `ل${childName}: ` : language === "en" ? `For ${childName}: ` : `Voor ${childName}: `)
            : "";
          return prefix + step.text;
        }
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
