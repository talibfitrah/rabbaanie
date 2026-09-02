import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { addDays, classify, excusedState, predict, type CycleDay, type CycleSettings, type ExcusedState, isoToday } from "./haid";
import { HAID_NOTIFICATION_TYPES, writeExcusedState, clearExcusedState } from "./haid-state";
import { scheduleAllNotifications, HAID_CHANNEL_ID } from "./notifications";

type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);
const OWN_TYPES: string[] = [HAID_NOTIFICATION_TYPES.purityCheck, HAID_NOTIFICATION_TYPES.ghuslReminder];
const HOUR = 8; // local morning
// iOS keeps only 64 pending requests total (lib/notification-horizons); a
// single sync must not schedule further ahead than this — re-syncing on
// every app open already slides the window forward as she keeps using it.
const MAX_PURITY_CHECK_DAYS_AHEAD = 7;

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
async function syncHaidNotificationsOnce({ userId, days, settings, language, today = isoToday() }: HaidSyncInput): Promise<ExcusedState> {
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
  const rawUntil = state.until ?? today;
  const cap = addDays(today, MAX_PURITY_CHECK_DAYS_AHEAD - 1);
  const purityCheckUntil = rawUntil < cap ? rawUntil : cap;
  for (let d = today; d <= purityCheckUntil; d = addDays(d, 1)) {
    const when = at(d, HOUR);
    if (when.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: tx(language, "Bent u weer rein?", "Have you become pure?", "هل طهرتِ؟"),
        body: tx(language, "Tik om uw dag bij te werken.", "Tap to update today.", "اضغطي لتحديث حال اليوم."),
        data: { type: HAID_NOTIFICATION_TYPES.purityCheck },
        // No interruptionLevel: timeSensitive — that entitlement is justified
        // to Apple once, on the prayer notifications (tests/adhan-ios-sound
        // .test.ts). It still gets a sound like every other iOS reminder.
        ...(Platform.OS === "ios" ? { sound: "default" } : {}),
      },
      // channelId goes on the trigger, not content — expo reads it from
      // there (tests/trigger-date-timezone.test.ts documents the same rule
      // for lib/notifications.ts); the tap route is hardcoded in
      // app/_layout.tsx, so no `url` is carried here.
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: HAID_CHANNEL_ID },
    });
  }
  if (settings.ghuslReminder && prediction.expectedPurity) { // decision 16-أ
    const when = at(prediction.expectedPurity, HOUR);
    if (when.getTime() > Date.now()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: tx(language, "Verwachte reinheid vandaag", "Expected purity today", "الطهر متوقَّع اليوم"),
          body: tx(language, "Ziet u reinheid? Verricht de ghusl en bid.", "If you see purity, perform ghusl and pray.", "إن رأيتِ الطهر فاغتسلي وصلّي."),
          data: { type: HAID_NOTIFICATION_TYPES.ghuslReminder },
          ...(Platform.OS === "ios" ? { sound: "default" } : {}),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: HAID_CHANNEL_ID },
      });
    }
  }
  return state;
}

/**
 * Coalesces overlapping calls (e.g. two listeners reacting to the same
 * getMine refetch). cancelOwn()'s read-then-cancel and the schedule loop
 * that follows are not atomic, so two concurrent passes used to both read
 * the pending list before either had written its own, double-scheduling the
 * purity check/ghusl reminder.
 *
 * NOT routed through lib/notification-queue's enqueue: that queue also
 * holds scheduleAllNotifications, which syncHaidNotificationsOnce calls —
 * enqueueing here would wait on a job that cannot finish until this returns.
 *
 * A call that arrives while one is already running never starts its own
 * pass; it marks its input as the latest one and shares the in-flight
 * promise. The deferred microtask below (`await Promise.resolve()`) lets a
 * same-tick caller overwrite `latestInput` before the first pass reads it,
 * so the common case — two calls fired together — runs the underlying sync
 * exactly once, for the final state. A call that arrives properly mid-flight
 * (after the read) is still covered: the loop reruns once more for it.
 */
let inFlight: Promise<ExcusedState> | null = null;
let latestInput: HaidSyncInput | null = null;

export async function syncHaidNotifications(input: HaidSyncInput): Promise<ExcusedState> {
  latestInput = input;
  if (inFlight) return inFlight;
  inFlight = runCoalesced();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

async function runCoalesced(): Promise<ExcusedState> {
  await Promise.resolve();
  let result: ExcusedState;
  do {
    const input = latestInput!;
    latestInput = null;
    result = await syncHaidNotificationsOnce(input);
  } while (latestInput);
  return result;
}
