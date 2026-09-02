import * as Notifications from "expo-notifications";
import { addDays, classify, excusedState, predict, type CycleDay, type CycleSettings, type ExcusedState, isoToday } from "./haid";
import { HAID_NOTIFICATION_TYPES, writeExcusedState, clearExcusedState } from "./haid-state";
import { scheduleAllNotifications } from "./notifications";

type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);
const OWN_TYPES: string[] = [HAID_NOTIFICATION_TYPES.purityCheck, HAID_NOTIFICATION_TYPES.ghuslReminder];
const HOUR = 8; // local morning

export interface HaidSyncInput { userId: number; days: CycleDay[]; settings: CycleSettings; language: Lang; today?: string }

async function cancelOwn(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    const t = (n.content?.data as any)?.type;
    if (OWN_TYPES.includes(t)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
}
function at(date: string, hour: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, hour, 0, 0);
}

/** Recomputes today's excused state from the raw data, persists the flag, pauses/restores prayers, (re)schedules the purity check + ghusl reminder. */
export async function syncHaidNotifications({ userId, days, settings, language, today = isoToday() }: HaidSyncInput): Promise<ExcusedState> {
  const classified = classify(days, settings, addDays(today, -60), today);
  const prediction = predict(days, settings, today);
  const state = excusedState(classified, prediction, today);
  await cancelOwn();
  if (!state.excused) {
    await clearExcusedState(userId);
    await scheduleAllNotifications(language, undefined);
    return state;
  }
  await writeExcusedState(userId, state);
  await scheduleAllNotifications(language, state.until); // decision 14-أ
  for (let d = today; d <= (state.until ?? today); d = addDays(d, 1)) {
    const when = at(d, HOUR);
    if (when.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: tx(language, "Bent u weer rein?", "Have you become pure?", "هل طهرتِ؟"),
        body: tx(language, "Tik om uw dag bij te werken.", "Tap to update today.", "اضغطي لتحديث حال اليوم."),
        data: { type: HAID_NOTIFICATION_TYPES.purityCheck, url: "/haid?purityCheck=1" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
  }
  if (settings.ghuslReminder && prediction.expectedPurity) { // decision 16-أ
    const when = at(prediction.expectedPurity, HOUR);
    if (when.getTime() > Date.now()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: tx(language, "Verwachte reinheid vandaag", "Expected purity today", "الطهر متوقَّع اليوم"),
          body: tx(language, "Ziet u reinheid? Verricht de ghusl en bid.", "If you see purity, perform ghusl and pray.", "إن رأيتِ الطهر فاغتسلي وصلّي."),
          data: { type: HAID_NOTIFICATION_TYPES.ghuslReminder, url: "/haid" },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
    }
  }
  return state;
}
