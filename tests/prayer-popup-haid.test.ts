import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Source-level guard, same style as tests/logout-clears-cached-data.test.ts:
// resolved from __dirname so it does not depend on vitest's invocation cwd.
// No renderer is installed in this project and the mutation lives inside a
// hook this component owns (nothing to extract without inventing a seam the
// task doesn't ask for), so the invariant is checked textually rather than
// by simulating a tap.
const src = readFileSync(
  join(__dirname, "..", "components", "prayer-popup-modal.tsx"),
  "utf8",
);

describe("prayer popup — haid button (item C: never overwrite, pause only after the server accepts it)", () => {
  it("renders «أنا حائض» only for women and logs today as blood without overwriting an existing entry", () => {
    expect(src).toContain('gender === "vrouw"');
    expect(src).toContain("أنا حائض");
    expect(src).toContain("trpc.cycle.upsertDay");
    expect(src).toContain("ifAbsent: true");
  });

  // C7: writing the day (or invalidating the cache) alone never touches
  // prayer alarms already scheduled with the OS — only syncHaidNotifications
  // actually cancels and reschedules them. C8: an ifAbsent no-op
  // ({written:false} — today's row already existed) must not be read as
  // "she is excused" either. onSuccess now awaits a fresh getMine fetch and
  // runs the SAME sync app/haid.tsx's own screen uses: it derives the
  // excused flag from the real classified days (never from the mutation's
  // own write-attempt result) and reschedules the OS notifications to match.
  it("pauses prayers via syncHaidNotifications, from freshly-fetched real cycle data, only inside the mutation's onSuccess", () => {
    const mutationStart = src.indexOf("trpc.cycle.upsertDay.useMutation(");
    const mutationEnd = src.indexOf("if (!notification)", mutationStart);
    expect(mutationStart).toBeGreaterThan(-1);
    expect(mutationEnd).toBeGreaterThan(mutationStart);
    const mutationCall = src.slice(mutationStart, mutationEnd);
    expect(mutationCall).toContain("onSuccess");
    expect(mutationCall).toContain("utils.cycle.getMine.fetch()");
    expect(mutationCall).toContain("syncHaidNotifications(");
    expect(mutationCall).toContain("onError");
    // Never forced true from the mutation's own result — nothing in this
    // file reads written/result any more, only the refetched real rows.
    expect(mutationCall).not.toContain("writeExcusedState(u.id, { excused: true, until: isoToday() })");

    // handleHaid used to write the excused flag itself, before calling
    // mutate() — the exact "blind pre-write" item C removed. The pause only
    // ever comes from the mutation config above.
    const handleHaidStart = src.indexOf("const handleHaid");
    expect(handleHaidStart).toBeGreaterThan(-1);
    const handleHaidEnd = src.indexOf("\n  };", handleHaidStart);
    const handleHaidBody = src.slice(handleHaidStart, handleHaidEnd);
    expect(handleHaidBody).not.toContain("writeExcusedState");
    expect(handleHaidBody).not.toContain("syncHaidNotifications");
  });
});

// The server now rejects cycle writes outright when she hasn't enabled the
// tracker (PRECONDITION_FAILED) — so tapping «أنا حائض» while disabled used
// to silently do nothing at all. Route her to enable it first instead.
describe("prayer popup — routes to /haid instead of silently no-op'ing when the tracker isn't enabled", () => {
  it("checks her tracker-enabled state (trpc.cycle.getMine, gated to women) before deciding", () => {
    expect(src).toContain("trpc.cycle.getMine.useQuery(undefined, { enabled: isWoman })");
  });

  it("imports the standalone (non-hook) router — this component renders outside the navigation-hook-reachable tree", () => {
    expect(src).toMatch(/import \{[^}]*\brouter\b[^}]*\} from "expo-router"/);
  });

  it("not enabled (or not yet known): does not write, routes to /haid instead", () => {
    const handleHaidStart = src.indexOf("const handleHaid = () => {");
    const handleHaidEnd = src.indexOf("\n  };", handleHaidStart);
    expect(handleHaidStart).toBeGreaterThan(-1);
    expect(handleHaidEnd).toBeGreaterThan(handleHaidStart);
    const body = src.slice(handleHaidStart, handleHaidEnd);
    expect(body).toContain("mine.data?.enabled === true");
    expect(body).toContain('router.push("/haid")');
    // Both branches still dismiss the popup the same way (onDoNow clears any
    // pending follow-up timer before dismissing — onDismiss alone would not).
    expect(body).toContain("onDoNow(notification)");
  });
});

// C15: isWoman used to hold whatever the LAST successfully-read account was
// until the new account's async read resolved — or forever, if it failed —
// briefly (or indefinitely) showing "أنا حائض" to a man right after
// switching from a woman's account.
describe("prayer popup — gender read never shows a stale account (C15)", () => {
  it("starts false and resets to false synchronously before every async re-check", () => {
    expect(src).toContain("useState(false)");
    const effectStart = src.indexOf("useEffect(() => {\n    let cancelled = false;");
    const asyncStart = src.indexOf("(async () => {", effectStart);
    expect(effectStart).toBeGreaterThan(-1);
    expect(asyncStart).toBeGreaterThan(effectStart);
    // The reset must happen BEFORE the async read starts, not only inside
    // its success branch — otherwise a stale true from the previous
    // account is still what renders while the new read is in flight.
    expect(src.slice(effectStart, asyncStart)).toContain("setIsWoman(false)");
  });

  it("only ever sets true from the read's own result — never optimistically", () => {
    const asyncStart = src.indexOf("(async () => {");
    const asyncEnd = src.indexOf("})();", asyncStart);
    const asyncBody = src.slice(asyncStart, asyncEnd);
    expect(asyncBody).toContain('appState.parentProfile?.gender === "vrouw"');
  });
});
