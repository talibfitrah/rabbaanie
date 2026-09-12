/**
 * Prayer-time awareness for Roznama appointments (Daa3iyah 2929).
 *
 * When the user books an appointment that falls at a prayer time, warn them
 * (the five daily prayers), and for Friday Dhuhr — Jumu'ah — block it unless
 * they will be in a city other than their home city. The shar'i basis is the
 * fixed, obligatory timing of prayer (An-Nisa 103) and the obligation of
 * Jumu'ah (Al-Jumu'ah 9); the wording lives at the call sites.
 *
 * This module is the pure core: a preference object and a single detector that,
 * given an appointment's date + wall-clock time and a day's prayer times, says
 * whether it collides and how. All I/O and UI stay at the call site (roznama).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PrayerTimesResult } from "./prayer-data";

export type DailyPrayer = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
const DAILY_PRAYERS: readonly DailyPrayer[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export interface PrayerConflictPrefs {
  /** Warn when an appointment lands in one of the five daily prayer windows. */
  enabled: boolean;
  /** Minutes after adhan still counted as "prayer time" for a daily prayer. */
  dailyWindowMinutes: number;
  /** Hard-block appointments during the Friday Dhuhr (Jumu'ah) window. */
  blockJumuah: boolean;
  /** Jumu'ah window length (khutbah + prayer) in minutes. */
  jumuahWindowMinutes: number;
}

export const DEFAULT_PRAYER_CONFLICT_PREFS: PrayerConflictPrefs = {
  enabled: true,
  dailyWindowMinutes: 30,
  blockJumuah: true,
  jumuahWindowMinutes: 90,
};

const PRAYER_CONFLICT_PREFS_KEY = "@prayer_conflict_prefs";

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function loadPrayerConflictPrefs(): Promise<PrayerConflictPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PRAYER_CONFLICT_PREFS_KEY);
    if (raw) {
      const p = { ...DEFAULT_PRAYER_CONFLICT_PREFS, ...JSON.parse(raw) };
      // Coerce at the AsyncStorage trust boundary: a corrupt/legacy record must
      // not feed a string into the window arithmetic (`start + "30"` concatenates
      // to a day-long window) or a truthy "false" into the toggles.
      return {
        enabled: p.enabled === true,
        blockJumuah: p.blockJumuah === true,
        dailyWindowMinutes: clampInt(p.dailyWindowMinutes, DEFAULT_PRAYER_CONFLICT_PREFS.dailyWindowMinutes, 1, 120),
        jumuahWindowMinutes: clampInt(p.jumuahWindowMinutes, DEFAULT_PRAYER_CONFLICT_PREFS.jumuahWindowMinutes, 1, 240),
      };
    }
  } catch {}
  return { ...DEFAULT_PRAYER_CONFLICT_PREFS };
}

export async function savePrayerConflictPrefs(prefs: PrayerConflictPrefs): Promise<void> {
  await AsyncStorage.setItem(PRAYER_CONFLICT_PREFS_KEY, JSON.stringify(prefs));
}

export type PrayerConflictKind = "none" | "daily" | "jumuah";

export interface PrayerConflict {
  kind: PrayerConflictKind;
  /** The colliding prayer (for "daily"/"jumuah"); omitted for "none". */
  prayer?: DailyPrayer;
}

/**
 * Does an appointment at (date, hour, minute) fall inside a prayer window, given
 * that day's prayer times? `times` must be computed for the SAME calendar day as
 * `date`. Both the appointment time and `times` are compared as the location's
 * wall clock (the documented same-timezone assumption the scheduler already makes).
 *
 * Jumu'ah (Friday Dhuhr) takes precedence and is independent of the daily-warn
 * master toggle; a window is half-open [adhan, adhan + window).
 */
export function detectPrayerConflict(
  date: Date,
  hour: number,
  minute: number,
  times: PrayerTimesResult,
  prefs: PrayerConflictPrefs,
): PrayerConflict {
  const apptMin = hour * 60 + minute;
  const isFriday = date.getDay() === 5;

  const inWindow = (hhmm: string, windowMinutes: number): boolean => {
    // Strict HH:MM (00-23:00-59) — rejects a malformed calculator value like
    // "23:60" rather than deriving a bogus start minute from it.
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
    if (!match) return false;
    const start = Number(match[1]) * 60 + Number(match[2]);
    return apptMin >= start && apptMin < start + windowMinutes;
  };

  // Jumu'ah first: blocks regardless of the daily-warn master.
  if (isFriday && prefs.blockJumuah && inWindow(times.dhuhr, prefs.jumuahWindowMinutes)) {
    return { kind: "jumuah", prayer: "dhuhr" };
  }

  if (prefs.enabled) {
    for (const prayer of DAILY_PRAYERS) {
      // No Friday-Dhuhr skip here: the Jumu'ah branch above already returned if
      // it matched. If it didn't (appt past the Jumu'ah window but still inside
      // the — possibly longer — daily window), Dhuhr must still warn. A `continue`
      // would silently drop that warning whenever dailyWindow > jumuahWindow.
      if (inWindow(times[prayer], prefs.dailyWindowMinutes)) {
        return { kind: "daily", prayer };
      }
    }
  }

  return { kind: "none" };
}
