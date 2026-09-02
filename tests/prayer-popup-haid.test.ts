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
});
