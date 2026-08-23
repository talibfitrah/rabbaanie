import { describe, it, expect, vi } from "vitest";

// Same mocking recipe as tests/daily-diagnostic-card.test.ts (its own comment
// explains why): react-native's package entry uses Flow's `import typeof`
// syntax and @expo/vector-icons/MaterialIcons fails its own separate parse,
// so both must be stubbed before this file can import the component at all.
// trpc is only ever touched inside the component function body (hook calls)
// — never at module scope — so importing a plain function from this module
// never executes it; an empty stub is enough to satisfy the top-level import.
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@expo/vector-icons/MaterialIcons", () => ({ default: "MaterialIcons" }));
vi.mock("@/lib/trpc", () => ({ trpc: {} }));

import { toggleDeedDone } from "@/components/daily-deeds-card";

/**
 * Task: tapping a deed row must flip that row's `done` state in the query
 * cache immediately (optimistic update via useMutation's onMutate), before
 * the server confirms it. toggleDeedDone is the pure transform that does the
 * flip — pulled out of the component so it's assertable without a renderer
 * (none is installed in this project), same reasoning as
 * daily-diagnostic-card.tsx's buildReviewSelections.
 */
describe("toggleDeedDone — flips one deed's done state without disturbing the rest", () => {
  it("flips the matching deed to the given done value", () => {
    const deeds = [
      { id: "a", label: "Fajr op tijd", done: false },
      { id: "b", label: "Ochtend-dhikr", done: true },
    ];
    expect(toggleDeedDone(deeds, "a", true)).toEqual([
      { id: "a", label: "Fajr op tijd", done: true },
      { id: "b", label: "Ochtend-dhikr", done: true },
    ]);
  });

  it("can flip a deed back to not-done", () => {
    const deeds = [{ id: "a", label: "Fajr op tijd", done: true }];
    expect(toggleDeedDone(deeds, "a", false)).toEqual([{ id: "a", label: "Fajr op tijd", done: false }]);
  });

  // Presence, not just absence: flipping one row must never bleed into its
  // neighbor's state.
  it("leaves every other deed's done state untouched", () => {
    const deeds = [
      { id: "a", label: "A", done: false },
      { id: "b", label: "B", done: false },
      { id: "c", label: "C", done: true },
    ];
    const result = toggleDeedDone(deeds, "b", true);
    expect(result.find((d) => d.id === "a")).toEqual({ id: "a", label: "A", done: false });
    expect(result.find((d) => d.id === "c")).toEqual({ id: "c", label: "C", done: true });
  });

  // Degrade safely rather than throw if ever called with an id that isn't in
  // the list (e.g. a race between a fast second tap and a list refresh).
  it("returns the list unchanged when the id is not found", () => {
    const deeds = [{ id: "a", label: "A", done: false }];
    expect(toggleDeedDone(deeds, "missing", true)).toEqual(deeds);
  });
});
