import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";

/**
 * The iOS 64-pending cap (see tests/ios-notification-budget.test.ts) is only
 * survivable because the launch schedule is sized to exactly 58. That sizing
 * assumes ONE scheduling pass at a time.
 *
 * Every scheduler does an unatomic read -> cancel-own -> schedule against the OS
 * pending list. When two passes overlap, the second reads that list before the
 * first has written its requests, so its cancel misses them, and it then appends
 * a second copy of everything it owns. Measured on this harness against the
 * unserialized schedulers: a settled iOS launch sits at 58, and two overlapping
 * iqamah passes take it to 68 — over the cap, which puts back the silent
 * truncation lib/notification-horizons.ts exists to remove.
 *
 * Overlap is reachable in the shipping app: app/(tabs)/notification-settings.tsx
 * calls scheduleIqamahSilence and scheduleIslamicReminders straight from switch
 * handlers, so two quick taps overlap two passes; app/_layout.tsx's launch effect
 * re-runs on popup toggles; and lib/notification-refresh.ts re-runs the whole
 * launch sequence on the first foreground of each new day.
 *
 * These guards assert BOTH directions, because a ceiling-only check passes just
 * as happily when scheduling breaks entirely and the count is zero:
 *   - overlapping passes end at or under the budget, AND
 *   - they end with a full single pass's worth of each type still scheduled.
 */

vi.hoisted(() => {
  process.env.TZ = "Europe/Amsterdam";
});
const NOW = new Date("2026-09-01T00:05:00+02:00");

const mockPlatform = vi.hoisted(() => ({
  OS: "ios" as "ios" | "android" | "web",
}));
vi.mock("react-native", () => ({ Platform: mockPlatform }));

/** A real pending store, not a call counter — the net size is what iOS caps. */
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

vi.mock("../modules/iqamah-alarm/src", () => ({
  isAvailable: () => false,
  scheduleSilenceAlarms: vi.fn().mockResolvedValue(0),
  cancelSilenceAlarms: vi.fn().mockResolvedValue(undefined),
  captureRingerModeIfNeeded: vi.fn().mockResolvedValue(undefined),
  consumePriorRingerMode: vi.fn().mockResolvedValue(null),
}));

import * as Notifications from "expo-notifications";
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
import { IOS_PENDING_TARGET } from "../lib/notification-horizons";

/** app/_layout.tsx's launch sequence, in the order it runs it. */
async function launchPass() {
  await scheduleAllNotifications("nl");
  await scheduleWeeklyGoalsNotification("nl");
  await scheduleWeeklyReminder("nl", 5);
  await scheduleDailyAdviceNotification("nl");
  await scheduleSpouseAdviceNotification("nl");
  await scheduleInactivityReminder("nl");
  await scheduleGoalsIncompleteReminder("nl");
  await scheduleIslamicReminders("nl");
  await scheduleImanNotifications("nl");
  await scheduleIqamahSilence("nl");
}

const countOfType = (type: string) =>
  store.pending.filter((p) => p.content?.data?.type === type).length;

/** Per-type tally, so a failure says WHICH scheduler double-scheduled. */
const breakdown = () => {
  const counts = new Map<string, number>();
  for (const p of store.pending) {
    const t = String(p.content?.data?.type ?? "(none)");
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return (
    `${store.pending.length} pending:\n` +
    [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `  ${String(n).padStart(3)}  ${t}`)
      .join("\n")
  );
};

/** One settled pass's worth of each type, asserted as PRESENCE after overlap. */
const SINGLE_PASS = {
  prayer:
    Object.values(DEFAULT_NOTIFICATION_PREFS.prayers).filter(Boolean).length *
    3,
  adhkaar: 2 * 3,
  iqamah_silence: 5,
  iqamah_restore: 5,
  morning_adhkar_reminder: 2,
  daily_advice: 1,
};

const expectOnePassWorth = () => {
  for (const [type, n] of Object.entries(SINGLE_PASS)) {
    expect(countOfType(type), `${type}\n${breakdown()}`).toBe(n);
  }
};

describe("overlapping scheduling passes stay inside the iOS budget", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterAll(() => vi.useRealTimers());
  beforeEach(() => {
    mockPlatform.OS = "ios";
    store.pending.length = 0;
  });

  it("survives settings-screen toggles firing over a settled launch", async () => {
    await launchPass();
    expect(store.pending.length, breakdown()).toBe(IOS_PENDING_TARGET);

    // Two quick taps on the iqamah switch, plus two on the Islamic-reminders
    // switch: notification-settings.tsx awaits neither, so the passes overlap.
    // Unserialized this measured 68 for the iqamah pair alone, 75 with both.
    await Promise.all([
      scheduleIqamahSilence("nl"),
      scheduleIqamahSilence("nl"),
      scheduleIslamicReminders("nl"),
      scheduleIslamicReminders("nl"),
    ]);

    expect(store.pending.length, breakdown()).toBeLessThanOrEqual(
      IOS_PENDING_TARGET,
    );
    expectOnePassWorth();
  });

  it("survives overlapping single-notification schedulers", async () => {
    // The three that were briefly left out of the shared queue:
    // scheduleWeeklyReminder, scheduleInactivityReminder and
    // scheduleGoalsIncompleteReminder. Each schedules exactly one request, so
    // the argument for skipping them was that the worst case is 61 — still
    // under the 64 cap. That spent half the six-slot headroom to save twelve
    // lines, and it was made on the same day two new ways to re-enter the
    // launch sequence concurrently arrived (the permissionsSetupCompleted dep
    // and the foreground refresh).
    //
    // Overlapped DIRECTLY rather than via two launchPass() calls. That was
    // measured and it does not work: launchPass awaits each scheduler in turn,
    // so the queued schedulers between these three separate the two passes far
    // enough that they never meet. Reverting one of them to unqueued left
    // "two concurrent launch passes" perfectly green — the mutant compiled and
    // the suite passed 3/3. A guard that cannot fail is not a guard, so this
    // reproduces the interleaving those call sites actually produce.
    await launchPass();
    expect(store.pending.length, breakdown()).toBe(IOS_PENDING_TARGET);

    await Promise.all([
      scheduleWeeklyReminder("nl", 5),
      scheduleWeeklyReminder("nl", 5),
      scheduleInactivityReminder("nl"),
      scheduleInactivityReminder("nl"),
      scheduleGoalsIncompleteReminder("nl"),
      scheduleGoalsIncompleteReminder("nl"),
    ]);

    expect(store.pending.length, breakdown()).toBeLessThanOrEqual(
      IOS_PENDING_TARGET,
    );
    // Presence as well: a duplicate is the failure, but so is a scheduler that
    // cancelled its own work and rescheduled nothing.
    expectOnePassWorth();
  });

  it("survives two concurrent launch passes", async () => {
    // What lib/notification-refresh.ts's foreground listener can stack on top of
    // the mount effect, and what a re-rendered launch effect does on its own.
    await Promise.all([launchPass(), launchPass()]);

    expect(store.pending.length, breakdown()).toBeLessThanOrEqual(
      IOS_PENDING_TARGET,
    );
    // daily_advice is the nested call: scheduleAllNotifications reschedules it
    // from inside its own queued job. If that nesting ever goes back through the
    // queue this test does not fail, it HANGS — which is the point of asserting
    // its output here rather than trusting the pass to have completed.
    expectOnePassWorth();
  });

  it("keeps serving later callers after a pass rejects", async () => {
    // A rejected job must not leave the shared queue permanently rejected: that
    // would silently drop every scheduling pass for the rest of the process.
    vi.mocked(
      Notifications.getAllScheduledNotificationsAsync,
    ).mockRejectedValueOnce(new Error("OS list unavailable"));

    const rejected = scheduleIqamahSilence("nl");
    const queuedBehind = scheduleIslamicReminders("nl");

    await expect(rejected).rejects.toThrow("OS list unavailable");
    // Queued behind the failure, and still actually scheduling — not merely
    // resolving.
    await expect(queuedBehind).resolves.toBeGreaterThan(0);
    expect(countOfType("morning_adhkar_reminder"), breakdown()).toBe(2);

    // And the queue is still usable after that, for a different scheduler.
    await scheduleIqamahSilence("nl");
    expect(countOfType("iqamah_silence"), breakdown()).toBe(5);
  });
});
