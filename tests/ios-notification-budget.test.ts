import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

/**
 * iOS keeps at most 64 pending local notification requests per app and silently
 * discards the rest, keeping the SOONEST-firing ones. Nothing throws, nothing
 * logs, and the schedulers' own return counts still report success — so the
 * only way to see it is to add up what a launch actually asks for.
 *
 * Measured here before lib/notification-horizons existed: app/_layout.tsx's ten
 * launch schedulers asked for 167 requests, 2.6x the cap, with iqamah alone
 * contributing 70. The later days of the prayer notifications this app exists
 * for were being dropped by iqamah reminders that on iOS cannot silence
 * anything at all.
 *
 * This guard asserts BOTH directions, because a ceiling-only check passes just
 * as happily when scheduling breaks entirely and the count is zero:
 *   - the whole launch schedule fits under the budget, AND
 *   - prayer notifications are still scheduled for every day of the iOS horizon,
 *   - and Android still gets its full 7-day horizons.
 */

// Deterministic clock and zone: the schedulers skip trigger times already in the
// past, so an unpinned "now" makes every count depend on the hour the suite runs.
// Just after local midnight is the worst case — every day of every horizon full.
vi.hoisted(() => {
  process.env.TZ = "Europe/Amsterdam";
});
const NOW = new Date("2026-09-01T00:05:00+02:00");

const mockPlatform = vi.hoisted(() => ({
  OS: "ios" as "ios" | "android" | "web",
}));
vi.mock("react-native", () => ({ Platform: mockPlatform }));
// lib/notifications.ts now reads the signed-in user to resolve the haid
// prayer-pause when no skipPrayersUntil is passed (item A) — the real
// module pulls in expo-secure-store, which chokes outside a real RN runtime.
vi.mock("@/lib/_core/auth", () => ({ getUserInfo: vi.fn().mockResolvedValue(null) }));

/**
 * A real pending store rather than a call counter: every scheduler cancels its
 * OWN notifications before rescheduling, and scheduleAllNotifications reschedules
 * the daily advice notification that runs again later in the launch sequence. The
 * net size of this store is what iOS actually caps; a count of calls is not.
 */
const store = vi.hoisted(() => {
  const pending: { identifier: string; content: any; trigger: any }[] = [];
  let seq = 0;
  return { pending, next: () => `id-${seq++}` };
});

vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: vi.fn().mockResolvedValue(null),
  getPermissionsAsync: vi.fn().mockResolvedValue({ status: "granted" }),
  scheduleNotificationAsync: vi.fn(async (req: any) => {
    const identifier = store.next();
    store.pending.push({
      identifier,
      content: req.content,
      trigger: req.trigger,
    });
    return identifier;
  }),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    const i = store.pending.findIndex((p) => p.identifier === id);
    if (i >= 0) store.pending.splice(i, 1);
  }),
  cancelAllScheduledNotificationsAsync: vi.fn(async () => {
    store.pending.length = 0;
  }),
  getAllScheduledNotificationsAsync: vi.fn(async () =>
    store.pending.map((p) => ({ ...p })),
  ),
  getPresentedNotificationsAsync: vi.fn().mockResolvedValue([]),
  dismissNotificationAsync: vi.fn().mockResolvedValue(undefined),
  AndroidImportance: { HIGH: 4, DEFAULT: 3, MAX: 5, LOW: 2, MIN: 1, NONE: 0 },
  AndroidNotificationPriority: {
    MAX: "max",
    HIGH: "high",
    DEFAULT: "default",
    LOW: "low",
    MIN: "min",
  },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0, SECRET: -1 },
  SchedulableTriggerInputTypes: {
    DATE: "date",
    TIME_INTERVAL: "timeInterval",
    WEEKLY: "weekly",
    DAILY: "daily",
  },
}));

// A saved location and method, and every preference left at its default — the
// heaviest realistic launch, which is what the budget has to survive.
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => {
      if (key === "@prayer_location")
        return JSON.stringify({
          country: "Nederland",
          city: "Amsterdam",
          lat: 52.37,
          lng: 4.89,
          tz: "Europe/Amsterdam",
        });
      if (key === "@prayer_method") return "uoif";
      return null;
    }),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// Stubbed at the same JS boundary tests/iqamah-silence-native.test.ts uses, so
// nothing reaches for a native module that does not exist in node.
vi.mock("../modules/iqamah-alarm/src", () => ({
  isAvailable: () => false,
  scheduleSilenceAlarms: vi.fn().mockResolvedValue(0),
  cancelSilenceAlarms: vi.fn().mockResolvedValue(undefined),
  captureRingerModeIfNeeded: vi.fn().mockResolvedValue(undefined),
  consumePriorRingerMode: vi.fn().mockResolvedValue(null),
}));

import {
  scheduleAllNotifications,
  scheduleWeeklyReminder,
  scheduleInactivityReminder,
  scheduleGoalsIncompleteReminder,
  DEFAULT_NOTIFICATION_PREFS,
} from "../lib/notifications";
import { scheduleWeeklyGoalsNotification } from "../lib/weekly-goals-notification";
import { scheduleDailyAdviceNotification } from "../lib/daily-advice-notification";
import { scheduleSpouseAdviceNotification } from "../lib/spouse-advice-notification";
import { scheduleIslamicReminders } from "../lib/islamic-reminders";
import { scheduleImanNotifications } from "../lib/iman-notifications";
import { scheduleIqamahSilence } from "../lib/iqamah-silence";
import {
  IOS_PENDING_BUDGET,
  IOS_PENDING_TARGET,
  scheduleDays,
} from "../lib/notification-horizons";

/** Every scheduler app/_layout.tsx runs on launch, in the order it runs them. */
const LAUNCH_SCHEDULERS: (() => Promise<unknown>)[] = [
  () => scheduleAllNotifications("nl"),
  () => scheduleWeeklyGoalsNotification("nl"),
  () => scheduleWeeklyReminder("nl", 5),
  () => scheduleDailyAdviceNotification("nl"),
  () => scheduleSpouseAdviceNotification("nl"),
  () => scheduleInactivityReminder("nl"),
  () => scheduleGoalsIncompleteReminder("nl"),
  () => scheduleIslamicReminders("nl"),
  () => scheduleImanNotifications("nl"),
  () => scheduleIqamahSilence("nl"),
];

async function launchOn(os: "ios" | "android") {
  mockPlatform.OS = os;
  store.pending.length = 0;
  for (const schedule of LAUNCH_SCHEDULERS) await schedule();
  return store.pending.slice();
}

type Pending = Awaited<ReturnType<typeof launchOn>>;

const ofType = (pending: Pending, type: string) =>
  pending.filter((p) => p.content?.data?.type === type);

/** Distinct calendar days a DATE-triggered type fires on = its real horizon. */
const daysCovered = (pending: Pending, type: string) =>
  new Set(
    ofType(pending, type).map((p) => new Date(p.trigger.date).toDateString()),
  ).size;

/** Per-type tally, so a failure says WHICH scheduler ran away with the budget. */
const breakdown = (pending: Pending) => {
  const counts = new Map<string, number>();
  for (const p of pending) {
    const t = String(p.content?.data?.type ?? "(none)");
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return (
    `${pending.length} pending on launch:\n` +
    [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `  ${String(n).padStart(3)}  ${t}`)
      .join("\n")
  );
};

/**
 * Days of prayer + adhkaar notifications an iPhone must come away with. The
 * headline feature's floor, stated independently of lib/notification-horizons
 * so this file cannot rubber-stamp a horizon that was quietly cut.
 */
const IOS_PRAYER_DAYS = 3;

const enabledPrayersPerDay = Object.values(
  DEFAULT_NOTIFICATION_PREFS.prayers,
).filter(Boolean).length;

describe("iOS pending-notification budget", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterAll(() => vi.useRealTimers());

  it("fits the whole launch schedule under the iOS cap, with headroom", async () => {
    const pending = await launchOn("ios");

    // The headroom itself is the point: preference combinations no fixture here
    // covers must not be able to push a passing build over the real cap.
    expect(IOS_PENDING_TARGET).toBeLessThan(IOS_PENDING_BUDGET);
    expect(pending.length, breakdown(pending)).toBeLessThanOrEqual(
      IOS_PENDING_TARGET,
    );
  });

  it("still schedules every prayer for every day of the iOS horizon", async () => {
    const pending = await launchOn("ios");

    // Presence, not just scarcity. Trimming horizons until the count fits is
    // indistinguishable from scheduling nothing at all if only the ceiling is
    // checked — this is the half that fails when prayer scheduling breaks.
    //
    // IOS_PRAYER_DAYS is written out here on purpose instead of being read from
    // scheduleDays("prayer"). Anchoring the expectation to the same constant the
    // scheduler reads makes the assertion a mirror: it was measured passing with
    // the horizon set to 0, i.e. with no iPhone prayer notification scheduled at
    // all. Shortening the real horizon must fail here and be a decision someone
    // takes deliberately, in two places.
    expect(scheduleDays("prayer")).toBe(IOS_PRAYER_DAYS);
    expect(daysCovered(pending, "prayer")).toBe(IOS_PRAYER_DAYS);
    expect(ofType(pending, "prayer").length).toBe(
      enabledPrayersPerDay * IOS_PRAYER_DAYS,
    );
    expect(ofType(pending, "adhkaar").length).toBe(2 * IOS_PRAYER_DAYS);
  });

  it("leaves Android on its full horizons", async () => {
    const pending = await launchOn("android");

    // Android has no cap; every horizon must stay where it was.
    expect(daysCovered(pending, "prayer")).toBe(7);
    expect(ofType(pending, "prayer").length).toBe(enabledPrayersPerDay * 7);
    expect(ofType(pending, "adhkaar").length).toBe(2 * 7);
    expect(daysCovered(pending, "iqamah_silence")).toBe(7);
    expect(ofType(pending, "iqamah_silence").length).toBe(5 * 7);
    expect(ofType(pending, "iqamah_restore").length).toBe(5 * 7);
    expect(daysCovered(pending, "morning_adhkar_reminder")).toBe(7);
    expect(ofType(pending, "evening_adhkar_reminder").length).toBe(7);
    expect(ofType(pending, "ikhlas_reminder").length).toBe(3);
    expect(ofType(pending, "daily_goal_after_fajr").length).toBe(3);
  });
});
