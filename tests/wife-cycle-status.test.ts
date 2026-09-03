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

  // 2026-09-03: today's blood type, shown only when today's logged flow is
  // actually blood (never for spotting/dry/no entry), right after the
  // status line and before the intercourse line.
  it("shows today's blood type only when today's logged flow is blood", () => {
    expect(comp).toContain("todayDay");
    expect(comp).toMatch(/todayDay\?\.flow === "blood"/);
    expect(comp).toContain("Bloedtype: zwart/dik");
    expect(comp).toContain("Blood type: black/thick");
    expect(comp).toContain("نوع الدم: أسود ثخين");
    expect(comp).toContain("Bloedtype: rood/dun");
    expect(comp).toContain("Blood type: red/thin");
    expect(comp).toContain("نوع الدم: أحمر رقيق");
    expect(comp).toContain("Bloedtype: bloed");
    expect(comp).toContain("Blood type: blood");
    expect(comp).toContain("نوع الدم: دم");

    const statusIdx = comp.indexOf("Haar toestand vandaag");
    const bloodTypeIdx = comp.indexOf("Bloedtype: zwart/dik");
    const intercourseIdx = comp.indexOf("T.intercourse[view.r.intercourse]");
    expect(statusIdx).toBeGreaterThan(-1);
    expect(bloodTypeIdx).toBeGreaterThan(statusIdx);
    expect(intercourseIdx).toBeGreaterThan(bloodTypeIdx);
  });

  // C13 (fixed in 24f3948): CoParentPermissions never mounts a
  // WifePermissionsPanel for a childless husband (no family row), so a
  // fallback independent of it must still exist for that case. 2026-09-03
  // UX request ("doesn't know which wife it belongs to"): once a family row
  // exists, attribute the status to the wife by nesting it inside her own
  // named WifePermissionsPanel instead of a separate unlabelled block — the
  // fallback below must then be suppressed there, or she'd see it twice.
  it("nests inside each wife's own panel, with a coParents-gated fallback for the childless case (C13)", () => {
    const panel = readFileSync("app/(tabs)/messages.tsx", "utf8");
    const panelStart = panel.indexOf("function WifePermissionsPanel(");
    const panelEnd = panel.indexOf("function InvitePartnerForm(");
    expect(panelStart).toBeGreaterThan(-1);
    expect(panelEnd).toBeGreaterThan(panelStart);
    expect(panel.slice(panelStart, panelEnd)).toContain("<WifeCycleStatus wifeId={wife.id} />");

    const permissionsStart = panel.indexOf("function CoParentPermissions(");
    const outside = panel.slice(0, permissionsStart) + panel.slice(panelEnd);
    expect(outside).toContain("trpc.links.listPartners.useQuery");
    expect(outside).toMatch(/coParents\.length === 0 && husbandWives\.map\(\(wife\) => [\s\S]{0,60}<WifeCycleStatus/);
  });
});
