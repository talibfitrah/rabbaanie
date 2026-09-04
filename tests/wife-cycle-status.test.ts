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

  // 2026-09-04 (Daa3iyah): the wife cycle status MOVED off the «شبكتي» tab
  // (messages.tsx) into a shared per-wife action component (WifeCardActions)
  // used by BOTH the «العائلة» tab (family.tsx) and the home screen (index.tsx).
  // The C13 invariant is preserved a different way: the «الحيض وأثره» button is
  // gated on the CONFIRMED PARTNERSHIP (partners.some(p.id === cp.id &&
  // p.confirmed)) — the same partnership trpc.cycle.getPartner itself checks —
  // never the family-panel/coParents gate.
  it("is gone from the network tab and now opens per confirmed spouse from the shared WifeCardActions (used on family + home)", () => {
    const network = readFileSync("app/(tabs)/messages.tsx", "utf8");
    expect(network).not.toContain("<WifeCycleStatus");
    expect(network).not.toContain("WifeCycleCollapse");

    // The cycle status + confirmed-spouse gate live in ONE shared component.
    const actions = readFileSync("components/wife-card-actions.tsx", "utf8");
    expect(actions).toContain("<WifeCycleStatus");
    // Whitespace-tolerant so a reformat can't silently drop the guard (assert
    // the invariant, not the exact formatting).
    expect(actions).toMatch(/partners\s*\.\s*some\([\s\S]{0,80}p\.confirmed/);

    // Both screens render the shared component per wife card.
    expect(readFileSync("app/(tabs)/family.tsx", "utf8")).toContain("<WifeCardActions");
    expect(readFileSync("app/(tabs)/index.tsx", "utf8")).toContain("<WifeCardActions");
  });
});
