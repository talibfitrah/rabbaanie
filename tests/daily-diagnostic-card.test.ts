import { describe, it, expect, vi } from "vitest";

// Same mocking recipe as tests/treatment-renderer.test.ts (its own comment
// explains why): react-native's package entry uses Flow's `import typeof`
// syntax and @expo/vector-icons/MaterialIcons fails its own separate parse,
// so both must be stubbed before this file can import the component at all.
// trpc and ReportAiContent are only ever touched inside the component
// function body (hook calls, JSX) — never at module scope — so importing a
// plain function from this module never executes them; empty stubs are
// enough to satisfy the module's top-level `import` statements.
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@expo/vector-icons/MaterialIcons", () => ({ default: "MaterialIcons" }));
vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("@/components/report-ai-content", () => ({ ReportAiContent: () => null }));

import { buildReviewSelections } from "@/components/daily-diagnostic-card";

/**
 * Task: reopening an answered daily check-in must show the question view
 * again with the owner's prior answers pre-selected, reusing cached
 * todayQuery.data (no new fetch/generation). buildReviewSelections is the
 * pure transform that turns the server's stored `answers` array into the
 * exact `{ [category]: { label, tone } }` shape the option list's
 * isSelected check reads — pulled out of the component so it's assertable
 * without a renderer (none is installed in this project).
 */
describe("buildReviewSelections — pre-fills the reopened question view from prior answers", () => {
  it("maps each stored answer back to a selection keyed by its category", () => {
    const answers = [
      { category: "prayer", label: "Alle 5 gebeden", tone: "positive" as const },
      { category: "psychological", label: "Gestrest", tone: "needs_support" as const },
      { category: "physical", label: "Moe", tone: "neutral" as const },
      { category: "children", label: "Rustig", tone: "positive" as const },
    ];
    expect(buildReviewSelections(answers)).toEqual({
      prayer: { label: "Alle 5 gebeden", tone: "positive" },
      psychological: { label: "Gestrest", tone: "needs_support" },
      physical: { label: "Moe", tone: "neutral" },
      children: { label: "Rustig", tone: "positive" },
    });
  });

  // The not-yet-answered case (data.answers is null) must never crash the
  // reopen path — it simply never happens (the done card only renders, and
  // can only be tapped, once answers is non-null), but the function must
  // degrade safely rather than throw if ever called before that.
  it("returns an empty object for null/undefined input instead of throwing", () => {
    expect(buildReviewSelections(null)).toEqual({});
    expect(buildReviewSelections(undefined)).toEqual({});
  });

  // Presence, not just absence: a real per-category tone must survive the
  // transform distinctly, not collapse to the same value or bleed into a
  // neighboring category.
  it("keeps each category's own tone distinct — no cross-category leakage", () => {
    const result = buildReviewSelections([
      { category: "prayer", label: "A", tone: "positive" as const },
      { category: "psychological", label: "B", tone: "neutral" as const },
      { category: "physical", label: "C", tone: "needs_support" as const },
    ]);
    expect(result.prayer).toEqual({ label: "A", tone: "positive" });
    expect(result.psychological).toEqual({ label: "B", tone: "neutral" });
    expect(result.physical).toEqual({ label: "C", tone: "needs_support" });
  });
});
