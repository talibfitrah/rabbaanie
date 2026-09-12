/**
 * Full-screen ALARM reminders for roznama appointments (Android, Notifee).
 *
 * Daa3iyah asked (msg 2922/2924) for the appointment reminder to be an alarm
 * that shows and rings until dismissed, not a quiet notification. Same proven
 * mechanism as lib/fullscreen-notif.ts: category ALARM + fullScreenAction +
 * alarmManager SET_ALARM_CLOCK is what makes Android fire it in Doze and show
 * it centre-screen over the lock screen. Requires USE_FULL_SCREEN_INTENT (the
 * sideload build has it; Play strips it → demoted to a heads-up banner).
 *
 * Android only. iOS keeps the expo-notifications reminder in event-reminders.ts.
 */
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidCategory,
  TriggerType,
  AlarmType,
  type TimestampTrigger,
} from "@notifee/react-native";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadEvents, type CalendarEvent } from "./calendar-events";

// ============ SOUND OPTIONS ============
// Deliberately NOT the adhan (see withAdhanSoundResources in app.config.ts):
// the call to prayer must not become an appointment ringtone. "default" is the
// system sound; the rest are the bundled nature MP3s (res/raw/<id>.mp3).
export type CalendarSound =
  | "default"
  | "water_stream"
  | "birds_chirp"
  | "wind_gentle"
  | "rain_soft";

export const CALENDAR_SOUND_OPTIONS: {
  id: CalendarSound;
  nameAr: string;
  nameNl: string;
  nameEn: string;
}[] = [
  { id: "default", nameAr: "النغمة الافتراضية", nameNl: "Standaardtoon", nameEn: "Default tone" },
  { id: "water_stream", nameAr: "خرير الماء", nameNl: "Stromend water", nameEn: "Water stream" },
  { id: "birds_chirp", nameAr: "زقزقة العصافير", nameNl: "Vogelgezang", nameEn: "Birds chirping" },
  { id: "wind_gentle", nameAr: "نسيم هادئ", nameNl: "Zachte wind", nameEn: "Gentle breeze" },
  { id: "rain_soft", nameAr: "قطرات المطر", nameNl: "Zachte regen", nameEn: "Soft rain" },
];

const VALID_SOUNDS = CALENDAR_SOUND_OPTIONS.map((o) => o.id) as string[];
const SOUND_KEY = "@calendar_reminder_sound";
const DEFAULT_SOUND: CalendarSound = "default";

export async function loadCalendarSound(): Promise<CalendarSound> {
  try {
    const v = await AsyncStorage.getItem(SOUND_KEY);
    if (v && VALID_SOUNDS.includes(v)) return v as CalendarSound;
  } catch {}
  return DEFAULT_SOUND;
}

export async function saveCalendarSound(sound: CalendarSound): Promise<void> {
  try {
    await AsyncStorage.setItem(SOUND_KEY, sound);
  } catch {}
}

// ============ CHANNELS ============
// One immutable channel per sound — Android never lets a channel's sound change,
// so switching the preference means switching which channel is used (same
// reasoning as prayerChannelId in lib/notifications.ts).
function channelId(sound: CalendarSound): string {
  return `calendar_alarm_v1_${sound}`;
}

export async function ensureCalendarAlarmChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  for (const { id } of CALENDAR_SOUND_OPTIONS) {
    await notifee.createChannel({
      id: channelId(id),
      name: `تذكيرات المواعيد / Appointment alarms (${id})`,
      importance: AndroidImportance.HIGH,
      sound: id, // "default" → system sound; nature id → res/raw/<id>.mp3
      vibration: true,
      // Appointment titles are personal — keep them off a bystander lock screen
      // (matches the old calendar_events_v1 channel's PRIVATE choice).
      visibility: AndroidVisibility.PRIVATE,
    });
  }
}

// ============ SCHEDULING ============
type Lang = "nl" | "en" | "ar";

function reminderBody(lang: Lang): string {
  return lang === "ar"
    ? "تذكير بموعدك"
    : lang === "en"
    ? "Reminder for your appointment"
    : "Herinnering voor je afspraak";
}

// Prefix on every notification id so cancel touches only THIS module's alarms.
const ID_PREFIX = "cal_alarm_";

/** Event's local wall-clock time minus its reminder offset (ms). */
function triggerMs(event: CalendarEvent): number {
  const [y, m, d] = event.dateISO.split("-").map(Number);
  const at = new Date(y, m - 1, d, event.hour, event.minute, 0, 0);
  return at.getTime() - (event.reminderMinutesBefore ?? 0) * 60000;
}

/** Cancel only this module's scheduled alarms (id-prefixed). */
export async function cancelCalendarAlarms(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const pending = await notifee.getTriggerNotifications();
    for (const t of pending) {
      const id = t.notification.id;
      if (id && id.startsWith(ID_PREFIX)) {
        await notifee.cancelTriggerNotification(id);
      }
    }
  } catch (err) {
    console.warn("[calendar-alarm] cancel failed:", err);
  }
}

/**
 * Reschedule a full-screen alarm for every future event that has a reminder.
 * Cancels this module's previous alarms first. Returns how many were scheduled.
 */
export async function scheduleCalendarAlarms(lang: Lang): Promise<number> {
  if (Platform.OS !== "android") return 0;
  await ensureCalendarAlarmChannels();
  await cancelCalendarAlarms();

  const sound = await loadCalendarSound();
  const events = await loadEvents();
  const now = Date.now();
  const due = events
    .filter((e) => e.reminderMinutesBefore != null)
    .map((e) => ({ e, ms: triggerMs(e) }))
    .filter((c) => c.ms > now);

  let n = 0;
  for (const { e, ms } of due) {
    try {
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: ms,
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      };
      await notifee.createTriggerNotification(
        {
          id: `${ID_PREFIX}${e.id}`,
          title: e.title,
          body: reminderBody(lang),
          data: { type: "calendar_event", eventId: e.id, url: `/roznama?date=${e.dateISO}` },
          android: {
            channelId: channelId(sound),
            importance: AndroidImportance.HIGH,
            category: AndroidCategory.ALARM,
            fullScreenAction: { id: "default" },
            pressAction: { id: "default" },
            autoCancel: true,
            // Ring until dismissed (owner requirement) — the channel sound
            // otherwise plays once. Stops when the notification is tapped
            // (autoCancel) or swiped away.
            loopSound: true,
          },
        },
        trigger,
      );
      n++;
    } catch (err) {
      console.warn("[calendar-alarm] schedule failed:", err);
    }
  }
  return n;
}
