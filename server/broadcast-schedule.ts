/**
 * Pure due-logic for recurring admin broadcasts, mirroring
 * broadcast-audience.ts's leaf-module shape: no DB import, so
 * scripts/send-recurring-broadcasts.ts and server/db.ts's
 * getDueBroadcastSchedules can both call the exact same predicate the tests
 * pin, instead of each re-deriving "is it due" from raw dates.
 *
 * Model: pick specific weekdays + an hour of day (replaces the old "every N
 * days" cadence — see git history for that version).
 *
 * TIMEZONE: every check below reads `now` with LOCAL getters (getDay(),
 * getHours(), getFullYear()/getMonth()/getDate()), never the UTC ones. The
 * cron that calls this (scripts/send-recurring-broadcasts.ts, via
 * getDueBroadcastSchedules) runs on the server's system clock — Netherlands,
 * UTC+1/+2 — and the owner picks weekdays/hours in the admin UI thinking in
 * that same local time ("send at 9am on Fridays" means 9am Amsterdam time,
 * not 9am UTC). Using UTC getters here would silently shift every schedule
 * by 1-2 hours and could even flip which local weekday a late-night UTC
 * boundary lands on.
 */

// Named distinctly from drizzle/schema.ts's BroadcastSchedule (the full DB
// row type) — this is deliberately just the 4 fields the due-check needs, so
// any full schedule row satisfies it structurally without importing schema.ts
// into this leaf module.
export type ScheduleDueInput = {
  active: boolean;
  /** CSV of weekday numbers, 0=Sunday..6=Saturday, e.g. "0,1,2,3,4,5,6" */
  daysOfWeek: string;
  /** Local hour of day to send, 0-23 */
  sendHour: number;
  lastSentAt: Date | string | null;
};

// The `string` type is a promise about well-formed rows, not a runtime
// guarantee: the Postgres column is nullable (a row from before the backfill
// migration, or inserted by future manual SQL, can violate it). Read-time
// backstop, same reasoning as scripts/send-recurring-broadcasts.ts's
// isKnownCategory — one malformed row must not throw out of the .filter()
// in getDueBroadcastSchedules and take down every OTHER schedule's due-check
// for that cron tick.
function parseDaysOfWeek(csv: string): Set<number> {
  if (!csv) return new Set();
  return new Set(
    csv
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
  );
}

/** Same local calendar date (year/month/day), ignoring time-of-day. */
function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** A schedule is due iff: active, now's local weekday is one of daysOfWeek,
 *  now's local hour EQUALS sendHour, and it hasn't already sent on this local
 *  date (never-sent counts as not-yet-sent-today). Exact-hour match (not
 *  `>=`) is deliberate and load-bearing — the cron runs hourly, so each
 *  schedule matches exactly one tick per selected day. That exactness:
 *   • makes activating a schedule after its hour start on the NEXT selected
 *     day, not fire an immediate surprise blast to everyone the moment the
 *     admin flips it on (immediate sends are what the manual "send now"
 *     button is for), and
 *   • bounds a mark-sent-failure re-send to once per occurrence (daily/
 *     weekly), not every hour as `>=` would.
 *  Accepted cost: no catch-up — if the exact-sendHour tick is missed (server
 *  down that hour), that one occurrence is skipped and self-heals on the next
 *  selected day. Fine for a non-critical reminder push. */
export function isScheduleDue(schedule: ScheduleDueInput, now: Date): boolean {
  if (!schedule.active) return false;
  if (!parseDaysOfWeek(schedule.daysOfWeek).has(now.getDay())) return false;
  if (now.getHours() !== schedule.sendHour) return false;
  if (schedule.lastSentAt == null) return true;
  return !isSameLocalDate(new Date(schedule.lastSentAt), now);
}
