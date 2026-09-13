import AsyncStorage from "@react-native-async-storage/async-storage";

// ============ TYPES ============

// Calendar entry kind (Daa3iyah 2982/2986): a general event, a to-do task, or an
// act of worship (عبادة, which replaces the Google-Calendar "birthday" type).
export type CalendarEntryType = "event" | "task" | "worship";

export interface CalendarEvent {
  id: string;
  title: string;
  dateISO: string; // "YYYY-MM-DD" (local calendar day)
  hour: number; // 0-23
  minute: number; // 0-59
  note?: string;
  reminderMinutesBefore: number | null; // null = no reminder
  reminderIsCustom?: boolean; // true = a custom minutes-before the user set (not a preset chip) (2963)
  location?: string; // appointment place, entered manually or looked up via maps (2963)
  lat?: number; // exact picked coordinates (2972); present only when set via the map picker
  lng?: number;
  travelCity?: string; // set only when the user overrides a Jumu'ah-time block by travelling (2929)
  type?: CalendarEntryType; // undefined = "event" (back-compat with pre-2982 entries)
  done?: boolean; // task completion, for type "task" (2982)
  allDay?: boolean; // "طوال اليوم" — no specific time; hour/minute ignored for display (2982)
  endHour?: number; // optional end time (2982); undefined = no explicit end
  endMinute?: number;
  color?: string; // optional entry color (hex), for at-a-glance grouping (2982)
}

// ============ STORAGE ============

const CALENDAR_EVENTS_KEY = "@calendar_events";

/**
 * Serializes every mutator's read-modify-write so two overlapping calls (e.g.
 * a rapid add + delete from the calendar screen) run atomically instead of
 * both reading the same stale list and one save clobbering the other.
 * ponytail: one module-wide lock, not per-event — there is only one stored
 * list here, so a finer-grained lock would add complexity nothing needs.
 */
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function isValidEvent(e: any): e is CalendarEvent {
  return (
    e &&
    typeof e.id === "string" &&
    typeof e.title === "string" &&
    typeof e.dateISO === "string" &&
    typeof e.hour === "number" &&
    typeof e.minute === "number"
  );
}

/**
 * Read used by mutators. A genuine AsyncStorage I/O error PROPAGATES here, so
 * a failed read aborts the mutation instead of falling back to [] and saving
 * over every existing event. Missing data, invalid JSON, and valid-JSON-wrong
 * shape (`"null"`, `"{}"`, a non-array) are still tolerated as [].
 */
async function readStrict(): Promise<CalendarEvent[]> {
  const raw = await AsyncStorage.getItem(CALENDAR_EVENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEvent);
  } catch {
    return [];
  }
}

/** Display-path read: also tolerant of a transient AsyncStorage I/O error. */
export async function loadEvents(): Promise<CalendarEvent[]> {
  try {
    return await readStrict();
  } catch {
    return [];
  }
}

export async function saveEvents(list: CalendarEvent[]): Promise<void> {
  await AsyncStorage.setItem(CALENDAR_EVENTS_KEY, JSON.stringify(list));
}

function generateEventId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function addEvent(data: Omit<CalendarEvent, "id">): Promise<CalendarEvent> {
  return serialize(async () => {
    const list = await readStrict();
    const event: CalendarEvent = { ...data, id: generateEventId() };
    await saveEvents([...list, event]);
    return event;
  });
}

export async function updateEvent(
  id: string,
  patch: Partial<Omit<CalendarEvent, "id">>
): Promise<CalendarEvent | null> {
  return serialize(async () => {
    const list = await readStrict();
    let updated: CalendarEvent | null = null;
    const next = list.map((e) => {
      if (e.id !== id) return e;
      updated = { ...e, ...patch };
      return updated;
    });
    if (updated) await saveEvents(next);
    return updated;
  });
}

export async function removeEvent(id: string): Promise<void> {
  return serialize(async () => {
    const list = await readStrict();
    await saveEvents(list.filter((e) => e.id !== id));
  });
}

export async function eventsForDate(dateISO: string): Promise<CalendarEvent[]> {
  const list = await loadEvents();
  return list
    .filter((e) => e.dateISO === dateISO)
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

// ============ REMINDER HELPERS (shared by event-reminders.ts + calendar-alarm.ts) ============

/** Type tag on calendar reminder notifications — tap routing + foreground filter. */
export const CALENDAR_EVENT_TYPE = "calendar_event";

/** Event's local wall-clock time, minus its reminder offset. */
export function eventReminderTriggerDate(event: CalendarEvent): Date {
  const [year, month, day] = event.dateISO.split("-").map(Number);
  // ponytail: naive local Date() — a spring-forward-gap wall time (e.g. 02:30
  // on the DST night) normalizes to 03:30; acceptable for personal
  // appointments, no IANA tz lib.
  const eventDate = new Date(year, month - 1, day, event.hour, event.minute, 0, 0);
  return new Date(eventDate.getTime() - (event.reminderMinutesBefore ?? 0) * 60000);
}

/** Localized body text for a calendar reminder notification. */
export function reminderBody(lang: "nl" | "en" | "ar"): string {
  return lang === "ar"
    ? "تذكير بموعدك"
    : lang === "en"
    ? "Reminder for your appointment"
    : "Herinnering voor je afspraak";
}
