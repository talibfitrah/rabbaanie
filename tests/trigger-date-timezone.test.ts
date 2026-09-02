import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Confirmed on an emulator 2026-08-08: NO prayer or iqaamah notification was
 * ever armed. Both trigger builders derived the timezone offset with
 *
 *     new Date(tempDate.toLocaleString("en-US", { timeZone: tz }))
 *
 * and Hermes cannot parse `"8/8/2026, 1:00:00 PM"`. Invalid Date → offsetMs
 * NaN → trigger NaN → expo dropped every request
 * ("will not trigger in the future, removing", ×70 iqaamah, ×35 prayers), and
 * `dumpsys alarm` held no prayer alarm at all.
 *
 * The trap this file exists for: **V8 parses that string happily**, so the
 * behavioural tests below pass against the broken code too, and vitest can
 * never reproduce the failure. The source-level guard is therefore the test
 * that actually catches this class of bug — it is not decoration.
 *
 * `toLocaleString` itself is fine on Hermes (it is Intl, and Intl ships with
 * Hermes on RN Android). Only feeding its output back to `new Date()` is fatal.
 */

const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

// lib/notifications.ts reaches React Native globals at module scope.
vi.stubGlobal("__DEV__", false);
// It also now reads the signed-in user to resolve the haid prayer-pause when
// no skipPrayersUntil is passed (item A) — the real module pulls in
// expo-secure-store, which chokes outside a real RN runtime.
vi.mock("@/lib/_core/auth", () => ({ getUserInfo: vi.fn().mockResolvedValue(null) }));
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  cancelAllScheduledNotificationsAsync: vi.fn(),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(), removeItem: vi.fn() },
}));
// react-native's own source uses Flow's `import typeof`, which rollup cannot
// parse ("Expected 'from', got 'typeOf'") — mocking it is what makes any test
// that reaches lib/notifications.ts loadable at all.
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

describe("trigger dates are built without parsing a locale string", () => {
  const FILES = ["lib/notifications.ts", "lib/iqamah-silence.ts"];

  for (const f of FILES) {
    it(`${f} never round-trips a formatted date back through new Date()`, () => {
      const src = read(f);
      // The exact Hermes-fatal shape, in both the direct and via-variable forms.
      expect(src).not.toMatch(/new Date\(\s*\w*\.?toLocaleString\(/);
      const localeVars = [...src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*[\w.]*toLocaleString\(/g)].map((m) => m[1]);
      for (const v of localeVars) {
        expect(src, `new Date(${v}) parses a locale string — fatal on Hermes`).not.toMatch(
          new RegExp(`new Date\\(\\s*${v}\\s*\\)`),
        );
      }
    });
  }
});

/**
 * Behavioural cover for the replacement. These pass on V8 either way, so they
 * guard the new implementation's correctness (DST, cross-midnight, no NaN)
 * rather than proving the original bug.
 */
describe("createTriggerDate produces the right UTC instant", () => {
  const load = async () => (await import("../lib/notifications")).__test_createTriggerDate;

  it("converts summer wall-clock in Europe/Amsterdam (UTC+2)", async () => {
    const createTriggerDate = await load();
    // 05:30 local on 8 Aug 2026 is 03:30 UTC.
    const d = createTriggerDate(new Date(2026, 7, 8), 5, 30, 0, "Europe/Amsterdam");
    expect(d.toISOString()).toBe("2026-08-08T03:30:00.000Z");
  });

  it("respects DST — the same wall-clock in winter is UTC+1", async () => {
    const createTriggerDate = await load();
    const d = createTriggerDate(new Date(2026, 0, 15), 5, 30, 0, "Europe/Amsterdam");
    expect(d.toISOString()).toBe("2026-01-15T04:30:00.000Z");
  });

  it("subtracts minutesBefore across midnight into the previous day", async () => {
    const createTriggerDate = await load();
    // 00:15 local minus 30 minutes = 23:45 the previous day, local → 21:45 UTC.
    const d = createTriggerDate(new Date(2026, 7, 8), 0, 15, 30, "Europe/Amsterdam");
    expect(d.toISOString()).toBe("2026-08-07T21:45:00.000Z");
  });

  it("never returns an invalid date — a NaN trigger is silently dropped by expo", async () => {
    const createTriggerDate = await load();
    for (const tz of ["Europe/Amsterdam", "UTC", "Asia/Riyadh", "America/New_York"]) {
      for (const h of [0, 5, 12, 23]) {
        const d = createTriggerDate(new Date(2026, 7, 8), h, 0, 10, tz);
        expect(Number.isNaN(d.getTime()), `${tz} ${h}:00 produced NaN`).toBe(false);
      }
    }
  });

  it("handles a timezone ahead of UTC (Asia/Riyadh, UTC+3)", async () => {
    const createTriggerDate = await load();
    const d = createTriggerDate(new Date(2026, 7, 8), 12, 0, 0, "Asia/Riyadh");
    expect(d.toISOString()).toBe("2026-08-08T09:00:00.000Z");
  });
});

/**
 * The second half of the same on-device finding: every notification played the
 * DEFAULT system sound, never the chosen adhan, because `channelId` was passed
 * inside `content`. expo has no channelId on NotificationContentInput — it
 * reads it from the TRIGGER (ChannelAwareTriggerInput for immediate delivery,
 * or the optional channelId on a schedulable trigger). The wrong placement is
 * silently ignored, which is why it survived: the code looks right, typechecks,
 * and the correct per-sound channels existed on the device, unused.
 */
describe("channelId is set where expo actually reads it", () => {
  const FILES = ["lib/notifications.ts", "lib/iqamah-silence.ts"];

  for (const f of FILES) {
    it(`${f} never puts channelId in the notification content`, () => {
      const src = read(f);
      // The content spread is the only place these files build android-specific
      // fields; channelId must not be among them.
      const contentSpreads = [...src.matchAll(/\.\.\.\(Platform\.OS === "android" \? \{[^}]*\}/g)];
      const offenders = contentSpreads.filter((m) => m[0].includes("channelId")).map((m) => m[0]);
      expect(offenders).toEqual([]);
    });
  }

  it("the immediate test notification uses a channel-aware trigger, not null", () => {
    const src = read("lib/notifications.ts");
    // `trigger: null` on Android falls back to expo's default channel, which is
    // what made the test notification play the system sound.
    expect(src).toMatch(/trigger: Platform\.OS === "android" \? \{ channelId: prayerChannelId\(/);
  });
});
