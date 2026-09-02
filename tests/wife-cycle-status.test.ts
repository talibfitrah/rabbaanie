import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("husband's wife-cycle status", () => {
  const comp = readFileSync("components/wife-cycle-status.tsx", "utf8");

  it("reads only trpc.cycle.getPartner (never getMine) and classifies via the shared engine", () => {
    expect(comp).toContain("trpc.cycle.getPartner");
    expect(comp).not.toContain("trpc.cycle.getMine");
    expect(comp).toContain("classify(");
  });

  it("takes no `expanded` prop — every mount is unconditional per wife", () => {
    expect(comp).not.toContain("expanded");
  });

  // C13: CoParentPermissions (and WifePermissionsPanel inside it) return null
  // before rendering anything when the husband has no family row (no
  // children) — so the cycle-status mount must not live inside that block.
  it("is mounted from a listPartners map independent of CoParentPermissions' family gate (C13)", () => {
    const panel = readFileSync("app/(tabs)/messages.tsx", "utf8");
    const permissionsStart = panel.indexOf("function CoParentPermissions(");
    const permissionsEnd = panel.indexOf("function InvitePartnerForm(");
    expect(permissionsStart).toBeGreaterThan(-1);
    expect(permissionsEnd).toBeGreaterThan(permissionsStart);
    const permissionsBlock = panel.slice(permissionsStart, permissionsEnd);
    expect(permissionsBlock).not.toContain("<WifeCycleStatus");

    const outside = panel.slice(0, permissionsStart) + panel.slice(permissionsEnd);
    expect(outside).toContain("trpc.links.listPartners.useQuery");
    expect(outside).toMatch(/\.map\(\(wife\) => [\s\S]{0,60}<WifeCycleStatus/);
  });
});
