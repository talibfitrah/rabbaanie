/**
 * Pure due-logic for recurring admin broadcasts, mirroring
 * broadcast-audience.ts's leaf-module shape: no DB import, so
 * scripts/send-recurring-broadcasts.ts and server/db.ts's
 * getDueBroadcastSchedules can both call the exact same predicate the tests
 * pin, instead of each re-deriving "is it due" from raw dates.
 */

// Named distinctly from drizzle/schema.ts's BroadcastSchedule (the full DB
// row type) — this is deliberately just the 3 fields the due-check needs, so
// any full schedule row satisfies it structurally without importing schema.ts
// into this leaf module.
export type ScheduleDueInput = {
  active: boolean;
  cadenceDays: number;
  lastSentAt: Date | string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Number of UTC calendar days from `a`'s date to `b`'s date (time-of-day
 *  ignored). Deliberately NOT a raw millisecond division: the runner's
 *  `now = new Date()` is captured at process start, which jitters by
 *  fractions of a second run to run (tsx/npx startup cost varies) even
 *  though cron fires at the same wall-clock minute every day. A raw
 *  "elapsed-ms // day-length" comparison rounds a jittered ~23h59m59s gap
 *  down to 0 full days and silently skips a cadenceDays=1 schedule — see
 *  tests/broadcast-schedule-due.test.ts's jitter case. Comparing calendar
 *  dates instead is immune to that, as long as the cron's configured
 *  trigger hour isn't itself within seconds of UTC midnight — crontab
 *  interprets "0 9 * * *" in the server's LOCAL timezone, not UTC, but the
 *  day math here runs in UTC regardless; a server local 09:00 is nowhere
 *  near UTC midnight for any timezone this app runs in (Netherlands/
 *  Belgium, UTC+1/+2). */
function calendarDaysBetween(a: Date, b: Date): number {
  const dayA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const dayB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((dayB - dayA) / DAY_MS);
}

/** A schedule is due once `cadenceDays` calendar days have passed since
 *  lastSentAt (never sent counts as due immediately). */
export function isScheduleDue(schedule: ScheduleDueInput, now: Date): boolean {
  if (!schedule.active) return false;
  if (schedule.lastSentAt == null) return true;
  return calendarDaysBetween(new Date(schedule.lastSentAt), now) >= schedule.cadenceDays;
}
