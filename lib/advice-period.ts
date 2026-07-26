/**
 * Advice feeds (personal advice, quick tips, ...) are cached per period and only
 * regenerate when the period changes. We key on the current WEEK so advice stays
 * stable for a week instead of refreshing daily. Computed in UTC to match the
 * app's existing "YYYY-MM-DD" date keys. The week is taken to start on Saturday.
 */
export function currentWeekKey(): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceSaturday = (utc.getUTCDay() + 1) % 7; // Sat=0, Sun=1, ... Fri=6
  utc.setUTCDate(utc.getUTCDate() - daysSinceSaturday);
  return utc.toISOString().slice(0, 10); // date of the most recent Saturday
}
