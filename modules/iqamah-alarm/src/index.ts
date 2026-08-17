/**
 * IqamahAlarm Native Module - TypeScript Interface
 *
 * Android AlarmManager + BroadcastReceiver so iqamah auto-silence fires with
 * the app fully killed, not just in the foreground or on a notification tap
 * (see lib/iqamah-silence.ts for that existing, still-active fallback).
 *
 * On iOS and Web, all functions return safe fallback values — iOS does not
 * allow programmatic ringer control at all (lib/iqamah-silence.ts already
 * early-returns there), and there is no such thing as "app killed" on web.
 */
import { Platform } from "react-native";

// Try to import the native module; returns null on platforms without it
let NativeIqamahAlarm: any = null;

if (Platform.OS === "android") {
  try {
    // In production build, this will resolve to the native module
    NativeIqamahAlarm = require("expo-modules-core").requireNativeModule("IqamahAlarm");
  } catch {
    // Module not available (web preview, iOS, or a dev client built before
    // this module existed)
    NativeIqamahAlarm = null;
  }
}

export interface IqamahAlarmEntry {
  /** Unique per scheduled alarm; must stay stable across calls so a
   *  re-schedule replaces the same slot instead of accumulating extras. */
  requestCode: number;
  /** Epoch ms the silence alarm should fire at. Past timestamps are
   *  skipped natively, same as the existing notification scheduling. */
  triggerAtMs: number;
  /** How long to stay silenced; the receiver self-schedules the matching
   *  restore alarm when this entry fires. */
  durationMinutes: number;
}

/**
 * Check if the native module is available (Android only, production build
 * with this module linked).
 */
export function isAvailable(): boolean {
  return NativeIqamahAlarm !== null && Platform.OS === "android";
}

/**
 * Replace the entire armed silence-alarm schedule. Cancels everything
 * previously armed first, then arms each future entry — an empty array
 * clears all of them (this is how a caller disables the feature; there is
 * no separate cancel function).
 * @returns how many alarms were actually armed (0 if exact-alarm permission
 * is denied, or the module is unavailable).
 */
export async function scheduleSilenceAlarms(entries: IqamahAlarmEntry[]): Promise<number> {
  if (!NativeIqamahAlarm) return 0;
  try {
    return await NativeIqamahAlarm.scheduleSilenceAlarms(entries);
  } catch {
    return 0;
  }
}

/**
 * Persist the current ringer mode as "what to restore to", but only if
 * nothing is already captured for this mute period. Mirrors — and replaces,
 * as the single source of truth — the capture logic that used to live only
 * in AsyncStorage on the JS side.
 */
export async function captureRingerModeIfNeeded(durationMinutes: number): Promise<void> {
  if (!NativeIqamahAlarm) return;
  try {
    await NativeIqamahAlarm.captureRingerModeIfNeeded(durationMinutes);
  } catch {
    // Best-effort; the JS-side fallback capture only runs when this module
    // is unavailable at all (see lib/iqamah-silence.ts), not on this catch.
  }
}

/**
 * Read-and-clear the captured prior ringer mode. Returns null when nothing
 * was captured — callers must never force a ringer mode in that case.
 */
export async function consumePriorRingerMode(): Promise<number | null> {
  if (!NativeIqamahAlarm) return null;
  try {
    const result = await NativeIqamahAlarm.consumePriorRingerMode();
    return result === undefined ? null : result;
  } catch {
    return null;
  }
}
