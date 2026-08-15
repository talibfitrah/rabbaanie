import { describe, it, expect } from "vitest";
import { sectionOwner } from "../lib/plan-owner";

// Daa3iyah (2026-08-15): "لابد ان تفرق بين ما لابد ان يقوم به الأب وما لابد ان يقوم به الابن".
// The Arabic treatment plan already emits these headings (server/advice.ts:2406-2428).

describe("father sections", () => {
  it("recognises the long-term parent task section", () => {
    expect(sectionOwner("2. مهام الوالد - التربية البعيدة المدى")).toEqual({
      label: "الوالد",
      role: "parent",
    });
  });

  it("recognises the short-term parent task section", () => {
    expect(sectionOwner("3. مهام الوالد - التربية القصيرة المدى")?.role).toBe(
      "parent",
    );
  });
});

describe("child sections", () => {
  it("recognises a son's task section and keeps the plan's own word", () => {
    expect(sectionOwner("4. مهام الابن")).toEqual({
      label: "الابن",
      role: "child",
    });
  });

  it("uses البنت for a daughter rather than guessing gender", () => {
    expect(sectionOwner("4. مهام البنت")).toEqual({
      label: "البنت",
      role: "child",
    });
  });
});

describe("does not confuse الوالد with الولد", () => {
  it("treats الوالد as the parent", () => {
    expect(sectionOwner("مهام الوالد")?.role).toBe("parent");
  });

  it("treats الولد as the child", () => {
    expect(sectionOwner("مهام الولد")?.role).toBe("child");
  });
});

describe("sections with no owner stay unlabelled", () => {
  it("returns null for the diagnosis section", () => {
    expect(sectionOwner("1. تشخيص المشكلة")).toBeNull();
  });

  it("returns null for the timeline section", () => {
    expect(sectionOwner("5. الجدول الزمني والتقييم")).toBeNull();
  });

  it("returns null for an unrelated heading", () => {
    expect(sectionOwner("التصفية لـ عبد الله (تشكيل عقله)")).toBeNull();
  });
});

describe("english and dutch plans", () => {
  it("labels the English parent section", () => {
    expect(sectionOwner("2. WHAT MUST THE PARENT CHANGE FIRST?")).toEqual({
      label: "Parent",
      role: "parent",
    });
  });

  it("labels the Dutch parent section", () => {
    expect(sectionOwner("2. WAT MOET DE OUDER ZELF EERST VERANDEREN?")).toEqual({
      label: "Ouder",
      role: "parent",
    });
  });

  it("leaves English child-treatment sections unlabelled, as those are parent actions", () => {
    expect(
      sectionOwner("4. TREATMENT PLAN - TASFIYA (correcting child's mind)"),
    ).toBeNull();
  });
});
