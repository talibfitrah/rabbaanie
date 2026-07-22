import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock expo-notifications
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: vi.fn().mockResolvedValue(null),
  getPermissionsAsync: vi.fn().mockResolvedValue({ status: "granted" }),
  requestPermissionsAsync: vi.fn().mockResolvedValue({ status: "granted" }),
  scheduleNotificationAsync: vi.fn().mockResolvedValue("notif-id-123"),
  cancelAllScheduledNotificationsAsync: vi.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: vi.fn().mockResolvedValue([]),
  AndroidImportance: { HIGH: 4, DEFAULT: 3, MAX: 5, LOW: 2, MIN: 1, NONE: 0 },
  AndroidNotificationPriority: { MAX: "max", HIGH: "high", DEFAULT: "default", LOW: "low", MIN: "min" },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0, SECRET: -1 },
  SchedulableTriggerInputTypes: { DATE: "date", TIME_INTERVAL: "timeInterval", WEEKLY: "weekly", DAILY: "daily" },
}));

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock react-native Platform
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

import {
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  saveNotificationPrefs,
  setupNotificationChannels,
  requestNotificationPermissions,
  scheduleAllNotifications,
  getScheduledCount,
  type NotificationPrefs,
} from "../lib/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

describe("Notifications module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DEFAULT_NOTIFICATION_PREFS", () => {
    it("has correct default values", () => {
      expect(DEFAULT_NOTIFICATION_PREFS.enabled).toBe(true);
      expect(DEFAULT_NOTIFICATION_PREFS.minutesBefore).toBe(5);
      expect(DEFAULT_NOTIFICATION_PREFS.prayers.fajr).toBe(true);
      expect(DEFAULT_NOTIFICATION_PREFS.prayers.sunrise).toBe(false);
      expect(DEFAULT_NOTIFICATION_PREFS.prayers.dhuhr).toBe(true);
      expect(DEFAULT_NOTIFICATION_PREFS.adhkaar.morning).toBe(true);
      expect(DEFAULT_NOTIFICATION_PREFS.adhkaar.evening).toBe(true);
    });
  });

  describe("loadNotificationPrefs", () => {
    it("returns defaults when nothing is stored", async () => {
      (AsyncStorage.getItem as any).mockResolvedValue(null);
      const prefs = await loadNotificationPrefs();
      expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
    });

    it("returns stored prefs merged with defaults", async () => {
      const stored: Partial<NotificationPrefs> = { enabled: true, minutesBefore: 10 };
      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(stored));
      const prefs = await loadNotificationPrefs();
      expect(prefs.enabled).toBe(true);
      expect(prefs.minutesBefore).toBe(10);
      expect(prefs.prayers.fajr).toBe(true); // from defaults
    });

    it("handles corrupted JSON gracefully", async () => {
      (AsyncStorage.getItem as any).mockResolvedValue("not-json");
      const prefs = await loadNotificationPrefs();
      expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
    });
  });

  describe("saveNotificationPrefs", () => {
    it("saves prefs to AsyncStorage", async () => {
      const prefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, enabled: true };
      await saveNotificationPrefs(prefs);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        "@notification_prefs",
        JSON.stringify(prefs)
      );
    });
  });

  describe("setupNotificationChannels", () => {
    it("creates channels on Android", async () => {
      await setupNotificationChannels();
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(3);
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        "prayer_times",
        expect.objectContaining({ name: "Gebedstijden / Prayer Times" })
      );
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        "adhkaar_reminders",
        expect.objectContaining({ name: "Adhkaar Herinneringen / Adhkaar Reminders" })
      );
    });
  });

  describe("requestNotificationPermissions", () => {
    it("returns true when permission is granted", async () => {
      (Notifications.getPermissionsAsync as any).mockResolvedValue({ status: "granted" });
      const result = await requestNotificationPermissions();
      expect(result).toBe(true);
    });

    it("requests permission when not granted and returns result", async () => {
      (Notifications.getPermissionsAsync as any).mockResolvedValue({ status: "undetermined" });
      (Notifications.requestPermissionsAsync as any).mockResolvedValue({ status: "granted" });
      const result = await requestNotificationPermissions();
      expect(result).toBe(true);
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    });

    it("returns false when permission is denied", async () => {
      (Notifications.getPermissionsAsync as any).mockResolvedValue({ status: "undetermined" });
      (Notifications.requestPermissionsAsync as any).mockResolvedValue({ status: "denied" });
      const result = await requestNotificationPermissions();
      expect(result).toBe(false);
    });
  });

  describe("scheduleAllNotifications", () => {
    it("cancels all and returns 0 when disabled", async () => {
      (AsyncStorage.getItem as any).mockImplementation((key: string) => {
        if (key === "@notification_prefs") return JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, enabled: false });
        if (key === "@prayer_location") return JSON.stringify({ country: "Nederland", city: "Amsterdam", lat: 52.37, lng: 4.89, tz: "Europe/Amsterdam" });
        if (key === "@prayer_method") return "uoif";
        return null;
      });
      const count = await scheduleAllNotifications("nl");
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it("returns 0 when no location is set", async () => {
      (AsyncStorage.getItem as any).mockImplementation((key: string) => {
        if (key === "@notification_prefs") return JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true });
        if (key === "@prayer_location") return null;
        return null;
      });
      const count = await scheduleAllNotifications("nl");
      expect(count).toBe(0);
    });

    it("schedules notifications when enabled with location", async () => {
      (AsyncStorage.getItem as any).mockImplementation((key: string) => {
        if (key === "@notification_prefs") return JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true });
        if (key === "@prayer_location") return JSON.stringify({ country: "Nederland", city: "Amsterdam", lat: 52.37, lng: 4.89, tz: "Europe/Amsterdam" });
        if (key === "@prayer_method") return "uoif";
        return null;
      });
      const count = await scheduleAllNotifications("nl");
      // Should schedule multiple notifications (prayers + adhkaar for 7 days)
      expect(count).toBeGreaterThan(0);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    });
  });

  describe("getScheduledCount", () => {
    it("returns the count of scheduled notifications", async () => {
      (Notifications.getAllScheduledNotificationsAsync as any).mockResolvedValue([
        { id: "1" }, { id: "2" }, { id: "3" },
      ]);
      const count = await getScheduledCount();
      expect(count).toBe(3);
    });
  });
});
