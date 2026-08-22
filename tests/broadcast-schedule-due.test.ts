import { describe, it, expect } from "vitest";
import { isScheduleDue } from "../server/broadcast-schedule";

// Fixed Date literals throughout (never Date.now()) so pass/fail never
// depends on when the test happens to run.
const NOW = new Date("2026-08-22T09:00:00Z");

describe("isScheduleDue", () => {
  it("is due when active and never sent before", () => {
    expect(
      isScheduleDue({ active: true, cadenceDays: 1, lastSentAt: null }, NOW),
    ).toBe(true);
  });

  it("is not due when sent earlier today and cadence is 1 day", () => {
    expect(
      isScheduleDue(
        { active: true, cadenceDays: 1, lastSentAt: new Date("2026-08-22T02:00:00Z") },
        NOW,
      ),
    ).toBe(false);
  });

  it("is due when sent exactly 3 days ago and cadence is 3 days", () => {
    expect(
      isScheduleDue(
        { active: true, cadenceDays: 3, lastSentAt: new Date("2026-08-19T09:00:00Z") },
        NOW,
      ),
    ).toBe(true);
  });

  it("is never due when inactive, even if long overdue", () => {
    expect(
      isScheduleDue(
        { active: false, cadenceDays: 1, lastSentAt: new Date("2026-08-01T09:00:00Z") },
        NOW,
      ),
    ).toBe(false);
  });

  it("is not due when sent 1 day ago and cadence is 3 days", () => {
    expect(
      isScheduleDue(
        { active: true, cadenceDays: 3, lastSentAt: new Date("2026-08-21T09:00:00Z") },
        NOW,
      ),
    ).toBe(false);
  });

  // Cron fires at a fixed wall-clock minute, but the runner's `now = new
  // Date()` is captured at process start, which jitters by fractions of a
  // second run to run (tsx/npx startup cost varies). A raw-millisecond
  // "floor(elapsed / dayMs)" comparison would round a jittered ~23h59m58s
  // gap down to 0 full days and skip cadenceDays=1 entirely — even though
  // the calendar day has genuinely turned over. Both timestamps below are
  // within a couple seconds of the fixed 09:00 hour, on consecutive
  // calendar days.
  it("is due despite sub-second jitter shrinking the gap just under 24h, once the calendar day has turned over", () => {
    expect(
      isScheduleDue(
        { active: true, cadenceDays: 1, lastSentAt: new Date("2026-08-21T09:00:01Z") },
        new Date("2026-08-22T08:59:59Z"),
      ),
    ).toBe(true);
  });
});
