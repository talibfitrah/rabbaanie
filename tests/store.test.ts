import { describe, expect, it } from "vitest";
import { calculateAgeInWeeks, getYearKey, getWeekInYear } from "../lib/store";

describe("calculateAgeInWeeks", () => {
  it("should calculate age correctly for a 2-year-old", () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const result = calculateAgeInWeeks(twoYearsAgo.toISOString());
    expect(result.years).toBe(2);
    expect(result.totalWeeks).toBeGreaterThanOrEqual(104);
    expect(result.totalWeeks).toBeLessThan(106);
  });

  it("should calculate age correctly for a newborn", () => {
    const today = new Date();
    const result = calculateAgeInWeeks(today.toISOString());
    expect(result.years).toBe(0);
    expect(result.months).toBe(0);
    expect(result.totalWeeks).toBe(0);
  });

  it("should calculate age correctly for a 5-year-old", () => {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const result = calculateAgeInWeeks(fiveYearsAgo.toISOString());
    expect(result.years).toBe(5);
    expect(result.totalWeeks).toBeGreaterThanOrEqual(260);
  });
});

describe("getYearKey", () => {
  it("should return Jaar -1 for negative years", () => {
    expect(getYearKey(-1)).toBe("Jaar -1");
  });

  it("should return Jaar -1 for very negative years (capped)", () => {
    expect(getYearKey(-5)).toBe("Jaar -1");
  });

  it("should return Jaar 0 for age 0", () => {
    expect(getYearKey(0)).toBe("Jaar 0");
  });

  it("should return Jaar 5 for age 5", () => {
    expect(getYearKey(5)).toBe("Jaar 5");
  });

  it("should cap at Jaar 18 for ages above 18", () => {
    expect(getYearKey(20)).toBe("Jaar 18");
  });
});

describe("getWeekInYear", () => {
  it("should return week 1 for the first week of a year", () => {
    expect(getWeekInYear(52, 1)).toBe(1); // First week of year 1
  });

  it("should return week 10 for the 10th week of year 0", () => {
    expect(getWeekInYear(9, 0)).toBe(10);
  });

  it("should return correct week within a year", () => {
    // 120 total weeks, 2 years = 104 weeks, so 120 - 104 + 1 = 17
    expect(getWeekInYear(120, 2)).toBe(17);
  });
});
