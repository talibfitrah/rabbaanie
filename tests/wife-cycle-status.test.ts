import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
describe("husband's wife-cycle status", () => {
  it("is mounted per wife inside WifePermissionsPanel and reads only trpc.cycle.getPartner", () => {
    const panel = readFileSync("app/(tabs)/messages.tsx", "utf8");
    expect(panel).toContain("<WifeCycleStatus");
    const comp = readFileSync("components/wife-cycle-status.tsx", "utf8");
    expect(comp).toContain("trpc.cycle.getPartner");
    expect(comp).not.toContain("trpc.cycle.getMine");
    expect(comp).toContain("classify(");
  });
});
