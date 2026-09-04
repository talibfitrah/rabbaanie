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

  // 2026-09-04 (Daa3iyah): the wife cycle status MOVED from the «شبكتي» tab
  // (messages.tsx) to a per-wife «الحيض وأثره» button on the «العائلة» tab
  // (family.tsx), opening a modal. The C13 invariant is preserved a different
  // way: the button is gated on the CONFIRMED PARTNERSHIP (partners.some(p.id
  // === cp.id && p.confirmed)) — the same partnership trpc.cycle.getPartner
  // itself checks — never the family-panel/coParents gate.
  it("is gone from the network tab and now opens per confirmed spouse on the family tab (still partnership-gated, attributed by wife)", () => {
    const network = readFileSync("app/(tabs)/messages.tsx", "utf8");
    expect(network).not.toContain("<WifeCycleStatus");
    expect(network).not.toContain("WifeCycleCollapse");

    const family = readFileSync("app/(tabs)/family.tsx", "utf8");
    expect(family).toContain("<WifeCycleStatus");
    // Opened only for a CURRENT confirmed spouse — never a divorced ex
    // co-parent that getCoParents also surfaces. Whitespace-tolerant so a
    // reformat can't silently drop the guard (assert the invariant, not
    // the exact formatting).
    expect(family).toMatch(/partners\s*\.\s*some\([\s\S]{0,80}p\.confirmed/);
    // The cycle button opens the modal for this specific wife (cp.id).
    expect(family).toMatch(/setCycleWife\(\s*\{[\s\S]{0,60}cp\.id/);
  });
});
