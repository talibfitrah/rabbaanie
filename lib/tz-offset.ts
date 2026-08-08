/**
 * Milliseconds to add to a UTC instant to read `timezone`'s wall clock.
 *
 * Replaces the technique both notification schedulers used:
 *
 *     const tzDate = new Date(d.toLocaleString("en-US", { timeZone: tz }));
 *
 * V8 parses `"8/8/2026, 1:00:00 PM"`, so that worked in Node and in every
 * test. **Hermes does not** — it returns Invalid Date, the offset became NaN,
 * and every prayer and iqaamah trigger was NaN, which expo silently drops
 * ("will not trigger in the future, removing"). Confirmed on an emulator
 * 2026-08-08: no prayer alarm was ever armed on any device.
 *
 * formatToParts reads the same Intl data `toLocaleString` already reads — Intl
 * itself is fine on Hermes — but returns numbers instead of a string that has
 * to be parsed back. Nothing here depends on a Date-string format.
 *
 * Lives in its own module because notifications.ts and iqamah-silence.ts each
 * had a private copy of this maths, and they were wrong in exactly the same way.
 */
export function timezoneOffsetMs(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`timezoneOffsetMs: Intl gave no "${type}" for ${timezone}`);
    return Number(part.value);
  };

  const wallClockAsUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  // Drop sub-second precision on both sides so the difference is a clean offset.
  return wallClockAsUTC - Math.floor(at.getTime() / 1000) * 1000;
}
