import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

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

// The describe above has its own beforeEach; the blocks below are siblings, so
// without this their mock.calls carry over from the previous test (and the
// concurrency test installs stateful fakes). Reset every mock to its factory
// default so no test below depends on the order it runs in.
beforeEach(() => {
  (Notifications.scheduleNotificationAsync as any).mockReset().mockResolvedValue("notif-id-checkin");
  (Notifications.cancelScheduledNotificationAsync as any).mockReset().mockResolvedValue(undefined);
  (Notifications.getAllScheduledNotificationsAsync as any).mockReset().mockResolvedValue([]);
  (AsyncStorage.getItem as any).mockReset().mockResolvedValue(null);
});

/**
 * (a) The body advertised a prayer/mood form that no longer exists — the
 * check-in the reminder opens is the «المراجعة الشخصية» personal review (see
 * components/daily-duo-row.tsx for the surviving wording).
 */
describe("scheduleDailyCheckinNotification body — names the review that still exists", () => {
  const cases: [("nl" | "en" | "ar"), string][] = [
    ["nl", "Neem een moment voor uw persoonlijke evaluatie van vandaag"],
    ["en", "Take a moment for today's personal review"],
    ["ar", "خذ لحظة لمراجعتك الشخصية اليوم"],
  ];
  for (const [language, body] of cases) {
    it(`uses the personal-review wording in ${language}`, async () => {
      await scheduleDailyCheckinNotification(language);
      const call = (Notifications.scheduleNotificationAsync as any).mock.calls[0][0];
      expect(call.content.body).toBe(body);
    });
  }

  // Absence too: the deleted prayer/mood form must not be advertised again.
  it("never promises the deleted prayer/mood form", async () => {
    for (const language of ["nl", "en", "ar"] as const) {
      await scheduleDailyCheckinNotification(language);
      const call = (Notifications.scheduleNotificationAsync as any).mock.calls.at(-1)[0];
      expect(call.content.body).not.toMatch(/stemming|mood|مزاج/i);
    }
  });
});

/**
 * (b) expo-notifications reads `channelId` off the TRIGGER; in the content it
 * is ignored, so the reminder landed on the default channel and the
 * "Daily check-in" channel this module creates could not mute it.
 * lib/notifications.ts puts it on the trigger — match that.
 */
describe("scheduleDailyCheckinNotification channel — Android routing must actually apply", () => {
  it("puts channelId on the trigger, not the content", async () => {
    await scheduleDailyCheckinNotification("nl");
    const call = (Notifications.scheduleNotificationAsync as any).mock.calls[0][0];
    expect(call.trigger.channelId).toBe("daily_checkin_v1");
    expect(call.content.channelId).toBeUndefined();
  });
});

/**
 * (c) read-cancel-read-pref-schedule is not atomic, and this runs from both
 * app/_layout.tsx (launch) and the notification-settings toggle. Turning the
 * reminder OFF while a launch pass is mid-flight used to leave the launch
 * pass's freshly scheduled alarm behind: it had already read the pref as
 * enabled, and it wrote AFTER the disable pass had finished cancelling.
 */
describe("scheduleDailyCheckinNotification concurrency — a disable must win over an in-flight launch pass", () => {
  it("leaves nothing scheduled when a disable overlaps a launch-path run", async () => {
    const scheduled: { identifier: string; content: any }[] = [];
    let n = 0;
    (Notifications.scheduleNotificationAsync as any).mockImplementation(async (req: any) => {
      const identifier = `id-${++n}`;
      scheduled.push({ identifier, content: req.content });
      return identifier;
    });
    (Notifications.getAllScheduledNotificationsAsync as any).mockImplementation(async () => [...scheduled]);
    (Notifications.cancelScheduledNotificationAsync as any).mockImplementation(async (id: string) => {
      const i = scheduled.findIndex((x) => x.identifier === id);
      if (i >= 0) scheduled.splice(i, 1);
    });

    // The launch pass reads the pref while it is still enabled, and that read
    // is slow (a real AsyncStorage hit). The user switches the toggle off in
    // the meantime, so every later read says disabled.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let reads = 0;
    (AsyncStorage.getItem as any).mockImplementation(async () => {
      const mine = ++reads; // captured before the await: `reads` moves on meanwhile
      if (mine === 1) await gate;
      return JSON.stringify({ enabled: mine === 1 });
    });

    const launch = scheduleDailyCheckinNotification("nl");
    const disable = scheduleDailyCheckinNotification("nl");
    release();
    await Promise.all([launch, disable]);

    expect(scheduled).toEqual([]);
  });
});

/**
 * Bug: the toggle that turns this reminder on and off was filed inside the
 * screen's «التذكير الأسبوعي» / Weekly Reminder section, under that section's
 * "Weekly reminder to review parenting goals and progress." description. It
 * fires DAILY (see CHECKIN_HOUR above), so a user looking for it under a
 * weekly heading is being told the wrong thing about when it arrives.
 *
 * Anchored on the section elements and the handler identifier, not on label
 * text or layout: a reworded title or a reformat must not decide this, only
 * actually filing a daily toggle under the weekly heading should.
 */
describe("daily check-in toggle placement — a daily reminder must not sit under the weekly heading", () => {
  const SRC = readFileSync(join(__dirname, "..", "app", "(tabs)", "notification-settings.tsx"), "utf8");

  /** The children of each <SectionCollapsible> on the screen. */
  const sections = SRC.split("<SectionCollapsible")
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf("</SectionCollapsible>")));

  it("keeps the daily check-in toggle out of the weekly reminder section", () => {
    const weekly = sections.find((sec) => sec.includes("Weekly Reminder"));
    expect(weekly).toBeDefined();
    // Presence too: the weekly section must still own its OWN toggle, so this
    // cannot be satisfied by emptying the section out.
    expect(weekly).toContain("handleWeeklyToggle");
    expect(weekly).not.toContain("handleCheckinToggle");
  });

  it("still offers the daily check-in toggle in exactly one section", () => {
    expect(sections.filter((sec) => sec.includes("handleCheckinToggle"))).toHaveLength(1);
  });
});
