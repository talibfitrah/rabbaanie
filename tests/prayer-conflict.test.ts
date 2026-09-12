/**
 * Pure core of the Roznama prayer-time conflict feature (2929): does an
 * appointment time collide with a prayer, and is Friday Dhuhr a (blocking)
 * Jumu'ah. Dates: 2026-09-11 is a Friday, 2026-09-14 a Monday (2026-09-12 is
 * the Saturday the build ran on), so getDay() is known by construction.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => storage.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { storage.set(k, v); }),
  },
}));

import {
  detectPrayerConflict,
  loadPrayerConflictPrefs,
  savePrayerConflictPrefs,
  DEFAULT_PRAYER_CONFLICT_PREFS,
  type PrayerConflictPrefs,
} from "../lib/prayer-conflict";
import type { PrayerTimesResult } from "../lib/prayer-data";

const TIMES: PrayerTimesResult = {
  fajr: "05:00", sunrise: "06:30", dhuhr: "13:00", asr: "16:00", maghrib: "19:00", isha: "20:30",
};
const FRIDAY = new Date(2026, 8, 11);
const MONDAY = new Date(2026, 8, 14);
const prefs = (over: Partial<PrayerConflictPrefs> = {}): PrayerConflictPrefs => ({ ...DEFAULT_PRAYER_CONFLICT_PREFS, ...over });

beforeEach(() => storage.clear());

describe("detectPrayerConflict", () => {
  it("returns none for a time clear of every prayer", () => {
    expect(detectPrayerConflict(MONDAY, 10, 0, TIMES, prefs())).toEqual({ kind: "none" });
  });

  it("flags a daily prayer window (Dhuhr 13:00 + 30m) on a weekday", () => {
    expect(detectPrayerConflict(MONDAY, 13, 15, TIMES, prefs())).toEqual({ kind: "daily", prayer: "dhuhr" });
  });

  it("half-open window: adhan itself collides, adhan+window does not", () => {
    expect(detectPrayerConflict(MONDAY, 13, 0, TIMES, prefs())).toEqual({ kind: "daily", prayer: "dhuhr" });
    expect(detectPrayerConflict(MONDAY, 13, 30, TIMES, prefs())).toEqual({ kind: "none" });
  });

  it("blocks Friday Dhuhr as Jumu'ah over the longer 90m window", () => {
    expect(detectPrayerConflict(FRIDAY, 13, 15, TIMES, prefs())).toEqual({ kind: "jumuah", prayer: "dhuhr" });
    expect(detectPrayerConflict(FRIDAY, 14, 15, TIMES, prefs())).toEqual({ kind: "jumuah", prayer: "dhuhr" }); // inside 13:00+90
    expect(detectPrayerConflict(FRIDAY, 14, 45, TIMES, prefs())).toEqual({ kind: "none" }); // past 14:30
  });

  it("Jumu'ah block is independent of the daily-warn master (enabled=false still blocks)", () => {
    expect(detectPrayerConflict(FRIDAY, 13, 15, TIMES, prefs({ enabled: false }))).toEqual({ kind: "jumuah", prayer: "dhuhr" });
  });

  it("with Jumu'ah block off, Friday Dhuhr only warns like a daily prayer", () => {
    expect(detectPrayerConflict(FRIDAY, 13, 15, TIMES, prefs({ blockJumuah: false }))).toEqual({ kind: "daily", prayer: "dhuhr" });
    expect(detectPrayerConflict(FRIDAY, 14, 15, TIMES, prefs({ blockJumuah: false }))).toEqual({ kind: "none" }); // outside the 30m daily window
  });

  it("everything off → never reports a conflict", () => {
    expect(detectPrayerConflict(FRIDAY, 13, 15, TIMES, prefs({ enabled: false, blockJumuah: false }))).toEqual({ kind: "none" });
    expect(detectPrayerConflict(MONDAY, 13, 15, TIMES, prefs({ enabled: false }))).toEqual({ kind: "none" });
  });

  it("still catches Friday's non-Dhuhr prayers while Jumu'ah is on", () => {
    expect(detectPrayerConflict(FRIDAY, 16, 10, TIMES, prefs())).toEqual({ kind: "daily", prayer: "asr" });
  });

  it("Friday Dhuhr still warns (daily) past the Jumu'ah window when dailyWindow > jumuahWindow", () => {
    const p = prefs({ dailyWindowMinutes: 60, jumuahWindowMinutes: 30 });
    // 13:40 is past Jumu'ah's 30m window (ends 13:30) but inside the 60m daily window.
    expect(detectPrayerConflict(FRIDAY, 13, 40, TIMES, p)).toEqual({ kind: "daily", prayer: "dhuhr" });
    // still inside the 30m Jumu'ah window → the hard block wins.
    expect(detectPrayerConflict(FRIDAY, 13, 15, TIMES, p)).toEqual({ kind: "jumuah", prayer: "dhuhr" });
  });

  it("ignores a malformed prayer-time string instead of deriving a bogus window", () => {
    const bad = { ...TIMES, dhuhr: "23:60" }; // minute 60 is invalid
    expect(detectPrayerConflict(MONDAY, 23, 55, bad, prefs())).toEqual({ kind: "none" });
  });
});

describe("prefs persistence", () => {
  it("round-trips and back-fills defaults for partial stored prefs", async () => {
    await savePrayerConflictPrefs(prefs({ dailyWindowMinutes: 20 }));
    const loaded = await loadPrayerConflictPrefs();
    expect(loaded.dailyWindowMinutes).toBe(20);
    expect(loaded.jumuahWindowMinutes).toBe(DEFAULT_PRAYER_CONFLICT_PREFS.jumuahWindowMinutes);
  });

  it("returns defaults when nothing is stored", async () => {
    expect(await loadPrayerConflictPrefs()).toEqual(DEFAULT_PRAYER_CONFLICT_PREFS);
  });

  it("sanitizes corrupt stored types (string window / string boolean)", async () => {
    // Raw write bypassing the typed setter, simulating a corrupt/legacy record.
    storage.set("@prayer_conflict_prefs", JSON.stringify({ enabled: "false", blockJumuah: true, dailyWindowMinutes: "30", jumuahWindowMinutes: 90 }));
    const loaded = await loadPrayerConflictPrefs();
    expect(loaded.enabled).toBe(false); // truthy "false" string must not enable
    expect(loaded.blockJumuah).toBe(true);
    expect(loaded.dailyWindowMinutes).toBe(30);
    expect(typeof loaded.dailyWindowMinutes).toBe("number"); // not the "30" string
  });
});
