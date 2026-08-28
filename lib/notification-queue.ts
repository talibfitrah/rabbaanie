/**
 * One queue for every notification scheduler in the app.
 *
 * Each scheduler does an unatomic read -> cancel-own -> schedule against the OS
 * pending list. Two overlapping passes therefore double-schedule: the second
 * pass reads the pending list before the first has written its requests, so its
 * cancel misses them and it appends a second copy. Measured on the counting
 * harness in tests/notification-schedule-overlap.test.ts: a settled iOS launch
 * sits at 58 pending, and two overlapping scheduleIqamahSilence passes take it
 * to 68 — past the 64 iOS keeps, which silently discards the rest (see
 * lib/notification-horizons.ts).
 *
 * Overlap is reachable in the shipping app: app/_layout.tsx's launch effect
 * re-runs on popup toggles, lib/notification-refresh.ts re-runs the whole
 * sequence on the first foreground of a new day, and
 * app/(tabs)/notification-settings.tsx calls the iqamah and Islamic-reminder
 * schedulers straight from switch handlers in interactive time.
 *
 * This lived in lib/notifications.ts and covered only that module's own pass;
 * it is here so that ALL TEN schedulers in app/_layout.tsx's launch sequence
 * share ONE queue — the count is ten, not seven: lib/notifications.ts also
 * exports scheduleWeeklyReminder, scheduleInactivityReminder and
 * scheduleGoalsIncompleteReminder, which were briefly left out on the grounds
 * that one notification each puts the worst case at 61, still under the cap.
 * That reasoning spent half the six-slot headroom to save twelve lines, on the
 * same day two new ways to re-enter the sequence concurrently were added (the
 * permissionsSetupCompleted dep and the foreground refresh). There is no
 * deliberate exception: if a scheduler is in the launch sequence, it queues. A queue rather than a
 * "skip if busy" flag because the later call is usually the one with the newer
 * settings: it waits, then re-runs from scratch, so the end state is the LAST
 * caller's output.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `job` after everything already queued, and keeps the queue unbroken.
 *
 * The `.catch` is what makes a rejecting job survivable: the queue advances on
 * the swallowed copy while the caller still receives the rejection through the
 * returned promise. Without it one thrown error would leave the queue permanently
 * rejected and silently drop every scheduling pass for the rest of the process.
 *
 * Not re-entrant: a job that calls `enqueue` again waits on a queue that cannot
 * advance until it returns. There is exactly one such nested call — the daily
 * advice pass inside scheduleAllNotifications — and it goes through
 * scheduleDailyAdviceUnqueued instead.
 */
export function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
}
