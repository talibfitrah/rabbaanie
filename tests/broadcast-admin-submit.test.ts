import { describe, it, expect } from "vitest";
import { buildSendPayload, type CategoryConfig } from "../app/admin/broadcast-send";

// Cubic P2: incompleteAnalytical/incompletePersonal used to route through the
// freeform subject/message path (Arabic-only, no per-recipient translation)
// because submit() branched on "does this category have a prefilled titleAr"
// instead of "is a category selected at all". buildSendPayload() is the real
// routing decision app/admin/broadcast.tsx's submit() calls -- extracted to
// this RN/Expo-free file (see its header) so it can be imported directly
// instead of asserting on source text. Fixtures below mirror the four real
// CATEGORIES entries (app/admin/broadcast.tsx) without re-importing that
// file's Arabic preview strings, which are irrelevant to routing.
const incompleteAnalytical: CategoryConfig = {
  key: "incompleteAnalytical",
  label: "لم يُكمل الملف التحليلي",
  description: "d",
  sendReady: true,
  titleAr: "أكمل ملفك التحليلي",
  bodyAr: "نص المعاينة",
};
const incompletePersonal: CategoryConfig = {
  key: "incompletePersonal",
  label: "لم يُدخل بياناته الشخصية",
  description: "d",
  sendReady: true,
  titleAr: "أكمل بياناتك الشخصية",
  bodyAr: "نص المعاينة",
};
const incompleteChildren: CategoryConfig = { key: "incompleteChildren", label: "l", description: "d", sendReady: true };
const notLinkedSpouse: CategoryConfig = { key: "notLinkedSpouse", label: "l", description: "d", sendReady: true };
const ALL_FOUR = [incompleteAnalytical, incompleteChildren, incompletePersonal, notLinkedSpouse];

describe("buildSendPayload — all four categories route through `category`, never freeform", () => {
  for (const cat of ALL_FOUR) {
    it(`${cat.key} sends { category } and not a prefilled subject/message`, () => {
      const result = buildSendPayload(cat, "irrelevant subject", "irrelevant message", ["parent"], { countries: [] });

      expect(result).toEqual({
        ok: true,
        payload: { category: cat.key, roles: ["parent"], audience: { countries: [] } },
      });
    });
  }

  it("still sends { category } even when the on-screen fields are empty (incompleteChildren/notLinkedSpouse shape)", () => {
    const result = buildSendPayload(notLinkedSpouse, "", "", [], {});
    expect(result).toEqual({ ok: true, payload: { category: "notLinkedSpouse", roles: [], audience: {} } });
  });
});

describe("buildSendPayload — no category selected: freeform manual send is preserved", () => {
  it("sends the typed subject/message, trimmed, when both are filled in", () => {
    const result = buildSendPayload(null, "  Title  ", "  Body  ", ["admin"], { countries: ["Nederland"] });
    expect(result).toEqual({
      ok: true,
      payload: { subject: "Title", message: "Body", roles: ["admin"], audience: { countries: ["Nederland"] } },
    });
  });

  it("rejects an empty subject or message instead of sending", () => {
    expect(buildSendPayload(null, "", "Body", [], {})).toEqual({ ok: false, reason: "missing-fields" });
    expect(buildSendPayload(null, "Title", "   ", [], {})).toEqual({ ok: false, reason: "missing-fields" });
  });
});

describe("buildSendPayload — a category staged but not yet sendReady", () => {
  it("blocks the send instead of falling through to category or freeform", () => {
    const notReady: CategoryConfig = { ...incompleteAnalytical, sendReady: false };
    const result = buildSendPayload(notReady, "x", "y", [], {});
    expect(result).toEqual({ ok: false, reason: "not-ready" });
  });
});
