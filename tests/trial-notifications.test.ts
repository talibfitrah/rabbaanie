import { describe, it, expect, vi } from "vitest";
// lib/trial-notifications.ts imports expo-notifications at module scope (same
// as lib/haid-notifications.ts); the real package pulls in RN/expo runtime
// code vitest's environment cannot run. Only trialReminderSchedule (pure Date
// math) is under test here, so these are stubs, not exercised.
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-notifications", () => ({
  scheduleNotificationAsync: vi.fn(),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  setNotificationChannelAsync: vi.fn(),
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationPriority: { HIGH: "high" },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
import { trialReminderSchedule } from "../lib/trial-notifications";

describe("trialReminderSchedule", () => {
  // Midnight, well before the earliest fixed hour (09:00) any slot below uses —
  // nothing is "already past" so the full schedule survives the now-filter.
  const now = new Date(2026, 8, 1, 0, 0, 0);

  it("gives 11 total for a fresh 7-day trial: 1/day on days 1-5, 3/day on days 6-7", () => {
    const slots = trialReminderSchedule(7, now);
    expect(slots.length).toBe(11);

    const byDay = new Map<string, number>();
    for (const s of slots) {
      const key = s.date.toDateString();
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    expect(byDay.size).toBe(7); // 7 distinct calendar days touched

    // Chronological order, earliest first — the 3x escalation must be the LAST
    // two days (closest to expiry), not the first two.
    const days = [...byDay.entries()].sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime(),
    );
    expect(days.slice(0, 5).map(([, n]) => n)).toEqual([1, 1, 1, 1, 1]);
    expect(days.slice(5).map(([, n]) => n)).toEqual([3, 3]);
  });

  it("shrinks to what's left mid-trial (daysLeft=2 -> both remaining days escalate to 3x)", () => {
    const slots = trialReminderSchedule(2, now);
    expect(slots.length).toBe(6);
    expect(new Set(slots.map((s) => s.date.toDateString())).size).toBe(2);
  });

  it("drops trigger times already in the past", () => {
    // Past today's single 10:00 reminder, but before the rest of the horizon.
    const midDay1 = new Date(2026, 8, 1, 11, 0, 0);
    expect(trialReminderSchedule(7, midDay1).length).toBe(10);
  });

  it("clamps out-of-range daysLeft to 0..7", () => {
    expect(trialReminderSchedule(0, now).length).toBe(0);
    expect(trialReminderSchedule(9, now).length).toBe(11);
  });
});
