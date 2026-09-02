import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock expo-notifications
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: vi.fn().mockResolvedValue(null),
  getPermissionsAsync: vi.fn().mockResolvedValue({ status: "granted" }),
  requestPermissionsAsync: vi.fn().mockResolvedValue({ status: "granted" }),
  scheduleNotificationAsync: vi.fn().mockResolvedValue("notif-id-123"),
  cancelAllScheduledNotificationsAsync: vi.fn().mockResolvedValue(undefined),
  cancelScheduledNotificationAsync: vi.fn().mockResolvedValue(undefined),
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

// scheduleAllNotificationsInner now resolves the haid prayer-pause itself when
// no skipPrayersUntil is passed (item A) — reads the user id the way
// app/_layout.tsx does. Default to "no user", so every pre-existing test below
// (none of them exercise the haid pause) keeps today's unpaused behaviour.
vi.mock("@/lib/_core/auth", () => ({ getUserInfo: vi.fn().mockResolvedValue(null) }));

import {
  prayerChannelId,
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  saveNotificationPrefs,
  setupNotificationChannels,
  requestNotificationPermissions,
  scheduleAllNotifications,
  cancelScheduleAllNotifications,
  getScheduledCount,
  sendTestNotification,
  HAID_CHANNEL_ID,
  type NotificationPrefs,
} from "../lib/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as NativeAuth from "@/lib/_core/auth";

describe("Notifications module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DEFAULT_NOTIFICATION_PREFS", () => {
    it("has correct default values", () => {
      expect(DEFAULT_NOTIFICATION_PREFS.enabled).toBe(true);
      expect(DEFAULT_NOTIFICATION_PREFS.minutesBefore).toBe(5);
      expect(DEFAULT_NOTIFICATION_PREFS.prayers.fajr).toBe(true);
      expect(DEFAULT_NOTIFICATION_PREFS.prayers.sunrise).toBe(true);
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

    it("clamps an out-of-range stored minutesBefore down to 10", async () => {
      const stored: Partial<NotificationPrefs> = { minutesBefore: 45 };
      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(stored));
      const prefs = await loadNotificationPrefs();
      expect(prefs.minutesBefore).toBe(10);
    });

    it("clamps an out-of-range stored minutesBefore up to 1", async () => {
      const stored: Partial<NotificationPrefs> = { minutesBefore: 0 };
      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(stored));
      const prefs = await loadNotificationPrefs();
      expect(prefs.minutesBefore).toBe(1);
    });

    it("does not let a non-numeric stored minutesBefore produce NaN", async () => {
      const stored = { minutesBefore: "banana" };
      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(stored));
      const prefs = await loadNotificationPrefs();
      expect(Number.isNaN(prefs.minutesBefore)).toBe(false);
      expect(prefs.minutesBefore).toBe(DEFAULT_NOTIFICATION_PREFS.minutesBefore);
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
    it("creates one prayer channel per adhan sound, plus adhkaar, weekly and haid", async () => {
      await setupNotificationChannels();
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(6);
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        prayerChannelId("takbeer_1"),
        expect.objectContaining({ sound: "takbeer_1" })
      );
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        prayerChannelId("takbeer_2"),
        expect.objectContaining({ sound: "takbeer_2" })
      );
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        prayerChannelId("takbeer_3"),
        expect.objectContaining({ sound: "takbeer_3" })
      );
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        "adhkaar_reminders_v2",
        expect.objectContaining({ name: "Adhkaar Herinneringen / Adhkaar Reminders" })
      );
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        HAID_CHANNEL_ID,
        expect.objectContaining({ importance: Notifications.AndroidImportance.HIGH })
      );
    });

    // C14: «هل طهرتِ؟» / «الطهر متوقَّع اليوم» must not be readable by a
    // bystander on a locked device — the channel itself must not be PUBLIC.
    it("locks the haid channel to a private lock-screen visibility", async () => {
      await setupNotificationChannels();
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        HAID_CHANNEL_ID,
        expect.objectContaining({ lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE })
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
    it("still schedules mandatory prayers even when the stored master flag is off", async () => {
      (AsyncStorage.getItem as any).mockImplementation((key: string) => {
        if (key === "@notification_prefs") return JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, enabled: false });
        if (key === "@prayer_location") return JSON.stringify({ country: "Nederland", city: "Amsterdam", lat: 52.37, lng: 4.89, tz: "Europe/Amsterdam" });
        if (key === "@prayer_method") return "uoif";
        return null;
      });
      const count = await scheduleAllNotifications("nl");
      expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
      // Prayer reminders are obligatory: loadNotificationPrefs coerces `enabled`
      // and the 5 fard prayers back on, so scheduling proceeds regardless.
      expect(count).toBeGreaterThan(0);
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

    it("also registers the daily check-in reminder, next to the daily advice notification", async () => {
      (AsyncStorage.getItem as any).mockImplementation((key: string) => {
        if (key === "@notification_prefs") return JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true });
        if (key === "@prayer_location") return JSON.stringify({ country: "Nederland", city: "Amsterdam", lat: 52.37, lng: 4.89, tz: "Europe/Amsterdam" });
        if (key === "@prayer_method") return "uoif";
        return null;
      });
      await scheduleAllNotifications("nl");
      const checkinCalls = (Notifications.scheduleNotificationAsync as any).mock.calls
        .map((c: any[]) => c[0])
        .filter((call: any) => call.content?.data?.type === "daily_checkin_reminder");
      expect(checkinCalls.length).toBe(1);
      expect(checkinCalls[0].content.data.url).toBe("/(tabs)");
      expect(checkinCalls[0].trigger.type).toBe("daily");
    });

    /**
     * It used to call cancelAllScheduledNotificationsAsync(), which deleted the
     * schedules of every other module too — iqaamah silence, iman, islamic
     * reminders, weekly goals, spouse advice. Whichever scheduler ran last was
     * the only one whose alarms survived.
     */
    it("cancels its own prayer and adhkaar notifications and no one else's", async () => {
      (AsyncStorage.getItem as any).mockImplementation((key: string) => {
        if (key === "@notification_prefs") return JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true });
        if (key === "@prayer_location") return null; // stop before scheduling; only the cancel pass matters here
        return null;
      });
      (Notifications.getAllScheduledNotificationsAsync as any).mockResolvedValue([
        { identifier: "prayer-1", content: { data: { type: "prayer" } } },
        { identifier: "iqamah-1", content: { data: { type: "iqamah_silence" } } },
        { identifier: "adhkaar-1", content: { data: { type: "adhkaar" } } },
        { identifier: "iman-1", content: { data: { type: "iman_daily" } } },
        { identifier: "advice-1", content: { data: { type: "daily_advice" } } },
        { identifier: "no-data-1", content: {} },
      ]);

      await scheduleAllNotifications("nl");

      expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
      const cancelled = (Notifications.cancelScheduledNotificationAsync as any).mock.calls.map((c: any[]) => c[0]);
      expect(cancelled).toEqual(["prayer-1", "adhkaar-1"]);
    });

    /**
     * Read-cancel-schedule is not atomic. Before the queue, a settings toggle
     * racing the boot-path call interleaved two runs into double-scheduled
     * alarms. The second run must not start its read until the first finishes.
     */
    it("serializes concurrent runs", async () => {
      (AsyncStorage.getItem as any).mockImplementation((key: string) => {
        if (key === "@notification_prefs") return JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true });
        if (key === "@prayer_location") return null; // stop after the cancel pass
        return null;
      });

      const starts: string[] = [];
      let releaseFirst!: () => void;
      (Notifications.getAllScheduledNotificationsAsync as any)
        .mockImplementationOnce(() => {
          starts.push("first");
          return new Promise((res) => { releaseFirst = () => res([]); });
        })
        .mockImplementationOnce(() => {
          starts.push("second");
          return Promise.resolve([]);
        });

      const a = scheduleAllNotifications("nl");
      await Promise.resolve(); // let the first run reach its read
      const b = scheduleAllNotifications("nl");
      await Promise.resolve();
      expect(starts).toEqual(["first"]); // second run still queued
      releaseFirst();
      await Promise.all([a, b]);
      expect(starts).toEqual(["first", "second"]);
    });
  });

  /**
   * Item A (haid tracker): scheduleAllNotifications is called from ~10 places
   * with no skipPrayersUntil argument, plus once a day from
   * lib/notification-refresh.ts. Without this, the prayer pause (decision 14)
   * only ever survived the ONE call lib/haid-notifications.ts makes itself —
   * every other call silently un-paused her prayer reminders.
   */
  describe("scheduleAllNotifications — resolves the haid pause itself (item A)", () => {
    it("a bare call still pauses prayer notifications through the stored excused-until date, but keeps adhkaar", async () => {
      (NativeAuth.getUserInfo as any).mockResolvedValueOnce({ id: 5 });
      (AsyncStorage.getItem as any).mockImplementation((key: string) => {
        if (key === "@notification_prefs") return JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true });
        if (key === "@prayer_location") return JSON.stringify({ country: "Nederland", city: "Amsterdam", lat: 52.37, lng: 4.89, tz: "Europe/Amsterdam" });
        if (key === "@prayer_method") return "uoif";
        if (key === "@haid_excused_5") return JSON.stringify({ excused: true, until: "2099-01-07" }); // far future: always still excused
        return null;
      });

      await scheduleAllNotifications("ar");

      const calls = (Notifications.scheduleNotificationAsync as any).mock.calls.map((c: any[]) => c[0]);
      expect(calls.some((c: any) => c.content.data.type === "prayer")).toBe(false);
      expect(calls.some((c: any) => c.content.data.type === "adhkaar")).toBe(true);
    });

    it("with no stored excused flag, prayers are scheduled normally", async () => {
      (NativeAuth.getUserInfo as any).mockResolvedValueOnce({ id: 5 });
      (AsyncStorage.getItem as any).mockImplementation((key: string) => {
        if (key === "@notification_prefs") return JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true });
        if (key === "@prayer_location") return JSON.stringify({ country: "Nederland", city: "Amsterdam", lat: 52.37, lng: 4.89, tz: "Europe/Amsterdam" });
        if (key === "@prayer_method") return "uoif";
        return null; // no @haid_excused_5 key stored
      });

      await scheduleAllNotifications("ar");

      const calls = (Notifications.scheduleNotificationAsync as any).mock.calls.map((c: any[]) => c[0]);
      expect(calls.some((c: any) => c.content.data.type === "prayer")).toBe(true);
    });
  });

  /**
   * The settings screens' master toggle used cancelAllScheduledNotificationsAsync(),
   * so switching prayer reminders off also silently switched off iqaamah silence,
   * iman, islamic reminders, weekly goals and spouse advice.
   */
  describe("cancelScheduleAllNotifications", () => {
    it("cancels only prayer and adhkaar, never everything", async () => {
      (Notifications.getAllScheduledNotificationsAsync as any).mockResolvedValue([
        { identifier: "prayer-1", content: { data: { type: "prayer" } } },
        { identifier: "iqamah-1", content: { data: { type: "iqamah_silence" } } },
        { identifier: "adhkaar-1", content: { data: { type: "adhkaar" } } },
        { identifier: "iman-1", content: { data: { type: "iman_daily" } } },
      ]);

      await cancelScheduleAllNotifications();

      expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
      const cancelled = (Notifications.cancelScheduledNotificationAsync as any).mock.calls.map((c: any[]) => c[0]);
      expect(cancelled).toEqual(["prayer-1", "adhkaar-1"]);
    });

    /**
     * Shares scheduleAllNotifications' queue. A master-off toggle running while
     * a scheduling pass is in flight would otherwise cancel the alarms already
     * written and leave the ones still being written — "off" that is partly on.
     * It must also not deadlock: the schedule path runs inside that same queue.
     */
    it("waits for an in-flight scheduling run instead of interleaving with it", async () => {
      (AsyncStorage.getItem as any).mockImplementation((key: string) => {
        if (key === "@notification_prefs") return JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true });
        if (key === "@prayer_location") return null;
        return null;
      });

      const starts: string[] = [];
      let releaseFirst!: () => void;
      (Notifications.getAllScheduledNotificationsAsync as any)
        .mockImplementationOnce(() => {
          starts.push("schedule");
          return new Promise((res) => { releaseFirst = () => res([]); });
        })
        .mockImplementationOnce(() => {
          starts.push("cancel");
          return Promise.resolve([]);
        });

      const scheduling = scheduleAllNotifications("nl");
      await Promise.resolve();
      const cancelling = cancelScheduleAllNotifications();
      await Promise.resolve();
      expect(starts).toEqual(["schedule"]); // cancel still queued behind it
      releaseFirst();
      await Promise.all([scheduling, cancelling]);
      expect(starts).toEqual(["schedule", "cancel"]);
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

  describe("sendTestNotification", () => {
    it("schedules on the channel for the passed adhan sound", async () => {
      await sendTestNotification("en", "takbeer_2");
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          // On the TRIGGER, not the content: expo ignores channelId on content,
          // so the old assertion passed while every notification actually played
          // the default system sound instead of the adhan (found on device).
          trigger: expect.objectContaining({ channelId: prayerChannelId("takbeer_2") }),
        }),
      );
    });

    it("falls back to the default adhan sound when none is passed", async () => {
      await sendTestNotification("en");
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: expect.objectContaining({ channelId: prayerChannelId(DEFAULT_NOTIFICATION_PREFS.adhanSound) }),
        }),
      );
    });
  });

  describe("prayerChannelId", () => {
    it("gives each adhan sound choice a distinct channel id", () => {
      const ids = new Set([
        prayerChannelId("takbeer_1"),
        prayerChannelId("takbeer_2"),
        prayerChannelId("takbeer_3"),
      ]);
      expect(ids.size).toBe(3);
    });

    it("is stable for the same sound choice", () => {
      expect(prayerChannelId("takbeer_2")).toBe(prayerChannelId("takbeer_2"));
    });
  });
});
