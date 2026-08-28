import { describe, it, expect, vi, beforeEach } from "vitest";

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
// The card itself is exercised below, so trpc needs more than an empty stub:
// this fake stands in for the query cache and captures the toggle mutation's
// handlers, which is how the optimistic-update behaviour is asserted without a
// renderer. `vi.hoisted` because vi.mock factories run at import time, before
// a plain `const` in this file has initialised.
const h = vi.hoisted(() => ({
  // What the server has actually saved, and the react-query cache entry the
  // card reads. They are separate on purpose: an invalidate refetches, and the
  // refetch answers with the SERVER's state — which is exactly how a toggle
  // that is still on the wire loses its optimistic flip.
  server: undefined as any,
  cache: undefined as any,
  // Toggles still in flight, counted the way queryClient.isMutating() counts
  // them: the one currently running its settle handler is still "pending"
  // (query-core mutation.js awaits onSettled BEFORE dispatching success/error).
  inFlight: 0,
  query: { data: undefined, isError: false, isLoading: false } as any,
  mutation: { isPending: false, isError: false, variables: undefined } as any,
  captured: undefined as any,
  invalidated: 0,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ isMutating: () => h.inFlight }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dailyDeeds: {
        getToday: {
          cancel: async () => {},
          setData: (_input: unknown, updater: any) => {
            h.cache = typeof updater === "function" ? updater(h.cache) : updater;
          },
          invalidate: async () => {
            h.invalidated++;
            h.cache = { ...h.server, deeds: h.server.deeds.map((d: any) => ({ ...d })) };
          },
        },
      },
    }),
    dailyDeeds: {
      getToday: { useQuery: () => h.query },
      toggle: {
        useMutation: (opts: any) => {
          h.captured = opts;
          return { mutate: () => {}, ...h.mutation };
        },
      },
    },
  },
}));

import { toggleDeedDone, DailyDeedsCard } from "@/components/daily-deeds-card";

/** Every element in the tree the component returned, depth-first. */
function walk(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, out));
    return out;
  }
  out.push(node);
  walk(node.props?.children, out);
  return out;
}

/** Every string rendered anywhere in the tree. */
function allText(node: any, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => allText(n, out));
    return out;
  }
  allText(node.props?.children, out);
  return out;
}

/** Renders the card with the current `h` state and returns its element tree. */
function render() {
  return DailyDeedsCard({ lang: "en" }) as any;
}

function deed(id: string) {
  return h.cache.deeds.find((d: any) => d.id === id);
}

beforeEach(() => {
  h.server = { date: "2026-08-26", deeds: [
    { id: "a", label: "A", done: false },
    { id: "b", label: "B", done: false },
  ] };
  h.cache = { ...h.server, deeds: h.server.deeds.map((d: any) => ({ ...d })) };
  h.inFlight = 0;
  h.query = { data: h.cache, isError: false, isLoading: false, error: undefined, refetch: vi.fn() };
  h.mutation = { isPending: false, isError: false, variables: undefined };
  h.captured = undefined;
  h.invalidated = 0;
});

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

/**
 * Bug: onError restored a snapshot of the WHOLE query response taken in
 * onMutate. Tap deed A, then deed B; B succeeds and is saved server-side; A
 * then fails — and A's rollback wrote back the pre-A list, visually
 * un-checking B. A per-mutation snapshot cannot describe a cache that other
 * mutations have legitimately moved on from, so the server has to be the
 * arbiter after a failure.
 */
describe("DailyDeedsCard toggle failure — rollback must not erase another deed's saved state", () => {
  it("leaves the second, server-confirmed toggle checked when the first toggle fails afterwards", async () => {
    render();
    const opts = h.captured;

    h.inFlight = 1;
    await opts.onMutate({ deedId: "a", done: true });
    h.inFlight = 2;
    await opts.onMutate({ deedId: "b", done: true });
    h.server.deeds[1].done = true; // B confirmed by the server
    await opts.onSettled();
    h.inFlight = 1;
    await opts.onSettled(); // A failed

    expect(deed("b").done).toBe(true);
  });

  it("asks the server for the truth after a failed toggle instead of leaving the optimistic state", async () => {
    render();
    const opts = h.captured;

    h.inFlight = 1;
    await opts.onMutate({ deedId: "a", done: true });
    const before = h.invalidated;
    await opts.onSettled();

    expect(h.invalidated).toBeGreaterThan(before);
  });

  // onSettled reconciles only when it is the LAST mutation app-wide, and
  // isMutating() counts every mutation in the app — a profile save or a sync
  // in flight makes the count >1 and the reconcile is skipped entirely. With
  // no onError, the optimistic flip of a toggle the server REJECTED then
  // stays on screen for the rest of the session. Undo just that one deed:
  // reverting the whole response is the bug the describe above pins.
  it("un-flips a failed deed even when an unrelated mutation blocks the reconcile", async () => {
    render();
    const opts = h.captured;

    h.inFlight = 1;
    await opts.onMutate({ deedId: "a", done: true });
    expect(deed("a").done).toBe(true); // optimistic flip is on screen

    h.inFlight = 2; // an unrelated mutation is now in flight
    await opts.onError?.(new Error("rejected"), { deedId: "a", done: true });
    await opts.onSettled();

    expect(h.invalidated).toBe(0); // reconcile was indeed skipped
    expect(deed("a").done).toBe(false); // ...and the flip was undone anyway
  });

  // The revert must be surgical: a peer deed the server already saved keeps
  // its state, which is the whole reason a whole-response snapshot was wrong.
  it("leaves a peer deed untouched when reverting a failed one", async () => {
    render();
    const opts = h.captured;

    h.inFlight = 2;
    await opts.onMutate({ deedId: "a", done: true });
    await opts.onMutate({ deedId: "b", done: true });
    await opts.onError?.(new Error("rejected"), { deedId: "a", done: true });

    expect(deed("a").done).toBe(false);
    expect(deed("b").done).toBe(true);
  });

  // One tap-storm must not put two toggles for the same row in flight.
  it("disables only the row whose own toggle is in flight", () => {
    h.mutation = { isPending: true, isError: false, variables: { deedId: "a", done: true } };
    const rows = walk(render()).filter((n) => n.type === "Pressable");

    expect(rows.find((r) => r.key === "a").props.disabled).toBe(true);
    expect(rows.find((r) => r.key === "b").props.disabled).toBeFalsy();
  });
});

/**
 * Bug: both the in-flight fetch and a failed one returned a bare `null`, so
 * tapping «الأعمال اليومية» on a slow connection looked dead and a failed
 * fetch left the card permanently blank with no way to retry. Same states the
 * sibling card (daily-diagnostic-card.tsx) already renders.
 */
describe("DailyDeedsCard fetch states — the card must not render as nothing", () => {
  it("shows a loading indicator while today's deeds are still being fetched", () => {
    h.query = { data: undefined, isError: false, isLoading: true, error: undefined, refetch: vi.fn() };
    const tree = render();

    expect(tree).not.toBeNull();
    expect(walk(tree).some((n) => n.type === "ActivityIndicator")).toBe(true);
  });

  it("offers a retry that refetches when the fetch failed", () => {
    const refetch = vi.fn();
    h.query = { data: undefined, isError: true, isLoading: false, error: { data: { code: "INTERNAL_SERVER_ERROR" } }, refetch };
    const tree = render();

    expect(tree).not.toBeNull();
    const retry = walk(tree).find((n) => n.type === "Pressable");
    retry.props.onPress();
    expect(refetch).toHaveBeenCalled();
  });

  // Absence too: the server half of this feature can ship separately, and a
  // "tap to retry" that can never succeed is worse than showing nothing.
  it("stays silent when the procedure is not deployed yet (NOT_FOUND)", () => {
    h.query = { data: undefined, isError: true, isLoading: false, error: { data: { code: "NOT_FOUND" } }, refetch: vi.fn() };

    expect(render()).toBeNull();
  });

  it("tells the user when a toggle failed to send", () => {
    h.mutation = { isPending: false, isError: true, variables: { deedId: "a", done: true } };

    expect(allText(render())).toContain("Failed to send, please try again");
  });

  // `DailyDeedsToday` is hand-written and cast in with `as unknown as` against
  // a router this repo does not contain, so nothing type-checks the real
  // response. `!data` was the only runtime check, and this card renders on the
  // HOME tab — `data.deeds.map` on a response without a usable `deeds` array
  // takes the home screen down rather than showing the retry card this file
  // already renders for every other failure.
  it.each([[null], [undefined], [{}], ["nope"], [7]])(
    "falls back to the retry card when the response's deeds is %p, instead of throwing",
    (deeds) => {
      const refetch = vi.fn();
      h.query = { data: { date: "2026-08-26", deeds }, isError: false, isLoading: false, error: undefined, refetch };

      const tree = render();
      expect(allText(tree)).toContain("Failed to load, tap to retry");
      walk(tree).find((n: any) => n.type === "Pressable").props.onPress();
      expect(refetch).toHaveBeenCalled();
    },
  );

  // Presence: a guard that rejected every response would satisfy the above
  // while making the card permanently useless.
  it("still renders the deed rows for a well-formed response", () => {
    expect(allText(render())).toEqual(expect.arrayContaining(["A", "B"]));
  });
});

/**
 * Bug: settling to server truth after ONE toggle discards the optimistic flip
 * of every toggle still in flight. Tap deed A, then deed B while A is still
 * going; A comes back OK and the invalidate refetches — the server has not
 * been told about B yet, so B's checkbox visibly reverts while B's own request
 * is still on the wire and about to succeed. Same bug class as the snapshot
 * rollback above, reintroduced from the other side: any unconditional
 * whole-response resync is wrong while a peer toggle is pending.
 */
describe("DailyDeedsCard concurrent toggles — settling to server truth must wait for the last one", () => {
  it("keeps a still-in-flight toggle's optimistic flip when an earlier toggle settles", async () => {
    render();
    const opts = h.captured;

    h.inFlight = 1;
    await opts.onMutate({ deedId: "a", done: true });
    h.inFlight = 2;
    await opts.onMutate({ deedId: "b", done: true });

    // A comes back OK: the server knows about A now, B is still on the wire.
    h.server.deeds[0].done = true;
    await opts.onSettled();

    expect(deed("b").done).toBe(true);
  });

  // Presence, not only suppression: a gate that never opens would satisfy the
  // test above vacuously and silently drop the post-failure resync entirely.
  it("settles to server truth once the last toggle in flight has finished", async () => {
    render();
    const opts = h.captured;

    h.inFlight = 1;
    await opts.onMutate({ deedId: "a", done: true });
    const before = h.invalidated;
    await opts.onSettled();

    expect(h.invalidated).toBeGreaterThan(before);
  });
});
