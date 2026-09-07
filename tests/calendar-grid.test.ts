import { describe, it, expect } from "vitest";
import { buildMonthGrid, weekDatesFor, monthsOfYear } from "@/lib/calendar-grid";

describe("buildMonthGrid", () => {
  it("September 2026: full weeks, Monday-start, minimal padding, covers the whole month", () => {
    const grid = buildMonthGrid(2026, 8); // September = index 8 (30 days)

    // dimensions: every week is 7 days; a month needs 4-6 such weeks
    expect(grid.length).toBeGreaterThanOrEqual(4);
    expect(grid.length).toBeLessThanOrEqual(6);
    for (const week of grid) expect(week).toHaveLength(7);

    // Monday-start: first column is always Monday, last is always Sunday
    for (const week of grid) {
      expect(week[0].getDay()).toBe(1);
      expect(week[6].getDay()).toBe(0);
    }

    const cells = grid.flat();
    const first = cells[0];
    const last = cells[cells.length - 1];

    // first & last cell: the grid pads with AT MOST 6 days on each side (one
    // short week), and the padding never crosses into a second extra week
    const sep1 = new Date(2026, 8, 1).getTime();
    const sep30 = new Date(2026, 8, 30).getTime();
    expect(first.getTime()).toBeLessThanOrEqual(sep1);
    expect(sep1 - first.getTime()).toBeLessThanOrEqual(6 * 86400000);
    expect(last.getTime()).toBeGreaterThanOrEqual(sep30);
    expect(last.getTime() - sep30).toBeLessThanOrEqual(6 * 86400000);

    // the grid actually contains the 1st and the last day of the month
    expect(cells.some((d) => d.getMonth() === 8 && d.getDate() === 1)).toBe(true);
    expect(cells.some((d) => d.getMonth() === 8 && d.getDate() === 30)).toBe(true);

    // every cell is one calendar day after the previous one (no gaps/dupes)
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i].getTime() - cells[i - 1].getTime()).toBe(86400000);
    }
  });

  it("leap Feb 2024 reaches the 29th; non-leap Feb 2026 stops at the 28th", () => {
    const leapFeb = buildMonthGrid(2024, 1).flat().filter((d) => d.getMonth() === 1);
    expect(Math.max(...leapFeb.map((d) => d.getDate()))).toBe(29);

    const nonLeapFeb = buildMonthGrid(2026, 1).flat().filter((d) => d.getMonth() === 1);
    expect(Math.max(...nonLeapFeb.map((d) => d.getDate()))).toBe(28);
  });
});

describe("weekDatesFor", () => {
  it("returns 7 consecutive Monday-to-Sunday days containing the given date", () => {
    // Deliberately NOT a Monday, to prove the function finds the containing week.
    const wednesday = new Date(2026, 8, 9);
    const week = weekDatesFor(wednesday);

    expect(week).toHaveLength(7);
    expect(week[0].getDay()).toBe(1); // Monday
    expect(week[6].getDay()).toBe(0); // Sunday

    for (let i = 1; i < 7; i++) {
      expect(week[i].getTime() - week[i - 1].getTime()).toBe(86400000);
    }

    expect(
      week.some(
        (d) => d.getFullYear() === wednesday.getFullYear() && d.getMonth() === wednesday.getMonth() && d.getDate() === wednesday.getDate(),
      ),
    ).toBe(true);
  });

  it("a Monday's week starts on itself; a Sunday's week ends on itself", () => {
    const monday = new Date(2026, 8, 7);
    expect(monday.getDay()).toBe(1);
    const mondayWeek = weekDatesFor(monday);
    expect(mondayWeek[0].getTime()).toBe(monday.getTime());

    const sunday = new Date(2026, 8, 13);
    expect(sunday.getDay()).toBe(0);
    const sundayWeek = weekDatesFor(sunday);
    expect(sundayWeek[6].getTime()).toBe(sunday.getTime());
  });
});

describe("monthsOfYear", () => {
  it("returns the 12 (year, month0) pairs for the given year, in Jan..Dec order", () => {
    const months = monthsOfYear(2026);
    expect(months).toHaveLength(12);
    months.forEach((m, i) => expect(m).toEqual({ year: 2026, month0: i }));
  });
});
