import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * syncWithPartner used to fail only one way ("no partner linked"). The partner
 * access gate added three more — ungated wife, unconfirmed partnership,
 * unresolvable gender — and every client call site answered success:false with
 * silence, so the sync button did nothing at all. One site even fired the
 * success haptic on refusal.
 *
 * Reviewers found two of the four sites; the other two were found only by
 * enumerating callers. That is what this guard exists for: a NEW call site
 * added without a refusal branch must fail here rather than ship as another
 * dead button.
 */
const APP = join(__dirname, "..", "app");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory()
      ? tsxFiles(p)
      : p.endsWith(".tsx")
        ? [p]
        : [];
  });
}

describe("every sync call site answers a refused sync", () => {
  const callers = tsxFiles(APP)
    .map((p) => ({ path: p, src: readFileSync(p, "utf8") }))
    .filter((f) => f.src.includes("trpc.links.syncWithPartner"));

  it("finds the known call sites", () => {
    // Presence check: if this drops to zero the guard below passes vacuously
    // while checking nothing at all.
    expect(callers.length).toBeGreaterThanOrEqual(3);
  });

  it.each(callers.map((c) => c.path))(
    "%s reports every refusal it can trigger",
    (path) => {
      const src = readFileSync(path, "utf8");
      // Each mutate() that can come back success:false needs one refusal
      // message. Counting rather than merely detecting one, because a file
      // with two sync buttons had only one of them fixed.
      const calls = src.match(/sync\w*\.mutate(Async)?\(/g) || [];
      const refusals = src.match(/Could not sync/g) || [];
      expect(
        refusals.length,
        `${calls.length} sync call(s) here but ${refusals.length} refusal message(s) — a refused sync is silent`,
      ).toBe(calls.length);
    },
  );
});
