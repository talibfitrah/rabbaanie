import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const scheduled: any[] = [];
vi.mock("expo-notifications", () => ({
  scheduleNotificationAsync: vi.fn(async (req: any) => { scheduled.push(req); return `id${scheduled.length}`; }),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
const scheduleAll = vi.fn(async (..._args: any[]) => 0);
vi.mock("../lib/notifications", () => ({ scheduleAllNotifications: (...a: any[]) => scheduleAll(...a) }));
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
});
