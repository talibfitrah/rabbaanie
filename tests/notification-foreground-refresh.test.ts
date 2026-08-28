import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * lib/notification-horizons cut the iOS scheduling horizons to 1-3 days because
 * iOS silently drops everything past 64 pending requests, and justified it with
 * "the app reschedules on every launch". That premise was false: the only
 * scheduler entry point (initNotifications) runs from one useEffect keyed on
 * auth/age state, so it fired once per PROCESS start, and nothing watched the
 * foreground — the app's only other AppState listener,
 * app/child-account/usage-permission.tsx, re-checks a native permission on one
 * screen. iOS keeps apps resident for days, so a user who
 * opened the app daily without force-quitting got one scheduling pass ever —
 * iqamah reminders died after that day, prayer reminders after three.
 *
 * These assert PRESENCE first and throttling second, in that order and on
 * purpose. A guard that only checked "does not reschedule too often" passes
 * perfectly when rescheduling never happens at all, which is the exact bug
 * being fixed here.
 */

// toDateString() reads local time, so the day boundary depends on the zone.
vi.hoisted(() => {
  process.env.TZ = "Europe/Amsterdam";
});

/**
 * A real handler registry, not a call counter: the test has to be able to fire
 * the transition and observe that unsubscribing actually detaches, which a
 * spy's call count cannot show.
 */
const appState = vi.hoisted(() => {
  const handlers = new Set<(state: string) => void>();
  return {
    handlers,
    addEventListener: (event: string, handler: (state: string) => void) => {
      if (event !== "change") throw new Error(`unexpected event: ${event}`);
      handlers.add(handler);
      return { remove: () => handlers.delete(handler) };
    },
    emit: (state: string) => [...handlers].forEach((h) => h(state)),
  };
});

vi.mock("react-native", () => ({ AppState: appState }));

import { rescheduleOnForeground } from "@/lib/notification-refresh";

/**
 * Straddling LOCAL midnight while staying inside one UTC day: DAY_1 is
 * 21:30Z and DAY_2 is 22:30Z, both 1 September in UTC but different days in
 * Amsterdam. The horizons are local-day based, so an implementation that keyed
 * off the UTC date would see no rollover here and fail — which is the point.
 */
const DAY_1 = new Date("2026-09-01T23:30:00+02:00");
const DAY_2 = new Date("2026-09-02T00:30:00+02:00");
const DAY_3 = new Date("2026-09-03T00:30:00+02:00");

describe("rescheduling when the app returns to the foreground", () => {
  beforeEach(() => {
    appState.handlers.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(DAY_1);
  });
  afterEach(() => vi.useRealTimers());

  it("reschedules on the first foreground of a new day", () => {
    const reschedule = vi.fn().mockResolvedValue(undefined);
    rescheduleOnForeground(true, reschedule);

    vi.setSystemTime(DAY_2);
    appState.emit("active");

    expect(reschedule).toHaveBeenCalledTimes(1);
  });

  it("does not reschedule on a foreground the same day it last scheduled", () => {
    const reschedule = vi.fn().mockResolvedValue(undefined);
    rescheduleOnForeground(true, reschedule);

    // The cold-start case: the mount effect has just scheduled, and iOS raises
    // "active" right after launch. Re-running ~200 async notification calls
    // there — and on every glance at another app — is what the day stamp exists
    // to prevent.
    appState.emit("active");
    vi.setSystemTime(new Date("2026-09-01T23:55:00+02:00"));
    appState.emit("active");

    expect(reschedule).not.toHaveBeenCalled();
  });

  it("reschedules once per day, not once per foreground", async () => {
    const reschedule = vi.fn().mockResolvedValue(undefined);
    rescheduleOnForeground(true, reschedule);

    vi.setSystemTime(DAY_2);
    appState.emit("active");
    appState.emit("active");
    appState.emit("active");
    expect(reschedule).toHaveBeenCalledTimes(1);

    // Awaited because the day is stamped on SUCCESS now, so it lands on a
    // microtask rather than synchronously. Without this the in-flight guard is
    // still set and the next day's transition is (correctly) ignored.
    await flush();

    // The stamp has to ADVANCE, not just be set once: a stamp frozen at the
    // registration day would reschedule on all three of the above, and one
    // frozen at the first refresh would never fire again.
    vi.setSystemTime(DAY_3);
    appState.emit("active");
    expect(reschedule).toHaveBeenCalledTimes(2);
  });

  /** Lets the stamp-on-success `.then` and its `.finally` settle. */
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it("does not burn the day when the pass throws", async () => {
    // Stamping BEFORE the pass meant one transient failure cost the whole
    // calendar day, with nothing user-visible — and at a 1-day iqamah horizon
    // and 3-day prayer horizon, "wait for tomorrow" can mean the headline
    // feature stops entirely.
    const reschedule = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue(undefined);
    rescheduleOnForeground(true, reschedule);

    vi.setSystemTime(DAY_2);
    appState.emit("active");
    expect(reschedule).toHaveBeenCalledTimes(1);
    await flush();

    // Same day, and it retries — because the failed pass did not stamp.
    appState.emit("active");
    expect(reschedule).toHaveBeenCalledTimes(2);
    await flush();

    // That one succeeded, so the day is now stamped and further foregrounds
    // are no-ops. Presence AND absence: a retry that never stops is the other
    // half of this bug.
    appState.emit("active");
    expect(reschedule).toHaveBeenCalledTimes(2);
  });

  it("gives up for the day after repeated failures", async () => {
    // A pass that throws CONSISTENTLY — permission permanently denied, a
    // corrupt stored location — must not re-run ~120 OS calls on every single
    // foreground for the rest of the day.
    const reschedule = vi.fn().mockRejectedValue(new Error("permanent"));
    rescheduleOnForeground(true, reschedule);

    vi.setSystemTime(DAY_2);
    for (let i = 0; i < 6; i++) {
      appState.emit("active");
      await flush();
    }
    expect(reschedule).toHaveBeenCalledTimes(3);

    // ...and the cap is per DAY, not for the lifetime of the listener.
    vi.setSystemTime(DAY_3);
    appState.emit("active");
    await flush();
    expect(reschedule).toHaveBeenCalledTimes(4);
  });

  it("ignores transitions that are not a return to the foreground", () => {
    const reschedule = vi.fn().mockResolvedValue(undefined);
    rescheduleOnForeground(true, reschedule);

    vi.setSystemTime(DAY_2);
    appState.emit("background");
    appState.emit("inactive");

    expect(reschedule).not.toHaveBeenCalled();
  });

  it("never schedules for a user the age gate or sign-in state rules out", () => {
    const reschedule = vi.fn().mockResolvedValue(undefined);
    rescheduleOnForeground(false, reschedule);

    // Not merely inert — nothing is listening, so an ineligible user cannot
    // start scheduling later by leaving the app resident across midnight.
    expect(appState.handlers.size).toBe(0);

    vi.setSystemTime(DAY_2);
    appState.emit("active");
    expect(reschedule).not.toHaveBeenCalled();
  });

  it("stops listening when the caller unsubscribes", () => {
    const reschedule = vi.fn().mockResolvedValue(undefined);
    const stop = rescheduleOnForeground(true, reschedule);
    expect(appState.handlers.size).toBe(1);

    // The effect re-runs whenever auth or age state changes. Without this the
    // listeners stack up and each new day fires a scheduling pass per mount.
    stop();
    expect(appState.handlers.size).toBe(0);

    vi.setSystemTime(DAY_2);
    appState.emit("active");
    expect(reschedule).not.toHaveBeenCalled();
  });
});

/**
 * The behaviour above is worth nothing if nothing calls it. app/_layout.tsx is
 * where the single scheduler entry point lives and the only place the listener
 * belongs, and it cannot be rendered here — there is no React renderer in this
 * project's devDependencies — so the wiring is asserted against the source.
 */
describe("app/_layout.tsx wiring (scanned, not rendered)", () => {
  const layout = readFileSync(
    join(__dirname, "..", "app", "_layout.tsx"),
    "utf8",
  );
  // Scoped to the component, so an unrelated canUseNotifications binding added
  // earlier in this 900-line file cannot be captured instead of the real one.
  const lifecycle = layout.slice(
    layout.indexOf("function NotificationLifecycle"),
  );

  it("imports the foreground refresh", () => {
    expect(layout).toMatch(
      /import\s*\{[^}]*\brescheduleOnForeground\b[^}]*\}\s*from\s*["']@\/lib\/notification-refresh["']/,
    );
  });

  it("gates it on the same canUseNotifications result the mount path uses", () => {
    // Whatever that call is bound to has to be what reaches the listener. A
    // literal `true`, or a second eligibility check drifting from this one,
    // fails here — the age gate and sign-out must reach the foreground path.
    const eligible = lifecycle.match(
      /(?:const|let|var)\s+(\w+)\s*=\s*canUseNotifications\(/,
    );
    expect(
      eligible?.[1],
      "no canUseNotifications binding in NotificationLifecycle",
    ).toBeDefined();
    expect(lifecycle).toMatch(
      new RegExp(`rescheduleOnForeground\\(\\s*${eligible![1]}\\s*,`),
    );
  });

  it("unsubscribes it from the effect cleanup, not eagerly", () => {
    // Auth and age state settle after mount, so this effect re-runs; a
    // subscription left attached per run means N scheduling passes per day.
    const stop = lifecycle.match(
      /(?:const|let|var)\s+(\w+)\s*=\s*rescheduleOnForeground\(/,
    );
    expect(
      stop?.[1],
      "rescheduleOnForeground's return value is discarded",
    ).toBeDefined();

    // WHERE it is called matters as much as THAT it is called: an unsubscribe
    // on the line after the registration satisfies "is it called anywhere?"
    // while detaching the listener immediately and killing the feature.
    const registered = lifecycle.indexOf("rescheduleOnForeground(");
    const cleanupOpens = lifecycle.indexOf("return () => {", registered);
    expect(
      cleanupOpens,
      "the effect returns no cleanup closure",
    ).toBeGreaterThan(-1);
    expect(lifecycle.indexOf(`${stop![1]}()`, registered)).toBeGreaterThan(
      cleanupOpens,
    );
  });
});

/**
 * The other way a scheduling pass fails to happen: it is never triggered.
 *
 * app/permissions-setup.tsx requests notification permission and then calls
 * completePermissionsSetup(), which flips `permissionsSetupCompleted` and
 * persists it. That flag touches none of NotificationLifecycle's auth/age deps,
 * so before it was added to the dependency array the effect never re-ran and a
 * first-run user who granted permission during onboarding had NOTHING scheduled
 * until their next cold start. That is the exact path App Review takes on a
 * prayer-times app: install, grant, wait for a prayer.
 *
 * Guarded by a source scan because the dep is deliberately NOT read inside the
 * effect body — its only job is to re-trigger the pass. That makes it look like
 * a mistake to anyone tidying unused variables, and deleting it restores the
 * bug silently: nothing throws, nothing logs, the app simply never schedules
 * for that user. Whitespace is collapsed first so the match survives a
 * reformat rather than going red on correct code.
 */
describe("granting notification permission triggers a scheduling pass", () => {
  const layout = readFileSync(
    join(__dirname, "..", "app/_layout.tsx"),
    "utf8",
  ).replace(/\s+/g, " ");

  it("reads the permissions flag in NotificationLifecycle", () => {
    expect(
      layout,
      "NotificationLifecycle no longer observes permissionsSetupCompleted, so " +
        "granting permission during onboarding schedules nothing until the next " +
        "cold start",
    ).toContain("appState.permissionsSetupCompleted");
  });

  it("keeps it in the effect's dependency array, where its only job is", () => {
    // The effect body never reads it. Presence in the deps IS the mechanism, so
    // this asserts the deps specifically rather than merely that the name
    // appears somewhere in the file.
    const deps = layout.slice(
      layout.indexOf("ageStatus, authLoading, dismissPopup, initialize"),
    );
    expect(
      deps.slice(0, 400),
      "permissionsSetupDone was dropped from the dependency array — it is unread " +
        "inside the effect by design, so it looks removable and is not",
    ).toContain("permissionsSetupDone");
  });
});

/**
 * A superseded scheduling pass must not cancel the pass that replaced it.
 *
 * NotificationLifecycle's cleanup sets `eligible = false` on EVERY teardown,
 * not only when the user loses eligibility. So a run torn down because some
 * unrelated dep changed reaches its own `.finally`, reads that flag, concludes
 * the user became ineligible, and calls
 * `Notifications.cancelAllScheduledNotificationsAsync()` — wiping whatever the
 * newer pass has already written. That cancel is NOT on
 * lib/notification-queue.ts, so the shared queue does not order it against the
 * new pass's jobs.
 *
 * Latent until `permissionsSetupCompleted` became a dep: it starts false in
 * defaultAppState and flips true when AppProvider hydrates, which normally
 * lands after auth — so the teardown fires mid-pass on an ORDINARY cold start,
 * not just after onboarding. Adding that dep to fix a real bug made a dormant
 * race live on every launch, which is worse than the bug it fixed.
 *
 * Source-scanned because `app/_layout.tsx` has no render harness in this repo —
 * every test here is pure-logic or a source scanner. Whitespace is collapsed so
 * the match survives a reformat instead of going red on correct code.
 */
describe("a superseded scheduling pass cannot cancel the current one", () => {
  const layout = readFileSync(
    join(__dirname, "..", "app/_layout.tsx"),
    "utf8",
  ).replace(/\s+/g, " ");

  it("keys the cleanup on the current eligibility, not on this run's copy", () => {
    // Keying on pass IDENTITY was the first attempt and it was half a fix.
    // React runs the previous cleanup before the next effect, so on any dep
    // change a "am I still the current run?" test is already false when the
    // .finally fires — which silenced the cleanup for the opposite overlap:
    // a user who signs out mid-pass. Run 2 clears immediately (two fast calls),
    // run 1 keeps writing for another ~120 round trips, and nothing cleans up
    // after it. A signed-out user kept receiving notifications.
    expect(
      layout,
      "NotificationLifecycle no longer tracks the current eligibility, so an " +
        "in-flight pass cannot tell which of the two overlap cases it is in",
    ).toContain("eligibleRef.current = eligible");
    expect(
      layout,
      "the .finally no longer reads the CURRENT eligibility — it either wipes " +
        "a newer pass's work, or fails to clear after a user who signed out",
    ).toContain("if (!eligibleRef.current) clearNotifications()");
    // The cleanup must NOT falsify the ref. Doing so left a run that bailed at
    // the loading guard reading false, so an in-flight pass would cancel every
    // scheduled notification for an eligible user — and its stated purpose,
    // clearing on unmount, is itself wrong: an eligible user's notifications
    // should survive teardown. Holding the last SETTLED value is what answers
    // all three overlap cases.
    expect(
      layout,
      "the cleanup falsifies eligibleRef again — a loading bail then leaves it " +
        "stale-false and an in-flight pass wipes an eligible user's schedule",
    ).not.toContain("eligibleRef.current = false");
  });

  it("waits for app state before scheduling at all", () => {
    // Without appLoading in the guard, permissionsSetupCompleted transitions
    // false -> true on hydration and the effect runs a second full pass —
    // ~120 OS round trips — on essentially every cold start.
    expect(
      layout,
      "appLoading was dropped from the guard, so the permissions flag " +
        "transitions mid-launch and re-runs the whole scheduling pass",
    ).toContain("|| appLoading");
  });
});

/**
 * The retry above is only real if a failure can actually reach it.
 *
 * initNotifications wraps its whole body in try/catch. Left swallowing, every
 * pass resolved — so the day was stamped even when scheduleAllNotifications had
 * thrown and the remaining nine schedulers never ran, and both the `.catch` and
 * MAX_ATTEMPTS_PER_DAY in lib/notification-refresh.ts were unreachable in
 * production, exercised only by this file's own injected mock. A guard that
 * only the test can trigger is not a guard.
 *
 * And the foreground entry point needs the same post-pass eligibility re-check
 * the mount path has: cancelAllScheduledNotificationsAsync is not on the shared
 * queue, so a clear triggered while a ~120-round-trip pass is running finishes
 * first, and that pass then writes notifications back for a signed-out user.
 */
describe("the foreground pass can fail, and cleans up after itself", () => {
  const layout = readFileSync(
    join(__dirname, "..", "app/_layout.tsx"),
    "utf8",
  ).replace(/\s+/g, " ");

  it("rethrows from initNotifications instead of swallowing", () => {
    const body = layout.slice(
      layout.indexOf('console.warn("Notification init error:'),
    );
    expect(
      body.slice(0, 900),
      "initNotifications swallows its error again — every pass then resolves, " +
        "the day is stamped on a failed pass, and the whole retry path is dead",
    ).toContain("throw err");
  });

  it("re-checks eligibility after a foreground pass, as the mount pass does", () => {
    const call = layout.slice(
      layout.indexOf("rescheduleOnForeground(eligible"),
    );
    expect(
      call.slice(0, 400),
      "the foreground pass no longer clears after itself — a user who signs " +
        "out mid-pass gets notifications written back after the clear",
    ).toContain("if (!eligibleRef.current) clearNotifications()");
  });
});
