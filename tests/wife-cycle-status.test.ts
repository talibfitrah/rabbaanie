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

  // C13 (fixed in 24f3948) + 2026-09-03 P1 (cubic): the status must follow
  // the confirmed partnership (husbandWives via listPartners), never the
  // family-panel gate — trpc.cycle.getPartner itself only checks the
  // partnership. Coupling the UI to CoParentPermissions/coParents let the
  // status render NOWHERE whenever that panel returned null for any reason
  // other than "no children" (e.g. activeFather being a stub account). Fix:
  // a dedicated, always-rendered, per-wife collapse — named header, its own
  // default-collapsed state, mounts WifeCycleStatus only once opened.
  it("renders in an always-present per-wife collapse, attributed by name, never nested in the family-gated panel and never gated on coParents", () => {
    const panel = readFileSync("app/(tabs)/messages.tsx", "utf8");
    const permissionsStart = panel.indexOf("function CoParentPermissions(");
    const permissionsEnd = panel.indexOf("function InvitePartnerForm(");
    expect(permissionsStart).toBeGreaterThan(-1);
    expect(permissionsEnd).toBeGreaterThan(permissionsStart);
    expect(panel.slice(permissionsStart, permissionsEnd)).not.toContain("<WifeCycleStatus");

    const collapseStart = panel.indexOf("function WifeCycleCollapse(");
    const collapseEnd = panel.indexOf("function ParentsSection(");
    expect(collapseStart).toBeGreaterThan(-1);
    expect(collapseEnd).toBeGreaterThan(collapseStart);
    const collapseBody = panel.slice(collapseStart, collapseEnd);
    expect(collapseBody).toContain("useState(false)");
    expect(collapseBody).toContain("wife.name");
    expect(collapseBody).toMatch(/open && [\s\S]{0,200}<WifeCycleStatus wifeId=\{wife\.id\} \/>/);

    const outside = panel.slice(0, permissionsStart) + panel.slice(permissionsEnd);
    expect(outside).toContain("trpc.links.listPartners.useQuery");
    expect(outside).toMatch(/knownToBeMan && husbandWives\.map\(\(wife\) => [\s\S]{0,100}<WifeCycleCollapse/);
    expect(outside).not.toMatch(/coParents\.length === 0 && husbandWives\.map/);
  });
});
