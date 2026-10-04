/**
 * formatTime's rounding carry (P2-139): Math.round(frac*60) can yield 60
 * (e.g. frac=0.9992 -> 59.952 -> round 60), producing an invalid "04:60".
 * The program parser's strict HH:MM regex then drops that prayer anchor
 * entirely, and the prayer row itself renders the literal ":60". Fixed at
 * the root in formatTime: minute===60 carries into the hour, wrapped %24.
 */
import { describe, it, expect } from "vitest";
import { formatTime } from "./prayer-data";

describe("formatTime", () => {
  it("rounds a normal fractional hour without carrying", () => {
    expect(formatTime(5.5)).toBe("05:30");
  });

  it("carries minute 60 into the hour instead of printing ':60'", () => {
    expect(formatTime(4.9992)).toBe("05:00"); // frac*60 = 59.952 -> rounds to 60
  });

  it("wraps hour 23 + carry back to 00, not 24", () => {
    expect(formatTime(23.9992)).toBe("00:00");
  });
});
