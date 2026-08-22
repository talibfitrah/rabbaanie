import { describe, it, expect } from "vitest";
import { isScheduleDue } from "../server/broadcast-schedule";

// Fixed Date literals throughout (never Date.now()), and always the LOCAL
// constructor form `new Date(y, m, d, h)` rather than an ISO "Z" string —
// isScheduleDue reads now.getDay()/getHours() in the machine's local
// timezone (see broadcast-schedule.ts's header comment for why), so a local
// constructor is the only form whose getDay()/getHours() are deterministic
// regardless of which timezone the test happens to run in.
//
// Both dates below were verified with
// `node -e "console.log(new Date(2026,7,22,9).getDay(), new Date(2026,7,25,9).getDay())"`
// rather than hand-computed: Aug 22 2026 09:00 local is a Saturday (6),
// Aug 25 2026 09:00 local is a Tuesday (2).
const SATURDAY_9AM = new Date(2026, 7, 22, 9, 0, 0);
const TUESDAY_9AM = new Date(2026, 7, 25, 9, 0, 0);

describe("isScheduleDue", () => {
  it("is due: never sent, active, today's weekday and hour both match", () => {
    expect(
      isScheduleDue(
        { active: true, daysOfWeek: "6", sendHour: 9, lastSentAt: null },
        SATURDAY_9AM,
      ),
    ).toBe(true);
  });

  it("is not due when today's weekday is not in daysOfWeek", () => {
    expect(
      isScheduleDue(
        { active: true, daysOfWeek: "2", sendHour: 9, lastSentAt: null }, // Tuesday only
        SATURDAY_9AM, // but today is Saturday
      ),
    ).toBe(false);
  });

  it("is not due before sendHour (9am now, schedule set for 10am)", () => {
    expect(
      isScheduleDue(
        { active: true, daysOfWeek: "6", sendHour: 10, lastSentAt: null },
        SATURDAY_9AM, // hour is 9, before 10
      ),
    ).toBe(false);
  });

  it("is not due after sendHour (exact-hour match, no catch-up): 11am now, schedule set for 9am", () => {
    const SATURDAY_11AM = new Date(2026, 7, 22, 11, 0, 0);
    expect(
      isScheduleDue(
        { active: true, daysOfWeek: "6", sendHour: 9, lastSentAt: null },
        SATURDAY_11AM, // past 9am; exact-match means this occurrence is skipped, not caught up
      ),
    ).toBe(false);
  });

  it("is not due when already sent earlier today, even if day+hour match", () => {
    const sentEarlierToday = new Date(2026, 7, 22, 3, 0, 0); // same local calendar date
    expect(
      isScheduleDue(
        { active: true, daysOfWeek: "6", sendHour: 9, lastSentAt: sentEarlierToday },
        SATURDAY_9AM,
      ),
    ).toBe(false);
  });

  it("is due again on the next matching day after being sent on a previous day", () => {
    const sentLastWeek = new Date(2026, 7, 15, 9, 0, 0); // same weekday, 7 days earlier
    expect(
      isScheduleDue(
        { active: true, daysOfWeek: "6", sendHour: 9, lastSentAt: sentLastWeek },
        SATURDAY_9AM,
      ),
    ).toBe(true);
  });

  it("is never due when inactive, even if day, hour, and never-sent all match", () => {
    expect(
      isScheduleDue(
        { active: false, daysOfWeek: "6", sendHour: 9, lastSentAt: null },
        SATURDAY_9AM,
      ),
    ).toBe(false);
  });

  it('parses "0,6" as weekend-only: matches Saturday, not a Tuesday', () => {
    const weekendOnly = { active: true, daysOfWeek: "0,6", sendHour: 9, lastSentAt: null };
    expect(isScheduleDue(weekendOnly, SATURDAY_9AM)).toBe(true);
    expect(isScheduleDue(weekendOnly, TUESDAY_9AM)).toBe(false);
  });

  // The type says daysOfWeek is always a string, but the column it's read
  // from (Postgres) allows NULL — a row inserted before the backfill
  // migration, or by future manual SQL, violates the type at runtime. This
  // one row must not crash the whole hourly cron tick for every OTHER
  // schedule (see getDueBroadcastSchedules's unguarded .filter(isScheduleDue)).
  it("treats a null daysOfWeek as never-due instead of throwing", () => {
    const malformed = { active: true, daysOfWeek: null as any, sendHour: 9, lastSentAt: null };
    expect(() => isScheduleDue(malformed, SATURDAY_9AM)).not.toThrow();
    expect(isScheduleDue(malformed, SATURDAY_9AM)).toBe(false);
  });
});
