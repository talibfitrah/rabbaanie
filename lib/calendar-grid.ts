// Pure Gregorian grid math for the روزنامة calendar views (month/week/year).
// No I/O, no RN imports -- Hijri conversion and occasions/events live in
// lib/islamic-calendar.ts / lib/calendar-events.ts, kept out of this module on
// purpose so the grid shape can be unit-tested with plain Dates.

/** Days since Monday for a Date#getDay() value (Sunday=0..Saturday=6). */
function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/** New Date offset by `days` days from `date` (local time; does not mutate `date`). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** The Monday-to-Sunday week (7 Dates) containing `date`. */
export function weekDatesFor(date: Date): Date[] {
  const monday = addDays(date, -mondayIndex(date.getDay()));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Weeks of 7 Dates spanning the given Gregorian month (month0 = 0-based, like
 * Date#getMonth()), padded with trailing days of the previous month and
 * leading days of the next month so every week is Monday-start and full.
 */
export function buildMonthGrid(year: number, month0: number): Date[][] {
  const firstOfMonth = new Date(year, month0, 1);
  const lastOfMonth = new Date(year, month0 + 1, 0);
  const firstCell = addDays(firstOfMonth, -mondayIndex(firstOfMonth.getDay()));
  const lastCell = addDays(lastOfMonth, 6 - mondayIndex(lastOfMonth.getDay()));

  const weeks: Date[][] = [];
  for (let cursor = firstCell; cursor.getTime() <= lastCell.getTime(); cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
  }
  return weeks;
}

/** The 12 (year, month0) pairs of a Gregorian year, Jan..Dec. */
export function monthsOfYear(year: number): { year: number; month0: number }[] {
  return Array.from({ length: 12 }, (_, month0) => ({ year, month0 }));
}
