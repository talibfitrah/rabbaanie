import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { enqueue } from "./notification-queue";

type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);

/**
 * `data.type` tag for the free-trial reminders. Used both to find "our own"
 * pending requests when cancelling/rescheduling, and in app/_layout.tsx's tap
 * listener to route straight to /subscribe instead of the generic "مستحب"
 * popup — this is actionable (go pay), not a religious reminder, same
 * reasoning the haid purity-check and partner-link types already get there.
 */
export const TRIAL_REMINDER_TYPE = "trial_reminder";
const CHANNEL_ID = "trial_reminder_v1";

const HOUR_SINGLE = [10];
const HOURS_TRIPLE = [9, 14, 19];

export interface TrialReminderSlot {
  date: Date;
  /** Trial days left AS OF this reminder's calendar day (1..7). */
  remainingDays: number;
}

/**
 * The owner's schedule (product spec): 1x/day while >2 days remain, escalating
 * to 3x/day for the final 2 days, counted back from `daysLeft` — the server's
 * own countdown — not from a remembered trial-start date. That makes a call
 * mid-trial naturally schedule only what is actually left (idempotent
 * rescheduling just recomputes from "now"), and needs no stored state.
 *
 * Trigger times already in the past are dropped, same convention every other
 * scheduler in lib/notifications.ts and lib/haid-notifications.ts follows.
 */
export function trialReminderSchedule(daysLeft: number, now: Date = new Date()): TrialReminderSlot[] {
  const remaining = Math.max(0, Math.min(7, Math.round(daysLeft)));
  const slots: TrialReminderSlot[] = [];
  for (let offset = 0; offset < remaining; offset++) {
    const remainingDays = remaining - offset;
    const hours = remainingDays <= 2 ? HOURS_TRIPLE : HOUR_SINGLE;
    for (const hour of hours) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, 0, 0, 0);
      if (date.getTime() > now.getTime()) slots.push({ date, remainingDays });
    }
  }
  return slots;
}

// [nl, en, ar] — real paid-tier features (app/subscribe.tsx SPECIAL list),
// rotated across the sequence for variety.
const BENEFITS: [string, string, string][] = [
  ["de slimme adviseur", "the smart advisor", "المستشار التربويّ"],
  ["persoonlijk advies", "personal advice", "النصائح الشخصيّة"],
  ["het weekplan", "the weekly plan", "الخطّة الأسبوعيّة"],
  ["gezinsbeheer", "family management", "إدارة العائلة"],
];

function reminderContent(index: number, remainingDays: number, language: Lang): { title: string; body: string } {
  const [nl, en, ar] = BENEFITS[index % BENEFITS.length];
  const urgent = remainingDays <= 2;
  const title = tx(
    language,
    urgent ? "Je gratis week loopt bijna af!" : "Nog in je gratis week",
    urgent ? "Your free week is almost over!" : "Still in your free week",
    urgent ? "أسبوعك المجّانيّ يوشك أن ينتهي!" : "لا تزال في أسبوعك المجّانيّ",
  );
  const body = tx(
    language,
    `Nog ${remainingDays} dag${remainingDays === 1 ? "" : "en"} om ${nl} te behouden. Abonneer nu.`,
    `${remainingDays} day${remainingDays === 1 ? "" : "s"} left to keep ${en}. Subscribe now.`,
    `تبقّى ${remainingDays === 1 ? "يوم واحد" : `${remainingDays} أيام`} لتحتفظ بـ${ar}. اشترك الآن.`,
  );
  return { title, body };
}

async function cancelOwn(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if ((n.content?.data as any)?.type === TRIAL_REMINDER_TYPE) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/** Cancel every pending trial reminder — called when the trial ends (subscribed
 *  or expired). Safe to call unconditionally; a no-op when none are pending. */
export function cancelTrialReminders(): Promise<void> {
  return enqueue(cancelOwn);
}

/**
 * (Re)schedule the trial reminder sequence. Cancels this module's own pending
 * requests first, so calling it again — e.g. every app open — is idempotent
 * rather than stacking duplicates.
 */
export function scheduleTrialReminders(language: Lang, daysLeft: number): Promise<number> {
  return enqueue(() => scheduleTrialRemindersInner(language, daysLeft));
}

async function scheduleTrialRemindersInner(language: Lang, daysLeft: number): Promise<number> {
  if (Platform.OS === "web") return 0;
  await cancelOwn();

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "تذكير التجربة المجّانيّة / Trial reminder",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const slots = trialReminderSchedule(daysLeft);
  let count = 0;
  for (let i = 0; i < slots.length; i++) {
    const { date, remainingDays } = slots[i];
    const { title, body } = reminderContent(i, remainingDays, language);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { type: TRIAL_REMINDER_TYPE },
          ...(Platform.OS === "android" ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
          ...(Platform.OS === "ios" ? { sound: "default" } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
        },
      });
      count++;
    } catch (err) {
      console.warn("Failed to schedule trial reminder:", err);
    }
  }
  return count;
}
