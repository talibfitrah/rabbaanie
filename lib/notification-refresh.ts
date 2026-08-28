import { AppState } from "react-native";

/**
 * Re-runs the launch schedulers when the app returns to the foreground on a new
 * calendar day, so the shortened iOS horizons are refilled while the process
 * lives.
 *
 * lib/notification-horizons cut those horizons to 1-3 days because iOS silently
 * discards everything past 64 pending requests. That is only survivable if the
 * window is refilled often, and it was not: the sole scheduler entry point
 * (initNotifications in app/_layout.tsx) is invoked from one useEffect keyed on
 * auth/age state, so in the steady state it ran once per PROCESS start, not once
 * per open, and nothing watched the foreground — the app's only other AppState
 * listener, app/child-account/usage-permission.tsx, re-checks a native
 * permission on one screen. iOS keeps apps resident for days, so a user who
 * opened the app daily without ever
 * force-quitting got exactly one scheduling pass: iqamah reminders stopped after
 * that day, prayer reminders after three, silently. The truncation bug had
 * simply become an expiry bug. Android's 7-day horizons and far more aggressive
 * process eviction hid the same hole, which is why it only bit on iOS — and why
 * this is not platform-branched: a resident Android process expires the same
 * way.
 *
 * Throttled on the calendar day rather than a timer because the horizons are
 * themselves day-based: nothing new becomes schedulable until the day rolls
 * over, while an unthrottled listener would re-run ~200 async notification calls
 * every time the user glanced at another app. The stamp is in memory because its
 * only job is suppressing redundant passes WITHIN one process — a cold start
 * schedules from the mount effect without consulting it, so persisting it would
 * add storage I/O and an async read to the foreground path and change no
 * outcome.
 *
 * `eligible` is the caller's already-computed canUseNotifications() result,
 * passed in rather than recomputed, so a foreground pass can never outlive the
 * age gate or a sign-out. Keep it a parameter: moving the call site inside the
 * caller's own `if (eligible)` branch is one line shorter and makes the gate
 * structural, which no test can execute — the parameter is what lets
 * tests/notification-foreground-refresh.test.ts prove an ineligible user gets
 * no listener. Returns the unsubscribe, for the effect cleanup.
 */
/**
 * Attempts allowed per calendar day before giving up until the day rolls over.
 *
 * Bounds the retry so a pass that throws CONSISTENTLY — a permanently denied
 * permission, a corrupt stored location — cannot re-run the whole ~120-call
 * sequence on every single foreground for the rest of the day.
 */
const MAX_ATTEMPTS_PER_DAY = 3;

export function rescheduleOnForeground(
  eligible: boolean,
  reschedule: () => Promise<void>,
): () => void {
  if (!eligible) return () => {};

  // Seeded with today, because the first "active" after a cold start must be a
  // no-op — the mount effect has already scheduled by then.
  let scheduledOn = new Date().toDateString();
  let attemptDay = scheduledOn;
  let attemptsToday = 0;
  // What stamping-before-the-pass used to provide: iOS emits repeated
  // inactive/active flips, and without this each one would stack another pass.
  let inFlight = false;

  const subscription = AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    const today = new Date().toDateString();
    if (today === scheduledOn) return;
    if (inFlight) return;

    if (today !== attemptDay) {
      attemptDay = today;
      attemptsToday = 0;
    }
    if (attemptsToday >= MAX_ATTEMPTS_PER_DAY) return;
    attemptsToday += 1;
    // Stamped on SUCCESS, not before the pass. Stamping first meant one
    // transient failure burned the whole calendar day with nothing
    // user-visible — and on iOS the horizons are 1 day (iqamah) to 3 (prayer),
    // so "wait for tomorrow" can mean the headline feature simply stops.
    //
    // This was originally the other way round because the schedulers were
    // unserialized and overlapping passes measured 68 pending against the real
    // 64 cap. All ten now share one queue (lib/notification-queue.ts), so that
    // objection is gone; `inFlight` above covers the flip-stacking the early
    // stamp was also doing, and MAX_ATTEMPTS_PER_DAY bounds the retry.
    reschedule()
      .then(() => {
        scheduledOn = today;
      })
      .catch((error) => {
        console.warn("[Notifications] Foreground reschedule failed:", error);
      })
      .finally(() => {
        inFlight = false;
      });
    inFlight = true;
  });

  return () => subscription.remove();
}
