import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Source-level guard, same style as tests/logout-clears-cached-data.test.ts:
// resolved from __dirname so it does not depend on vitest's invocation cwd.
const src = readFileSync(
  join(__dirname, "..", "components", "prayer-popup-modal.tsx"),
  "utf8",
);

describe("prayer popup — haid button", () => {
  it("renders «أنا حائض» only for women and logs today as blood", () => {
    expect(src).toContain('gender === "vrouw"');
    expect(src).toContain("أنا حائض");
    expect(src).toContain("trpc.cycle.upsertDay");
    expect(src).toContain("writeExcusedState");
  });
});
