import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { enqueue } from "./notification-queue";
import { readStoredLanguage } from "./notifications";
import { loadEvents, type CalendarEvent } from "./calendar-events";
import { IOS_PENDING_BUDGET } from "./notification-horizons";
import { scheduleCalendarAlarms } from "./calendar-alarm";

// ============ NOTIFICATION TYPE ============

export const CALENDAR_EVENT_TYPE = "calendar_event";

// ============ ANDROID CHANNEL ============

export const CALENDAR_EVENTS_CHANNEL_ID = "calendar_events_v1";

export async function setupCalendarEventChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(CALENDAR_EVENTS_CHANNEL_ID, {
    name: "تذكيرات الروزنامة / Calendar Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    bypassDnd: true,
    // PRIVATE, not PUBLIC: appointment titles are personal (e.g. a clinic
    // name) and must not show on a locked screen.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    enableLights: true,
    lightColor: "#7C3AED",
  });
}

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

function reminderBody(lang: Lang): string {
  return lang === "ar"
    ? "تذكير بموعدك"
    : lang === "en"
    ? "Reminder for your appointment"
    : "Herinnering voor je afspraak";
}

/** Event's local wall-clock time, minus its reminder offset. */
function eventReminderTriggerDate(event: CalendarEvent): Date {
  const [year, month, day] = event.dateISO.split("-").map(Number);
  // ponytail: naive local Date() — a spring-forward-gap wall time (e.g. 02:30
  // on the DST night) normalizes to 03:30; acceptable for personal
  // appointments, no IANA tz lib.
  const eventDate = new Date(year, month - 1, day, event.hour, event.minute, 0, 0);
  return new Date(eventDate.getTime() - (event.reminderMinutesBefore ?? 0) * 60000);
}

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

  // Ensure the Android channel exists before scheduling: this runs at launch
  // (initNotifications) too, i.e. before Roznama has necessarily mounted, so the
  // scheduler can't rely on the screen's setup. Idempotent; no-ops on iOS.
  await setupCalendarEventChannel();
  await cancelEventReminders();

  // Dynamic iOS cap: fill only whatever budget room the ~10 other launch
  // schedulers (which already ran and share the same 64-request iOS pending
  // cap) left behind, instead of always claiming IOS_EVENT_REMINDER_CAP and
  // starving them. getAllScheduledNotificationsAsync() is read AFTER
  // cancelEventReminders() above, so it reflects everyone ELSE's pending
  // requests, not this module's own. Deliberate priority: prayer/adhkar
  // notifications come first and appointment reminders take only the leftover
  // room (on a saturated iOS budget they may schedule 0). They are re-topped-up
  // on every launch/foreground refresh (initNotifications calls this), so slots
  // freed as prayer horizons roll forward get reclaimed. Android is uncapped.
  let limit: number;
  if (Platform.OS === "ios") {
    const pending = (await Notifications.getAllScheduledNotificationsAsync()).length;
    const room = Math.max(0, IOS_PENDING_BUDGET - pending - IOS_EVENT_SAFETY_MARGIN);
    limit = Math.min(IOS_EVENT_REMINDER_CAP, room);
  } else {
    limit = Infinity; // Android has no OS-level pending-request cap.
  }

  const language = lang ?? (await readStoredLanguage());
  const events = await loadEvents();
  const now = Date.now();

  const candidates = events
    .filter((e) => e.reminderMinutesBefore != null)
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
