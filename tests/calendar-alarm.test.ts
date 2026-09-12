import { describe, it, expect, beforeEach, vi } from "vitest";

const mockPlatform = vi.hoisted(() => ({ OS: "android" as "ios" | "android" | "web" }));
vi.mock("react-native", () => ({ Platform: mockPlatform }));

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  },
}));

// Notifee mock: records scheduled triggers/channels; `state` lets a test flip
// the exact-alarm permission (createTriggerNotification throws on the
// SET_ALARM_CLOCK trigger, as Android does when "Alarms & reminders" is off).
const state = vi.hoisted(() => ({ failExact: false, alarmSetting: 1 as number }));
const triggers: any[] = [];
const channels: any[] = [];
vi.mock("@notifee/react-native", () => ({
  default: {
    createChannel: vi.fn(async (c: any) => {
      channels.push(c);
    }),
    createTriggerNotification: vi.fn(async (notification: any, trigger: any) => {
      if (state.failExact && trigger?.alarmManager?.type != null) throw new Error("exact alarm not permitted");
      triggers.push({ notification, trigger });
    }),
    getTriggerNotifications: vi.fn(async () => triggers.map((t) => ({ notification: t.notification }))),
    cancelTriggerNotification: vi.fn(async (id: string) => {
      const i = triggers.findIndex((t) => t.notification.id === id);
      if (i >= 0) triggers.splice(i, 1);
    }),
    getNotificationSettings: vi.fn(async () => ({ android: { alarm: state.alarmSetting } })),
  },
  AndroidImportance: { HIGH: 4, MAX: 5, DEFAULT: 3 },
  AndroidVisibility: { PRIVATE: 0, PUBLIC: 1 },
  AndroidCategory: { ALARM: "alarm" },
  TriggerType: { TIMESTAMP: 0 },
  AlarmType: { SET_ALARM_CLOCK: 3 },
}));

vi.mock("../lib/fullscreen-notif", () => ({ openAlarmPermission: vi.fn() }));

import { addEvent } from "../lib/calendar-events";
import { scheduleCalendarAlarms, cancelCalendarAlarms, ensureExactAlarmAllowed } from "../lib/calendar-alarm";

describe("calendar-alarm (Android full-screen appointment alarms)", () => {
  beforeEach(() => {
    store.clear();
    triggers.length = 0;
    channels.length = 0;
    state.failExact = false;
    state.alarmSetting = 1;
    mockPlatform.OS = "android";
  });

  it("schedules a full-screen exact ALARM for a future event with a reminder", async () => {
    await addEvent({ title: "Dentist", dateISO: "2099-09-10", hour: 9, minute: 0, reminderMinutesBefore: 30 });

    const n = await scheduleCalendarAlarms("en");
    expect(n).toBe(1);
    expect(triggers).toHaveLength(1);

    const { notification, trigger } = triggers[0];
    expect(notification.id.startsWith("cal_alarm_")).toBe(true);
    expect(notification.android.category).toBe("alarm");
    expect(notification.android.fullScreenAction).toEqual({ id: "default" });
    expect(notification.android.loopSound).toBe(true);
    expect(trigger.alarmManager.type).toBe(3); // SET_ALARM_CLOCK (exact)
    // 09:00 minus 30 min = 08:30 local.
    expect(new Date(trigger.timestamp)).toEqual(new Date(2099, 8, 10, 8, 30, 0));
  });

  it("skips past events and events without a reminder", async () => {
    await addEvent({ title: "Past", dateISO: "2000-01-01", hour: 9, minute: 0, reminderMinutesBefore: 30 });
    await addEvent({ title: "No reminder", dateISO: "2099-09-10", hour: 9, minute: 0, reminderMinutesBefore: null });

    const n = await scheduleCalendarAlarms("en");
    expect(n).toBe(0);
    expect(triggers).toHaveLength(0);
  });

  it("falls back to an inexact (allowWhileIdle) trigger when the exact alarm is rejected", async () => {
    state.failExact = true; // "Alarms & reminders" permission off
    await addEvent({ title: "Dentist", dateISO: "2099-09-10", hour: 9, minute: 0, reminderMinutesBefore: 30 });

    const n = await scheduleCalendarAlarms("en");
    expect(n).toBe(1); // still scheduled, not silently dropped
    expect(triggers).toHaveLength(1);
    expect(triggers[0].trigger.alarmManager.type).toBeUndefined();
    expect(triggers[0].trigger.alarmManager.allowWhileIdle).toBe(true);
  });

  it("cancel removes only this module's (cal_alarm_-prefixed) triggers", async () => {
    triggers.push({ notification: { id: "prayer_1" }, trigger: {} }); // a foreign trigger
    await addEvent({ title: "Dentist", dateISO: "2099-09-10", hour: 9, minute: 0, reminderMinutesBefore: 30 });
    await scheduleCalendarAlarms("en");
    expect(triggers.some((t) => t.notification.id === "prayer_1")).toBe(true);
    expect(triggers.some((t) => t.notification.id.startsWith("cal_alarm_"))).toBe(true);

    await cancelCalendarAlarms();
    expect(triggers.some((t) => t.notification.id === "prayer_1")).toBe(true);
    expect(triggers.some((t) => t.notification.id.startsWith("cal_alarm_"))).toBe(false);
  });

  it("reschedule replaces its own previous alarms (no duplicates)", async () => {
    await addEvent({ title: "Dentist", dateISO: "2099-09-10", hour: 9, minute: 0, reminderMinutesBefore: 30 });
    await scheduleCalendarAlarms("en");
    expect(triggers).toHaveLength(1);
    await scheduleCalendarAlarms("en");
    expect(triggers).toHaveLength(1);
  });

  it("ensureExactAlarmAllowed is false only when the alarm setting is explicitly disabled", async () => {
    state.alarmSetting = 1;
    expect(await ensureExactAlarmAllowed()).toBe(true);
    state.alarmSetting = -1; // NOT_SUPPORTED (older Android) -> allowed
    expect(await ensureExactAlarmAllowed()).toBe(true);
    state.alarmSetting = 0; // DISABLED
    expect(await ensureExactAlarmAllowed()).toBe(false);
  });
});
