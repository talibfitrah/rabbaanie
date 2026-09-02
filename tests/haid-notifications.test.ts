import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// lib/haid-notifications.ts reads Platform.OS (iOS sound field); the real
// react-native package contains Flow syntax vitest's parser rejects outright,
// same reason tests/notifications.test.ts and friends stub it instead of
// importing it for real.
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
const scheduled: any[] = [];
vi.mock("expo-notifications", () => ({
  scheduleNotificationAsync: vi.fn(async (req: any) => { scheduled.push(req); return `id${scheduled.length}`; }),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
const scheduleAll = vi.fn(async (..._args: any[]) => 0);
vi.mock("../lib/notifications", () => ({
  scheduleAllNotifications: (...a: any[]) => scheduleAll(...a),
  HAID_CHANNEL_ID: "haid_reminders_v1",
}));
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: vi.fn(async (k: string) => store.get(k) ?? null), setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }), removeItem: vi.fn(async (k: string) => { store.delete(k); }) } }));
import { syncHaidNotifications } from "../lib/haid-notifications";

describe("syncHaidNotifications", () => {
  const today = "2026-09-02";
  const days = [{ date: "2026-09-01", flow: "blood" as const }, { date: today, flow: "blood" as const }];
  const settings = { enabled: true, habitLength: 7, contraception: false, ghuslReminder: true };

  beforeEach(() => {
    scheduled.length = 0;
    scheduleAll.mockClear();
    store.clear();
    // The purity-check/ghusl loop only schedules a trigger that is still in the
    // future (skips anything whose local 08:00 has already passed today). The
    // test's fixed dates fall on the real calendar date this suite happens to
    // run on, so without pinning the clock the assertions below flip based on
    // what time of day the suite runs — pin it safely before every trigger in
    // range (day 1 of the window, midnight).
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 2, 0, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("excused: pauses prayers until the last excused day, schedules one purity check per excused day and one ghusl reminder", async () => {
    const st = await syncHaidNotifications({ userId: 5, days, settings, language: "ar", today });
    expect(st).toEqual({ excused: true, until: "2026-09-07" });
    expect(scheduleAll).toHaveBeenCalledWith("ar", "2026-09-07");
    const checks = scheduled.filter((r) => r.content.data.type === "haid_purity_check");
    expect(checks).toHaveLength(6); // 02..07 inclusive
    expect(scheduled.filter((r) => r.content.data.type === "haid_ghusl_reminder")).toHaveLength(1);
    expect(store.get("@haid_excused_5")).toContain('"excused":true');
  });
  it("not excused: clears the flag, restores prayers, schedules nothing", async () => {
    const st = await syncHaidNotifications({ userId: 5, days: [], settings, language: "nl", today });
    expect(st).toEqual({ excused: false });
    expect(scheduleAll).toHaveBeenCalledWith("nl", undefined);
    expect(scheduled).toHaveLength(0);
  });
  it("ghusl reminder respects the setting (decision 16 is optional)", async () => {
    await syncHaidNotifications({ userId: 5, days, settings: { ...settings, ghuslReminder: false }, language: "ar", today });
    expect(scheduled.filter((r) => r.content.data.type === "haid_ghusl_reminder")).toHaveLength(0);
  });

  // Item D-2: expo-notifications reads channelId off the TRIGGER, not the
  // content (tests/trigger-date-timezone.test.ts documents the same rule for
  // lib/notifications.ts) — both of this module's own notifications need one
  // so they land on a channel the user can find/mute, instead of Android's
  // unlabelled default.
  it("gives both notifications an Android channelId, set on the trigger", async () => {
    await syncHaidNotifications({ userId: 5, days, settings, language: "ar", today });
    const checks = scheduled.filter((r) => r.content.data.type === "haid_purity_check");
    const ghusl = scheduled.filter((r) => r.content.data.type === "haid_ghusl_reminder");
    expect(checks.length).toBeGreaterThan(0);
    expect(ghusl.length).toBeGreaterThan(0);
    expect(checks.every((r) => typeof r.trigger.channelId === "string")).toBe(true);
    expect(ghusl.every((r) => typeof r.trigger.channelId === "string")).toBe(true);
    expect(checks.every((r) => r.content.data.url === undefined)).toBe(true);
    expect(ghusl.every((r) => r.content.data.url === undefined)).toBe(true);
  });

  // Item D-3: the iOS 64-pending-request budget (lib/notification-horizons)
  // means a single sync must not schedule further ahead than a handful of
  // days — re-syncing on every app open already slides the window forward as
  // she keeps using the app.
  it("caps the purity-check loop at 7 days ahead, however far `until` really is", async () => {
    const longHabit = { enabled: true, habitLength: 21, contraception: false, ghuslReminder: true };
    const st = await syncHaidNotifications({ userId: 5, days: [{ date: today, flow: "blood" as const }], settings: longHabit, language: "ar", today });
    expect(st.until).toBe("2026-09-22"); // today + 20, per predict()'s start+habit-1 until
    expect(scheduled.filter((r) => r.content.data.type === "haid_purity_check")).toHaveLength(7); // capped to today..today+6
  });

  // C14: a bystander glancing at a locked device must not learn anything
  // about her cycle from the notification text itself — even with a private
  // channel, an insecure/no lock screen still shows title+body in full.
  it("keeps both notifications' title and body generic — no cycle/purity detail outside the app (C14)", async () => {
    await syncHaidNotifications({ userId: 5, days, settings, language: "ar", today });
    const checks = scheduled.filter((r) => r.content.data.type === "haid_purity_check");
    const ghusl = scheduled.filter((r) => r.content.data.type === "haid_ghusl_reminder");
    expect(checks.length).toBeGreaterThan(0);
    expect(ghusl.length).toBeGreaterThan(0);
    const leaky = /طهر|حائض|نفاس|غسل|pure|purity|cycle|period|ghusl/i;
    for (const r of [...checks, ...ghusl]) {
      expect(leaky.test(r.content.title)).toBe(false);
      expect(leaky.test(r.content.body)).toBe(false);
    }
  });

  // Item D-1: cancelOwn()'s read-then-cancel and the schedule loop that
  // follows are not atomic. Two overlapping syncHaidNotifications calls (e.g.
  // two listeners reacting to the same getMine refetch) used to both read the
  // pending list before either had written its own, double-scheduling the
  // purity check/ghusl reminder. NOT routed through lib/notification-queue's
  // enqueue: that queue also holds scheduleAllNotifications, which this
  // function calls — enqueueing here would deadlock waiting on itself.
  it("coalesces two calls fired in the same tick into one scheduling pass for the final state", async () => {
    const p1 = syncHaidNotifications({ userId: 5, days, settings, language: "ar", today });
    const p2 = syncHaidNotifications({ userId: 5, days: [], settings, language: "nl", today });

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(scheduleAll).toHaveBeenCalledTimes(1);
    expect(scheduleAll).toHaveBeenCalledWith("nl", undefined);
    expect(r1).toEqual({ excused: false });
    expect(r2).toEqual({ excused: false });
  });
});
