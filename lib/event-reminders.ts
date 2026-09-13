import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { enqueue } from "./notification-queue";
import { readStoredLanguage } from "./notifications";
import { loadEvents, CALENDAR_EVENT_TYPE, eventReminderTriggerDate, reminderBody } from "./calendar-events";
import { IOS_PENDING_BUDGET } from "./notification-horizons";
import { scheduleCalendarAlarms } from "./calendar-alarm";

// CALENDAR_EVENT_TYPE + eventReminderTriggerDate live in calendar-events.ts now
// (shared with lib/calendar-alarm.ts without a circular import). Re-export the
// type tag so app/_layout.tsx's existing import path keeps resolving.
export { CALENDAR_EVENT_TYPE };

// ============ SCHEDULING CAP ============

/**
 * Nearest-N cap: iOS keeps at most 64 pending local notification requests and
 * silently drops the rest, keeping the soonest-firing ones (see
 * lib/notification-horizons.ts). app/_layout.tsx's initNotifications calls
 * rescheduleEventReminders LAST, after the ~10 prayer/adhkaar/reminder
 * schedulers that share that same budget, so this is only the ceiling on top
 * of the dynamic room check below — it stops a mostly-empty budget from
 * handing one user's appointments more slots than any prayer/adhkaar horizon
 * gets.
 */
export const IOS_EVENT_REMINDER_CAP = 5;

/**
 * Slots deliberately left unused out of the real iOS headroom, so calendar
 * reminders can never claim the very last of the shared budget — that margin
 * is reserved for day-to-day variance in the other schedulers.
 */
const IOS_EVENT_SAFETY_MARGIN = 2;

// ============ SCHEDULING ============

type Lang = "nl" | "en" | "ar";

/**
 * Schedule reminders for every event with reminderMinutesBefore set, whose
 * reminder time is still in the future. Cancels this module's own previous
 * reminders first.
 *
 * Decoupled from calendar-events.ts on purpose: addEvent/updateEvent/removeEvent
 * do not call this. The calendar UI (a separate task) is responsible for
 * calling it after any mutation.
 */
export function rescheduleEventReminders(lang?: Lang): Promise<number> {
  return enqueue(() => rescheduleEventRemindersInner(lang));
}

async function rescheduleEventRemindersInner(lang?: Lang): Promise<number> {
  if (Platform.OS === "web") return 0;

  // Android: appointment reminders are full-screen ALARMS (lib/calendar-alarm.ts,
  // Notifee) — Daa3iyah asked for an alarm that shows and rings until dismissed,
  // which expo-notifications can't do (no full-screen intent). Clear any legacy
  // expo calendar reminders a prior version scheduled, then delegate. The
  // expo-notifications path below is iOS-only now.
  if (Platform.OS === "android") {
    await cancelEventReminders();
    return scheduleCalendarAlarms(lang ?? (await readStoredLanguage()));
  }

  // Reached only on iOS now (web and Android returned above): expo-notifications
  // reminder with the default sound — iOS has no full-screen intent.
  await cancelEventReminders();

  // Dynamic iOS cap: fill only whatever budget room the ~10 other launch
  // schedulers (which already ran and share the same 64-request iOS pending
  // cap) left behind, instead of always claiming IOS_EVENT_REMINDER_CAP and
  // starving them. Read AFTER cancelEventReminders() above, so it reflects
  // everyone ELSE's pending requests, not this module's own. Prayer/adhkaar
  // notifications come first; appointments take only the leftover room (on a
  // saturated budget they may schedule 0), re-topped-up on every launch/
  // foreground refresh as prayer horizons roll forward.
  const pending = (await Notifications.getAllScheduledNotificationsAsync()).length;
  const room = Math.max(0, IOS_PENDING_BUDGET - pending - IOS_EVENT_SAFETY_MARGIN);
  const limit = Math.min(IOS_EVENT_REMINDER_CAP, room);

  const language = lang ?? (await readStoredLanguage());
  const events = await loadEvents();
  const now = Date.now();

  const candidates = events
    .filter((e) => e.reminderMinutesBefore != null && !(e.type === "task" && e.done)) // no reminder for a completed task

    .map((event) => ({ event, triggerDate: eventReminderTriggerDate(event) }))
    .filter((c) => c.triggerDate.getTime() > now)
    .sort((a, b) => a.triggerDate.getTime() - b.triggerDate.getTime());

  const toSchedule = candidates.slice(0, limit);

  let scheduledCount = 0;
  for (const { event, triggerDate } of toSchedule) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: event.title,
          body: reminderBody(language),
          data: {
            type: CALENDAR_EVENT_TYPE,
            eventId: event.id,
            url: `/roznama?date=${event.dateISO}`,
            showPopup: true,
          },
          // This path is iOS-only now (Android returns early to the full-screen
          // alarm above), so no Android channelId here.
          sound: "default",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
      scheduledCount++;
    } catch (err) {
      console.warn("Failed to schedule calendar event reminder:", err);
    }
  }

  return scheduledCount;
}

/** Cancel all calendar-event reminders (targeted — leaves other modules' notifications alone). */
export async function cancelEventReminders(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.content.data?.type === CALENDAR_EVENT_TYPE) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch {}
}
