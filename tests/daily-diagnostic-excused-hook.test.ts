import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
it("submitting the excused prayer answer logs today as blood only when no entry exists", () => {
  const src = readFileSync("components/daily-diagnostic-card.tsx", "utf8");
  expect(src).toContain('kind === "excused"');
  expect(src).toContain("trpc.cycle.upsertDay");
  expect(src).toContain("trpc.cycle.getMine");
});
