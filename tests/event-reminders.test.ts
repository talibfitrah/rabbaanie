import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";

// Mutable so a single test can flip OS mid-run (mirrors
// tests/ios-notification-budget.test.ts, the repo's pattern for testing
// platform-dependent scheduling behaviour without vi.resetModules()).
const mockPlatform = vi.hoisted(() => ({ OS: "ios" as "ios" | "android" | "web" }));
vi.mock("react-native", () => ({ Platform: mockPlatform }));

const scheduled: any[] = [];
let seq = 0;
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: vi.fn().mockResolvedValue(null),
  scheduleNotificationAsync: vi.fn(async (req: any) => {
    const identifier = `id-${seq++}`;
    scheduled.push({ identifier, content: req.content, trigger: req.trigger });
    return identifier;
  }),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    const i = scheduled.findIndex((s) => s.identifier === id);
    if (i >= 0) scheduled.splice(i, 1);
  }),
  getAllScheduledNotificationsAsync: vi.fn(async () => scheduled.map((s) => ({ ...s }))),
  AndroidImportance: { HIGH: 4, DEFAULT: 3, MAX: 5, LOW: 2, MIN: 1, NONE: 0 },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0, SECRET: -1 },
  SchedulableTriggerInputTypes: { DATE: "date", TIME_INTERVAL: "timeInterval", WEEKLY: "weekly", DAILY: "daily" },
}));

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  },
}));

vi.mock("@/lib/_core/auth", () => ({ getUserInfo: vi.fn().mockResolvedValue(null) }));

// The Android path delegates to the Notifee full-screen alarm scheduler
// (lib/calendar-alarm.ts, which pulls in the native @notifee module). Mock it
// so event-reminders' Android branch is testable without a real device.
vi.mock("../lib/calendar-alarm", () => ({ scheduleCalendarAlarms: vi.fn(async () => 3) }));

import { addEvent } from "../lib/calendar-events";
import { IOS_PENDING_BUDGET } from "../lib/notification-horizons";
import {
  rescheduleEventReminders,
  cancelEventReminders,
  CALENDAR_EVENT_TYPE,
  IOS_EVENT_REMINDER_CAP,
} from "../lib/event-reminders";
import { scheduleCalendarAlarms } from "../lib/calendar-alarm";

/** Pushes `count` dummy pending requests from OTHER (non-calendar) schedulers
 * straight into the mock pending store, simulating how much of the shared iOS
 * budget they already used before rescheduleEventReminders runs. */
function fillOtherPending(count: number) {
  for (let i = 0; i < count; i++) {
    scheduled.push({
      identifier: `other-${i}`,
      content: { data: { type: "prayer" } },
      trigger: { type: "date", date: new Date(2099, 0, 1) },
    });
  }
}

describe("event-reminders (iOS expo path; Android delegates to the full-screen alarm)", () => {
  beforeEach(() => {
    store.clear();
    scheduled.length = 0;
    seq = 0;
    // Default to iOS: the expo-notifications scheduling below is the iOS path.
    // Android reminders are full-screen alarms (lib/calendar-alarm.ts), covered
    // by the delegation test.
    mockPlatform.OS = "ios";
    (scheduleCalendarAlarms as any).mockClear();
  });

  it("schedules a DATE trigger reminderMinutesBefore earlier than the event time", async () => {
    await addEvent({
      title: "Doctor",
      dateISO: "2099-09-10",
      hour: 9,
      minute: 0,
      reminderMinutesBefore: 30,
    });

    const count = await rescheduleEventReminders("en");
    expect(count).toBe(1);
    expect(scheduled).toHaveLength(1);

    const req = scheduled[0];
    expect(req.content.data.type).toBe(CALENDAR_EVENT_TYPE);
    expect(req.content.title).toBe("Doctor");
    expect(req.trigger.type).toBe("date");
    expect(new Date(req.trigger.date)).toEqual(new Date(2099, 8, 10, 8, 30, 0));
  });

  it("carries eventId and the roznama url in data, and sets the iOS sound (no channelId)", async () => {
    const created = await addEvent({
      title: "Doctor",
      dateISO: "2099-09-10",
      hour: 9,
      minute: 0,
      reminderMinutesBefore: 30,
    });

    await rescheduleEventReminders("en");
    const req = scheduled[0];
    expect(req.content.data.eventId).toBe(created.id);
    expect(req.content.data.url).toBe("/roznama?date=2099-09-10");
    expect(req.content.data.showPopup).toBe(true);
    expect(req.content.sound).toBe("default");
    expect(req.content.channelId).toBeUndefined();
  });

  it("schedules nothing when the reminder time has already passed", async () => {
    await addEvent({
      title: "Long past",
      dateISO: "2000-01-01",
      hour: 9,
      minute: 0,
      reminderMinutesBefore: 30,
    });

    const count = await rescheduleEventReminders("en");
    expect(count).toBe(0);
    expect(scheduled).toHaveLength(0);
  });

  it("schedules nothing for events with reminderMinutesBefore = null", async () => {
    await addEvent({
      title: "No reminder",
      dateISO: "2099-09-10",
      hour: 20,
      minute: 0,
      reminderMinutesBefore: null,
    });

    const count = await rescheduleEventReminders("en");
    expect(count).toBe(0);
  });

  it("rescheduling cancels its own previous reminders first (no duplicates)", async () => {
    await addEvent({ title: "Doctor", dateISO: "2099-09-10", hour: 9, minute: 0, reminderMinutesBefore: 30 });
    await rescheduleEventReminders("en");
    expect(scheduled).toHaveLength(1);

    await rescheduleEventReminders("en");
    expect(scheduled).toHaveLength(1);
  });

  it("cancelEventReminders only cancels calendar_event-typed notifications", async () => {
    // A notification from an unrelated module, scheduled directly (bypassing
    // our scheduler) to simulate real coexistence in the OS pending list.
    scheduled.push({
      identifier: "other-1",
      content: { data: { type: "prayer" } },
      trigger: { type: "date", date: new Date(2099, 0, 1) },
    });

    await addEvent({ title: "Doctor", dateISO: "2099-09-10", hour: 9, minute: 0, reminderMinutesBefore: 30 });
    await rescheduleEventReminders("en");
    expect(scheduled.some((s) => s.content.data.type === "prayer")).toBe(true);
    expect(scheduled.some((s) => s.content.data.type === CALENDAR_EVENT_TYPE)).toBe(true);

    await cancelEventReminders();
    expect(scheduled.some((s) => s.content.data.type === "prayer")).toBe(true);
    expect(scheduled.some((s) => s.content.data.type === CALENDAR_EVENT_TYPE)).toBe(false);
  });

  it("delegates to the Notifee full-screen alarm scheduler on Android, not expo", async () => {
    mockPlatform.OS = "android";
    await addEvent({ title: "Doctor", dateISO: "2099-09-10", hour: 9, minute: 0, reminderMinutesBefore: 30 });

    const count = await rescheduleEventReminders("en");
    expect(scheduleCalendarAlarms).toHaveBeenCalledTimes(1);
    expect(count).toBe(3); // the mock's return
    // No expo calendar notification scheduled on Android anymore.
    expect(scheduled.some((s) => s.content?.data?.type === CALENDAR_EVENT_TYPE)).toBe(false);
  });

  it("caps scheduled reminders to the nearest N on iOS", async () => {
    // Added out of chronological order on purpose: a correct cap keeps the
    // soonest-firing reminders, not however many were added first.
    const hours = [16, 9, 14, 10, 15, 11, 13, 12];
    for (const hour of hours) {
      await addEvent({
        title: `Event ${hour}`,
        dateISO: "2099-09-10",
        hour,
        minute: 0,
        reminderMinutesBefore: 10,
      });
    }

    const iosCount = await rescheduleEventReminders("en");
    expect(iosCount).toBe(IOS_EVENT_REMINDER_CAP);

    const iosHours = scheduled
      .filter((s) => s.content.data.type === CALENDAR_EVENT_TYPE)
      .map((s) => new Date(s.trigger.date).getHours())
      .sort((a, b) => a - b);
    // 10 minutes before each event hour, for the 5 chronologically nearest events.
    const expectedHours = [9, 10, 11, 12, 13].slice(0, IOS_EVENT_REMINDER_CAP).map((h) => h - 1);
    expect(iosHours).toEqual(expectedHours);
  });

  it("schedules none on iOS when other schedulers left almost no budget room", async () => {
    // 63 of the 64 iOS pending slots are already spent by other schedulers.
    fillOtherPending(IOS_PENDING_BUDGET - 1);

    for (const hour of [9, 10, 11]) {
      await addEvent({
        title: `Event ${hour}`,
        dateISO: "2099-09-10",
        hour,
        minute: 0,
        reminderMinutesBefore: 10,
      });
    }

    // room = 64 - 63 - 2 (safety margin) = -1 -> clamped to 0.
    const count = await rescheduleEventReminders("en");
    expect(count).toBe(0);
    expect(scheduled.some((s) => s.content.data.type === CALENDAR_EVENT_TYPE)).toBe(false);
  });

  it("schedules only the remaining iOS budget headroom, not the fixed cap, when other schedulers used most of it", async () => {
    // 59 of the 64 iOS pending slots are already spent by other schedulers.
    fillOtherPending(IOS_PENDING_BUDGET - 5);

    for (const hour of [9, 10, 11, 12, 13]) {
      await addEvent({
        title: `Event ${hour}`,
        dateISO: "2099-09-10",
        hour,
        minute: 0,
        reminderMinutesBefore: 10,
      });
    }

    // room = 64 - 59 - 2 (safety margin) = 3, under the fixed cap of 5.
    const count = await rescheduleEventReminders("en");
    expect(count).toBe(3);
    expect(count).toBeLessThan(IOS_EVENT_REMINDER_CAP);
  });

  it("falls back to the stored language when none is passed", async () => {
    store.set("@app_language", "ar");
    await addEvent({ title: "Doctor", dateISO: "2099-09-10", hour: 9, minute: 0, reminderMinutesBefore: 30 });
    await rescheduleEventReminders();
    expect(scheduled[0].content.body).toMatch(/[؀-ۿ]/); // Arabic body text
  });

  it("no-ops on web", async () => {
    mockPlatform.OS = "web";
    await addEvent({ title: "Doctor", dateISO: "2099-09-10", hour: 9, minute: 0, reminderMinutesBefore: 30 });
    const count = await rescheduleEventReminders("en");
    expect(count).toBe(0);
    expect(scheduled).toHaveLength(0);
  });
});
