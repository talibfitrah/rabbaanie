import { Platform } from "react-native";

/**
 * iOS keeps at most 64 pending local notification requests per app. Past that
 * it silently discards the rest — it keeps the SOONEST-firing ones, with no
 * error, no rejection and no log.
 *
 * App launch runs ten schedulers (app/_layout.tsx). With every 7-day horizon at
 * its full length they ask for 167 requests — measured, not estimated, by
 * tests/ios-notification-budget.test.ts. So on iPhone roughly the first day and
 * a half survived and everything after it vanished, interleaved across
 * features: the later days of the prayer notifications this app exists for were
 * dropped by the iqamah reminders, which on iOS cannot silence anything at all
 * (see remindOnly in lib/iqamah-silence.ts) and were the single heaviest
 * consumer at 70 requests.
 *
 * The horizons below spend one shared budget in priority order — prayer and
 * adhkaar first, then the prayer-anchored adhkar/qiyam reminders, then the
 * daily nudges, with iqamah trimmed hardest. The app reschedules on launch AND
 * on the first foreground of each new day (lib/notification-refresh — without
 * that listener a resident process never refills these horizons and the
 * truncation bug just becomes an expiry bug), so a shorter horizon costs
 * something only for a user who does not open the app for days — and that user
 * loses notifications today anyway, unpredictably.
 *
 * Android has no such cap and keeps its existing horizons unchanged.
 */
export const IOS_PENDING_BUDGET = 64;

/**
 * What the iOS horizons are sized to. The gap under the cap is deliberate
 * headroom: preference combinations no fixture covers must not tip the total
 * over 64 and put the silent truncation back.
 *
 * The schedule sits at EXACTLY 59 today — on the target, five under the cap.
 * Raising the iman horizon to 2 spent the first slot of slack, and that was the
 * right trade: at 1 the after-Fajr goal reminder was unreachable for anyone who
 * did not launch before dawn, which is a whole reminder type lost rather than a
 * thinner horizon. The daily check-in reminder (one DAILY notification, added
 * with the daily-engagement work in lib/notifications.ts) spent the next slot:
 * a new launch notification funded from headroom rather than by cutting a prayer
 * or reminder horizon. If more room is ever needed, the lever is not another
 * horizon cut — it is the duplicate adhkaar. lib/notifications.ts fires morning
 * adhkaar at Fajr+5 and evening at Asr while lib/islamic-reminders.ts fires
 * morning adhkar at Fajr+10 and evening at Asr+10: four near-identical
 * notifications a day, two pairs five to ten minutes apart, on BOTH platforms.
 * Deduping frees four to six slots. It is a content decision, not a horizon
 * tweak, which is why it is written here rather than done.
 */
export const IOS_PENDING_TARGET = 59;

const DAYS = {
  /** 6 prayers + 2 adhkaar per day. The headline feature, so the longest iOS horizon. */
  prayer: { ios: 3, other: 7 },
  /** Morning adhkar + evening adhkar + qiyam per day. */
  islamic: { ios: 2, other: 7 },
  /**
   * Ikhlas before Dhuhr + goal after Fajr per day.
   *
   * TWO on iOS, not one, and the extra day is not slack. Both loops in
   * lib/iman-notifications.ts skip a trigger already in the past
   * (`triggerDate.getTime() > now.getTime()`). The goal reminder fires at
   * Fajr + 30 min, so at a one-day horizon it is only ever scheduled by a
   * scheduling pass that runs BEFORE dawn — and neither of the two there are, a
   * cold launch and the day's first foreground, normally does, so a normal user
   * would never receive it at all. That is losing a whole reminder type,
   * not part of a day. Anything prayer-anchored that skips past triggers needs
   * at least two days for the same reason; iqamah below is the one deliberate
   * exception, and it carries its own note saying so.
   */
  iman: { ios: 2, other: 3 },
  // ponytail: one day means "the rest of today" — a launch after the last
  // iqamah of the day schedules none on iOS until the next launch. Accepted
  // because iOS truncation already gave this feature about that much reach,
  // and it buys the prayer horizon three guaranteed days. Widen it if the
  // repeating DAILY/WEEKLY triggers (14 of the 56) are ever reclaimed.
  /** 5 prayers x (silence + restore) per day = 10 — the heaviest line, trimmed hardest. */
  iqamah: { ios: 1, other: 7 },
} as const;

/**
 * How many days of DATE-triggered notifications `scheduler` may schedule on
 * this platform. Read at call time, never at module scope, so it follows the
 * platform the same way the schedulers' own `Platform.OS` checks do.
 */
export function scheduleDays(scheduler: keyof typeof DAYS): number {
  return Platform.OS === "ios" ? DAYS[scheduler].ios : DAYS[scheduler].other;
}
