import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock expo-notifications (same shape as tests/notifications.test.ts)
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: vi.fn().mockResolvedValue(null),
  scheduleNotificationAsync: vi.fn().mockResolvedValue("notif-id-checkin"),
  cancelScheduledNotificationAsync: vi.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: vi.fn().mockResolvedValue([]),
  AndroidImportance: { HIGH: 4, DEFAULT: 3, MAX: 5, LOW: 2, MIN: 1, NONE: 0 },
  AndroidNotificationPriority: { MAX: "max", HIGH: "high", DEFAULT: "default", LOW: "low", MIN: "min" },
  SchedulableTriggerInputTypes: { DATE: "date", TIME_INTERVAL: "timeInterval", WEEKLY: "weekly", DAILY: "daily" },
}));

// Mock AsyncStorage (transitively required by ./daily-advice-notification's
// ./advice-prefs import)
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { scheduleDailyCheckinNotification } from "../lib/daily-checkin-notification";

describe("scheduleDailyCheckinNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Notifications.getAllScheduledNotificationsAsync as any).mockResolvedValue([]);
  });

  it("schedules a DAILY-trigger reminder that deep-links to the home tab", async () => {
    const result = await scheduleDailyCheckinNotification("nl");
    expect(result).toBe(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          data: expect.objectContaining({ type: "daily_checkin_reminder", url: "/(tabs)" }),
        }),
        trigger: expect.objectContaining({ type: "daily" }),
      }),
    );
  });

  it("cancels a previously-scheduled check-in reminder before rescheduling, and leaves other types alone", async () => {
    (Notifications.getAllScheduledNotificationsAsync as any).mockResolvedValue([
      { identifier: "old-checkin", content: { data: { type: "daily_checkin_reminder" } } },
      { identifier: "other", content: { data: { type: "daily_advice" } } },
    ]);
    await scheduleDailyCheckinNotification("nl");
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("old-checkin");
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith("other");
  });

  it("uses trilingual title text (nl/en/ar)", async () => {
    await scheduleDailyCheckinNotification("ar");
    let call = (Notifications.scheduleNotificationAsync as any).mock.calls[0][0];
    expect(call.content.title).toBe("التقييم اليومي");

    vi.clearAllMocks();
    (Notifications.getAllScheduledNotificationsAsync as any).mockResolvedValue([]);
    await scheduleDailyCheckinNotification("en");
    call = (Notifications.scheduleNotificationAsync as any).mock.calls[0][0];
    expect(call.content.title).toBe("Daily Check-in");

    vi.clearAllMocks();
    (Notifications.getAllScheduledNotificationsAsync as any).mockResolvedValue([]);
    await scheduleDailyCheckinNotification("nl");
    call = (Notifications.scheduleNotificationAsync as any).mock.calls[0][0];
    expect(call.content.title).toBe("Dagelijkse check-in");
  });

  it("skips scheduling when the pref is disabled, but still cancels any existing check-in notification", async () => {
    (Notifications.getAllScheduledNotificationsAsync as any).mockResolvedValue([
      { identifier: "old-checkin", content: { data: { type: "daily_checkin_reminder" } } },
    ]);
    (AsyncStorage.getItem as any).mockResolvedValueOnce(JSON.stringify({ enabled: false }));

    const result = await scheduleDailyCheckinNotification("nl");

    expect(result).toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("old-checkin");
  });
});
