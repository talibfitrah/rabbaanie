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

  it("pauses prayers (writeExcusedState) only inside the mutation's onSuccess, never before it fires", () => {
    const mutationStart = src.indexOf("trpc.cycle.upsertDay.useMutation(");
    const mutationEnd = src.indexOf("if (!notification)", mutationStart);
    expect(mutationStart).toBeGreaterThan(-1);
    expect(mutationEnd).toBeGreaterThan(mutationStart);
    const mutationCall = src.slice(mutationStart, mutationEnd);
    expect(mutationCall).toContain("onSuccess");
    expect(mutationCall).toContain("writeExcusedState");
    expect(mutationCall).toContain("onError");

    // handleHaid used to write the excused flag itself, before calling
    // mutate() — the exact "blind pre-write" this item removes. The flag's
    // only remaining source is the mutation config above.
    const handleHaidStart = src.indexOf("const handleHaid");
    expect(handleHaidStart).toBeGreaterThan(-1);
    const handleHaidEnd = src.indexOf("\n  };", handleHaidStart);
    const handleHaidBody = src.slice(handleHaidStart, handleHaidEnd);
    expect(handleHaidBody).not.toContain("writeExcusedState");
  });

  // C8: an ifAbsent no-op ({written:false} — today's row already existed)
  // must not be read as "she is excused". onSuccess now derives the flag
  // from the write result via lib/haid-state's deriveExcusedAfterWrite
  // instead of unconditionally forcing {excused:true}.
  it("derives the excused flag from the write result instead of assuming success means excused", () => {
    expect(src).toContain("deriveExcusedAfterWrite");
    expect(src).toContain("result.written");
    expect(src).not.toContain("writeExcusedState(u.id, { excused: true, until: isoToday() })");
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
