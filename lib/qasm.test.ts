import { describe, expect, it } from "vitest";
import {
  addExpense,
  addWife,
  advance,
  createQasmState,
  currentTurn,
  deleteDrawRecord,
  deleteNightRecord,
  expenseTotalsByWife,
  initialStayNights,
  isQasmState,
  pickWifeForTravel,
  recordTravelDraw,
  reorderRotation,
  resetQasm,
  syncWivesFromPartners,
  undoLastNight,
  type QasmState,
  type QasmWife,
} from "./qasm";

const HIND: QasmWife = { id: 1, name: "هند", active: true };
const ZAYNAB: QasmWife = { id: 2, name: "زينب", active: true };
const RUQAYYA: QasmWife = { id: 3, name: "رقية", active: true };
const UMM_SALAMA: QasmWife = { id: 4, name: "أم سلمة", active: true };

describe("initialStayNights", () => {
  it("gives a bikr (never previously married) wife 7 nights — Muslim, from Anas", () => {
    expect(initialStayNights("bikr")).toBe(7);
  });

  it("gives a thayyib (previously married) wife 3 nights", () => {
    expect(initialStayNights("thayyib")).toBe(3);
  });
});

describe("createQasmState", () => {
  it("seeds the rotation order from the given wives, turn on the first", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    expect(state.order).toEqual([1, 2]);
    expect(state.turnIndex).toBe(0);
  });

  it("starts with no initial stay owed — founding wives are not retroactively", () => {
    // The 7/3 rule is for a wife newly joining an EXISTING rotation (see the
    // hadith: "then the turn returns to the round"). A household's first-ever
    // setup has no way to know when its founding wives actually married, so
    // they enter as already-established, no grace nights owed.
    const state = createQasmState([HIND, ZAYNAB]);
    expect(state.initialStayQueue).toEqual([]);
  });

  it("marks every founding wife active", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    expect(state.wives.every((w) => w.active)).toBe(true);
  });

  it("starts with empty history, draw history and expenses", () => {
    const state = createQasmState([HIND]);
    expect(state.history).toEqual([]);
    expect(state.drawHistory).toEqual([]);
    expect(state.expenses).toEqual([]);
  });
});

describe("currentTurn", () => {
  it("is null with no wives", () => {
    expect(currentTurn(createQasmState([]))).toBeNull();
  });

  it("is the wife at turnIndex when no one is in an initial stay", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    expect(currentTurn(state)).toEqual({
      wifeId: 1,
      isInitialStay: false,
      nightsLeftInInitialStay: 0,
    });
  });

  it("is the queued initial-stay wife, ignoring whose turn the normal rotation is on", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = addWife(state, RUQAYYA, "thayyib");
    expect(currentTurn(state)).toEqual({
      wifeId: 3,
      isInitialStay: true,
      nightsLeftInInitialStay: 3,
    });
  });
});

describe("advance", () => {
  it("moves the normal rotation to the next wife, wrapping around", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, {}, "2026-01-01");
    expect(currentTurn(state)?.wifeId).toBe(2);
    state = advance(state, {}, "2026-01-02");
    expect(currentTurn(state)?.wifeId).toBe(1); // wraps
  });

  it("logs a non-gifted night for whoever was current", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, {}, "2026-01-01");
    expect(state.history).toEqual([{ wifeId: 1, date: "2026-01-01", gifted: false }]);
  });

  it("logs a gifted night (هبة الليلة) and still passes the turn onward", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, { gifted: true }, "2026-01-01");
    expect(state.history).toEqual([{ wifeId: 1, date: "2026-01-01", gifted: true }]);
    expect(currentTurn(state)?.wifeId).toBe(2);
  });

  it("does nothing on an empty rotation (no crash, no phantom history)", () => {
    const state = createQasmState([]);
    expect(advance(state, {}, "2026-01-01")).toEqual(state);
  });

  it("does not mutate the state passed in", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    const before = JSON.parse(JSON.stringify(state));
    advance(state, {}, "2026-01-01");
    expect(state).toEqual(before);
  });

  describe("initial stay (7 bikr / 3 thayyib)", () => {
    it("consumes one night per advance without moving the normal rotation pointer", () => {
      let state = createQasmState([HIND, ZAYNAB]); // turnIndex 0 -> HIND is next up
      state = addWife(state, RUQAYYA, "thayyib"); // 3 nights owed to RUQAYYA
      state = advance(state, {}, "2026-01-01");
      expect(currentTurn(state)).toEqual({
        wifeId: 3,
        isInitialStay: true,
        nightsLeftInInitialStay: 2,
      });
      // The normal rotation's turnIndex is untouched underneath the interrupt.
      expect(state.turnIndex).toBe(0);
    });

    it("resumes the normal rotation exactly where it left off once the stay ends", () => {
      let state = createQasmState([HIND, ZAYNAB]);
      state = advance(state, {}, "2025-12-30"); // HIND's night -> turnIndex now on ZAYNAB
      expect(currentTurn(state)?.wifeId).toBe(2);
      state = addWife(state, RUQAYYA, "bikr"); // 7 nights owed
      for (let i = 0; i < 7; i++) {
        state = advance(state, {}, `2026-01-0${i + 1}`);
      }
      expect(state.initialStayQueue).toEqual([]);
      expect(currentTurn(state)?.wifeId).toBe(2); // exactly where it was interrupted
    });

    it("queues a second new wife's stay FIFO behind an in-progress one", () => {
      let state = createQasmState([HIND]);
      state = addWife(state, ZAYNAB, "bikr"); // 7 nights owed
      state = addWife(state, RUQAYYA, "thayyib"); // queued behind ZAYNAB
      expect(currentTurn(state)?.wifeId).toBe(2);
      for (let i = 0; i < 7; i++) state = advance(state, {}, "2026-01-01");
      expect(currentTurn(state)).toEqual({
        wifeId: 3,
        isInitialStay: true,
        nightsLeftInInitialStay: 3,
      });
    });

    it("a gifted night during an initial stay still counts down (she can waive her own grace night too)", () => {
      let state = createQasmState([HIND]);
      state = addWife(state, ZAYNAB, "thayyib");
      state = advance(state, { gifted: true }, "2026-01-01");
      expect(currentTurn(state)?.nightsLeftInInitialStay).toBe(2);
      expect(state.history[0].gifted).toBe(true);
    });
  });
});

describe("undoLastNight", () => {
  it("is a no-op with no history (nothing to undo)", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    expect(undoLastNight(state)).toEqual(state);
  });

  it("undoLastNight(advance(s)) deep-equals s — steady-rotation branch", () => {
    const s = createQasmState([HIND, ZAYNAB]);
    expect(undoLastNight(advance(s, {}, "2026-01-01"))).toEqual(s);
  });

  it("undoLastNight(advance(s)) deep-equals s — initial-stay branch, including the night that pops the queue head at nightsLeft->0", () => {
    let s = createQasmState([HIND]);
    s = addWife(s, ZAYNAB, "thayyib"); // nightsLeft: 3
    s = advance(s, {}, "d1"); // nightsLeft: 3 -> 2, not popped
    s = advance(s, {}, "d2"); // nightsLeft: 2 -> 1, not popped
    // One-level undo: rotation/history return to exactly s; the undoStack is
    // now empty (you can undo the last night, not the one before it).
    expect(undoLastNight(advance(s, {}, "d3"))).toEqual({ ...s, undoStack: [] }); // 1 -> 0, pops the queue head
  });

  it("a structural change (reorder) clears the pending undo — undoLastNight is then a no-op (P1)", () => {
    let s = createQasmState([HIND, ZAYNAB, RUQAYYA]);
    s = advance(s, {}, "d1");
    const reordered = reorderRotation(s, [RUQAYYA.id, HIND.id, ZAYNAB.id]);
    // undo must NOT restore the stale positional turnIndex against the new order
    expect(undoLastNight(reordered)).toEqual(reordered);
    expect(reordered.undoStack).toEqual([]);
  });

  it("a structural change (addWife) clears the pending undo — undoLastNight is then a no-op (P1)", () => {
    let s = createQasmState([HIND, ZAYNAB]);
    s = advance(s, {}, "d1");
    const withNew = addWife(s, RUQAYYA, "thayyib");
    expect(undoLastNight(withNew)).toEqual(withNew);
    expect(withNew.undoStack).toEqual([]);
  });

  it("a sync that changes nothing structural KEEPS the pending undo (P3)", () => {
    let s = createQasmState([HIND, ZAYNAB]);
    s = advance(s, {}, "d1");
    expect(s.undoStack.length).toBe(1);
    // same wives, same order -> no structural change -> undo survives
    const { state: synced } = syncWivesFromPartners(s, [HIND, ZAYNAB]);
    expect(synced.undoStack).toEqual(s.undoStack);
    expect(undoLastNight(synced).history.length).toBe(0);
  });

  it("the undoStack never nests or grows unbounded across many advances (P2/P3)", () => {
    let s = createQasmState([HIND, ZAYNAB]);
    for (let i = 0; i < 20; i++) s = advance(s, {}, `d${i}`);
    expect(s.undoStack.length).toBe(1);
    // a flat snapshot: no embedded prior undoStack chain
    expect((s.undoStack[0] as any).undoStack).toBeUndefined();
  });

  it("removes the logged night and restores the exact pre-advance turnIndex/queue (steady rotation)", () => {
    let state = createQasmState([HIND, ZAYNAB, RUQAYYA]);
    state = advance(state, {}, "2026-01-01"); // turnIndex 0 -> 1
    const undone = undoLastNight(state);
    expect(undone.history).toEqual([]);
    expect(undone.turnIndex).toBe(0);
    expect(currentTurn(undone)?.wifeId).toBe(1);
  });

  it("is a no-op the second time in a row — bounded to the single last night", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, {}, "2026-01-01");
    const undone = undoLastNight(state);
    expect(undoLastNight(undone)).toEqual(undone);
  });

  it("does not mutate the state passed in", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, {}, "2026-01-01");
    const before = JSON.parse(JSON.stringify(state));
    undoLastNight(state);
    expect(state).toEqual(before);
  });
});

describe("deleteNightRecord", () => {
  it("removes the entry at the given index", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, {}, "2026-01-01");
    state = advance(state, {}, "2026-01-02");
    const next = deleteNightRecord(state, 0);
    expect(next.history).toEqual([{ wifeId: 2, date: "2026-01-02", gifted: false }]);
  });

  it("does not touch rotation state — only the log", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, {}, "2026-01-01");
    const next = deleteNightRecord(state, 0);
    expect(next.turnIndex).toBe(state.turnIndex);
    expect(next.order).toEqual(state.order);
  });

  it("guards a negative index (no-op)", () => {
    const state = createQasmState([HIND]);
    expect(deleteNightRecord(state, -1)).toEqual(state);
  });

  it("guards an out-of-range index (no-op)", () => {
    let state = createQasmState([HIND]);
    state = advance(state, {}, "2026-01-01");
    expect(deleteNightRecord(state, 5)).toEqual(state);
  });

  it("clears the pending undo snapshot when deleting the current last entry", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, {}, "2026-01-01");
    const next = deleteNightRecord(state, 0); // the only entry — also the last
    expect(next.undoStack).toEqual([]);
  });

  it("keeps the pending undo snapshot when the deleted entry is NOT the last one", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, {}, "2026-01-01");
    state = advance(state, {}, "2026-01-02");
    const next = deleteNightRecord(state, 0); // removes the older entry, not the last
    expect(next.undoStack).toEqual(state.undoStack);
  });

  it("does not mutate the state passed in", () => {
    let state = createQasmState([HIND]);
    state = advance(state, {}, "2026-01-01");
    const before = JSON.parse(JSON.stringify(state));
    deleteNightRecord(state, 0);
    expect(state).toEqual(before);
  });
});

describe("addWife", () => {
  it("adds her to the wives list and the end of the rotation order", () => {
    let state = createQasmState([HIND]);
    state = addWife(state, ZAYNAB, "bikr");
    expect(state.wives.map((w) => w.id)).toEqual([1, 2]);
    expect(state.order).toEqual([1, 2]);
  });

  it("marks her active", () => {
    let state = createQasmState([HIND]);
    state = addWife(state, ZAYNAB, "bikr");
    expect(state.wives.find((w) => w.id === 2)?.active).toBe(true);
  });

  it("gives a bikr wife 7 initial nights", () => {
    let state = createQasmState([HIND]);
    state = addWife(state, ZAYNAB, "bikr");
    expect(state.initialStayQueue).toEqual([{ wifeId: 2, nightsLeft: 7 }]);
  });

  it("gives a thayyib wife 3 initial nights", () => {
    let state = createQasmState([HIND]);
    state = addWife(state, ZAYNAB, "thayyib");
    expect(state.initialStayQueue).toEqual([{ wifeId: 2, nightsLeft: 3 }]);
  });

  it("is a no-op for a wife already ACTIVE (no double rotation share, no restarted clock)", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    const before = state;
    state = addWife(state, ZAYNAB, "bikr");
    expect(state).toEqual(before);
  });

  it("reactivates a returning wife (رجعة/remarriage) and restores her to the rotation", () => {
    // Regression (cubic P1): addWife's old blanket "known -> no-op" guard
    // also blocked reactivating a previously-divorced wife who remarries —
    // the only path that ever adds anyone to `order`. Without this she was
    // permanently stuck at zero nights despite showing active: true.
    let state = createQasmState([HIND, ZAYNAB]);
    ({ state } = syncWivesFromPartners(state, [ZAYNAB])); // HIND divorced
    expect(state.order).toEqual([2]);
    state = addWife(state, { id: 1, name: "هند", active: true }, "thayyib");
    expect(state.wives.find((w) => w.id === 1)?.active).toBe(true);
    expect(state.order).toEqual([2, 1]);
    expect(state.initialStayQueue).toEqual([{ wifeId: 1, nightsLeft: 3 }]);
  });
});

describe("syncWivesFromPartners", () => {
  it("reports wives present on the server but not yet known locally, without auto-adding them", () => {
    const state = createQasmState([HIND]);
    const { state: next, newWives } = syncWivesFromPartners(state, [HIND, ZAYNAB]);
    expect(newWives).toEqual([ZAYNAB]);
    expect(next.order).toEqual([1]); // caller must call addWife() with her bikr/thayyib mark
  });

  it("refreshes a known wife's display name without touching rotation state", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, {}, "2026-01-01"); // turnIndex now 1, one history entry
    const { state: next } = syncWivesFromPartners(state, [
      { id: 1, name: "هند الجديدة", active: true },
      ZAYNAB,
    ]);
    expect(next.wives.find((w) => w.id === 1)?.name).toBe("هند الجديدة");
    expect(next.turnIndex).toBe(1);
    expect(next.history).toHaveLength(1);
  });

  it("drops a wife no longer confirmed (e.g. divorced) from the live rotation, keeping her past history", () => {
    let state = createQasmState([HIND, ZAYNAB, RUQAYYA]);
    state = advance(state, {}, "2026-01-01"); // a real night logged for HIND
    const { state: next } = syncWivesFromPartners(state, [ZAYNAB, RUQAYYA]); // HIND gone
    expect(next.order).toEqual([2, 3]);
    expect(next.history).toEqual([{ wifeId: 1, date: "2026-01-01", gifted: false }]);
  });

  it("keeps a departed wife's wives-entry (name intact) marked inactive, rather than deleting it", () => {
    // Regression: nameFor()-style lookups in the UI resolve names by
    // scanning qasmState.wives — deleting her entirely turned her own
    // preserved history rows into blank-named, unreadable audit entries.
    const state = createQasmState([HIND, ZAYNAB]);
    const { state: next } = syncWivesFromPartners(state, [ZAYNAB]); // HIND gone
    const hind = next.wives.find((w) => w.id === 1);
    expect(hind).toEqual({ id: 1, name: "هند", active: false });
  });

  it("does not skip the wife who was actually due when a DIFFERENT wife is removed", () => {
    // Regression (adversarial review): order=[A,B,C,D], B is due. A leaves.
    // A naive `turnIndex % newOrder.length` reassigns the turn to C —
    // silently skipping B, who was never the one who left.
    let state = createQasmState([HIND, ZAYNAB, RUQAYYA, UMM_SALAMA]); // [1,2,3,4]
    state = advance(state, {}, "d1"); // turnIndex 1 -> ZAYNAB (2) is due
    expect(currentTurn(state)?.wifeId).toBe(2);
    const { state: next } = syncWivesFromPartners(state, [ZAYNAB, RUQAYYA, UMM_SALAMA]); // HIND leaves
    expect(next.order).toEqual([2, 3, 4]);
    expect(currentTurn(next)?.wifeId).toBe(2); // still ZAYNAB, not shifted to RUQAYYA
  });

  it("advances to the next still-present wife when the one actually due leaves", () => {
    let state = createQasmState([HIND, ZAYNAB, RUQAYYA, UMM_SALAMA]); // [1,2,3,4]
    state = advance(state, {}, "d1"); // turnIndex 1 -> ZAYNAB (2) is due
    const { state: next } = syncWivesFromPartners(state, [HIND, RUQAYYA, UMM_SALAMA]); // ZAYNAB leaves
    expect(next.order).toEqual([1, 3, 4]);
    expect(currentTurn(next)?.wifeId).toBe(3); // RUQAYYA, next after ZAYNAB in the original order
  });

  it("clamps turnIndex back in range when a removal shrinks the order array", () => {
    let state = createQasmState([HIND, ZAYNAB, RUQAYYA]);
    state = advance(state, {}, "d1");
    state = advance(state, {}, "d2"); // turnIndex = 2, RUQAYYA's turn
    const { state: next } = syncWivesFromPartners(state, [HIND, ZAYNAB]); // RUQAYYA removed
    expect(next.order).toEqual([1, 2]);
    expect(next.turnIndex).toBe(0);
  });

  it("removes a departed wife from an in-progress initial-stay queue too", () => {
    let state = createQasmState([HIND]);
    state = addWife(state, ZAYNAB, "bikr");
    const { state: next } = syncWivesFromPartners(state, [HIND]); // ZAYNAB gone before her stay finished
    expect(next.initialStayQueue).toEqual([]);
  });

  it("reports a departed wife who reappears (رجعة/remarriage) as newWives again, not silently reactivated", () => {
    // Regression (cubic P1): reactivating her active flag here without
    // restoring her to `order` left her permanently stuck at zero nights,
    // with no in-app recovery path. Routing her back through newWives ->
    // addWife is what actually restores her rotation membership.
    let state = createQasmState([HIND, ZAYNAB]);
    ({ state } = syncWivesFromPartners(state, [ZAYNAB])); // HIND divorced, now inactive
    expect(state.wives.find((w) => w.id === 1)?.active).toBe(false);
    const { state: next, newWives } = syncWivesFromPartners(state, [HIND, ZAYNAB]); // HIND back
    expect(newWives).toEqual([HIND]);
    expect(next.wives.find((w) => w.id === 1)?.active).toBe(false); // not yet — only addWife reactivates her
    expect(next.order).toEqual([2]); // still excluded from rotation until addWife runs
  });
});

describe("reorderRotation", () => {
  it("reorders the rotation to the given permutation", () => {
    const state = createQasmState([HIND, ZAYNAB, RUQAYYA]); // order [1,2,3]
    const next = reorderRotation(state, [3, 1, 2]);
    expect(next.order).toEqual([3, 1, 2]);
  });

  it("is a no-op when newOrder is a different length (not a permutation)", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    expect(reorderRotation(state, [1, 2, 3])).toEqual(state);
  });

  it("is a no-op when newOrder repeats an id instead of a true permutation", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    expect(reorderRotation(state, [1, 1])).toEqual(state);
  });

  it("is a no-op when newOrder contains an id foreign to the current order", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    expect(reorderRotation(state, [1, 99])).toEqual(state);
  });

  it("keeps the currently-due wife designated after a reorder shuffles her position", () => {
    let state = createQasmState([HIND, ZAYNAB, RUQAYYA]); // order [1,2,3], turnIndex 0
    state = advance(state, {}, "d1"); // turnIndex -> 1 (ZAYNAB due)
    expect(currentTurn(state)?.wifeId).toBe(2);
    const next = reorderRotation(state, [1, 3, 2]); // ZAYNAB moves from index 1 to index 2
    expect(next.order).toEqual([1, 3, 2]);
    expect(next.turnIndex).toBe(2); // tracks ZAYNAB's new position, not the old raw index
    expect(currentTurn(next)?.wifeId).toBe(2); // still ZAYNAB
  });

  it("keeps designating the same wife across a reorder even mid initial-stay (turnIndex tracks the interrupted slot, not currentTurn)", () => {
    let state = createQasmState([HIND, ZAYNAB]); // order [1,2], turnIndex 0
    state = advance(state, {}, "d1"); // turnIndex -> 1 (ZAYNAB pending once the queue below ends)
    state = addWife(state, RUQAYYA, "thayyib"); // order [1,2,3]; currentTurn is RUQAYYA (initial stay)
    const next = reorderRotation(state, [2, 3, 1]); // ZAYNAB moves to index 0
    expect(next.order).toEqual([2, 3, 1]);
    let after = next;
    for (let i = 0; i < 3; i++) after = advance(after, {}, `d${i + 2}`); // finish RUQAYYA's 3 nights
    expect(currentTurn(after)?.wifeId).toBe(2); // ZAYNAB, not HIND, resumes
  });

  it("does not mutate the state passed in", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    const before = JSON.parse(JSON.stringify(state));
    reorderRotation(state, [2, 1]);
    expect(state).toEqual(before);
  });
});

describe("resetQasm", () => {
  it("rebuilds a fresh rotation from only the currently-active wives", () => {
    let state = createQasmState([HIND, ZAYNAB, RUQAYYA]);
    state = advance(state, {}, "d1");
    state = advance(state, {}, "d2");
    ({ state } = syncWivesFromPartners(state, [ZAYNAB, RUQAYYA])); // HIND departs
    const next = resetQasm(state);
    expect(next.order).toEqual([2, 3]);
    expect(next.turnIndex).toBe(0);
    expect(next.initialStayQueue).toEqual([]);
  });

  it("clears history and drawHistory", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, {}, "d1");
    state = recordTravelDraw(state, () => 0, "d1");
    const next = resetQasm(state);
    expect(next.history).toEqual([]);
    expect(next.drawHistory).toEqual([]);
  });

  it("keeps expenses — they are financial records, not rotation state", () => {
    let state = createQasmState([HIND]);
    state = addExpense(state, { wifeId: 1, amount: 50 }, "d1");
    const next = resetQasm(state);
    expect(next.expenses).toEqual(state.expenses);
  });

  it("keeps the full wives roster, including inactive ones, so old expense rows still resolve a name", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    ({ state } = syncWivesFromPartners(state, [ZAYNAB])); // HIND departs
    const next = resetQasm(state);
    expect(next.wives.find((w) => w.id === 1)).toEqual({ id: 1, name: "هند", active: false });
  });

  it("clears any pending undo snapshot", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = advance(state, {}, "d1");
    expect(resetQasm(state).undoStack).toEqual([]);
  });

  it("does not mutate the state passed in", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    const before = JSON.parse(JSON.stringify(state));
    resetQasm(state);
    expect(state).toEqual(before);
  });
});

describe("pickWifeForTravel (قرعة)", () => {
  it("returns null when there are no wives to draw from", () => {
    expect(pickWifeForTravel([], () => 0.5)).toBeNull();
  });

  it("picks the first wife when rng returns 0", () => {
    expect(pickWifeForTravel([HIND, ZAYNAB, RUQAYYA], () => 0)).toBe(1);
  });

  it("picks the last wife when rng returns just under 1 (floor boundary)", () => {
    expect(pickWifeForTravel([HIND, ZAYNAB, RUQAYYA], () => 0.999999)).toBe(3);
  });

  it("clamps a defensive rng() === 1 to the last wife instead of an out-of-bounds index", () => {
    expect(pickWifeForTravel([HIND, ZAYNAB, RUQAYYA], () => 1)).toBe(3);
  });

  it("is a pure function of the rng sequence (deterministic replay)", () => {
    const sequence = [0.1, 0.9, 0.4];
    let i = 0;
    const rng = () => sequence[i++];
    const wives = [HIND, ZAYNAB, RUQAYYA];
    expect([
      pickWifeForTravel(wives, rng),
      pickWifeForTravel(wives, rng),
      pickWifeForTravel(wives, rng),
    ]).toEqual([1, 3, 2]);
  });

  it("draws uniformly over many trials (fairness, not just mechanism)", () => {
    // Deterministic seeded LCG, test-only — the point is a KNOWN, replayable
    // sequence, not real randomness. Numerical Recipes' constants.
    let seed = 42;
    const seededRng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const wives = [HIND, ZAYNAB, RUQAYYA];
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    const TRIALS = 6000;
    for (let i = 0; i < TRIALS; i++) {
      const id = pickWifeForTravel(wives, seededRng)!;
      counts[id]++;
    }
    for (const id of [1, 2, 3]) {
      expect(counts[id]).toBeGreaterThan(TRIALS / 3 - TRIALS * 0.1);
      expect(counts[id]).toBeLessThan(TRIALS / 3 + TRIALS * 0.1);
    }
  });
});

describe("recordTravelDraw", () => {
  it("appends the picked wife to drawHistory", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    const next = recordTravelDraw(state, () => 0, "2026-01-01");
    expect(next.drawHistory).toEqual([{ wifeId: 1, date: "2026-01-01" }]);
  });

  it("is a no-op with no wives to draw from", () => {
    const state = createQasmState([]);
    expect(recordTravelDraw(state, () => 0, "2026-01-01")).toEqual(state);
  });

  it("never draws a departed (inactive) wife", () => {
    // HIND is inactive; only ZAYNAB and RUQAYYA are eligible. rng()->just
    // under 1 would pick the LAST of all three wives (RUQAYYA/HIND) if the
    // inactive filter were missing — assert it lands on the last ACTIVE one.
    const state: QasmState = {
      ...createQasmState([ZAYNAB, RUQAYYA]),
      wives: [{ ...HIND, active: false }, ZAYNAB, RUQAYYA],
    };
    const next = recordTravelDraw(state, () => 0.999999, "2026-01-01");
    expect(next.drawHistory[0].wifeId).toBe(3); // RUQAYYA, never HIND
  });

  it("does not mutate the state passed in", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    const before = JSON.parse(JSON.stringify(state));
    recordTravelDraw(state, () => 0, "2026-01-01");
    expect(state).toEqual(before);
  });
});

describe("deleteDrawRecord", () => {
  it("removes the entry at the given index", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = recordTravelDraw(state, () => 0, "2026-01-01");
    state = recordTravelDraw(state, () => 0.999999, "2026-01-02");
    const next = deleteDrawRecord(state, 0);
    expect(next.drawHistory).toEqual([{ wifeId: 2, date: "2026-01-02" }]);
  });

  it("guards a negative index (no-op)", () => {
    const state = createQasmState([HIND, ZAYNAB]);
    expect(deleteDrawRecord(state, -1)).toEqual(state);
  });

  it("guards an out-of-range index (no-op)", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = recordTravelDraw(state, () => 0, "2026-01-01");
    expect(deleteDrawRecord(state, 3)).toEqual(state);
  });

  it("does not mutate the state passed in", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = recordTravelDraw(state, () => 0, "2026-01-01");
    const before = JSON.parse(JSON.stringify(state));
    deleteDrawRecord(state, 0);
    expect(state).toEqual(before);
  });
});

describe("addExpense / expenseTotalsByWife (نفقة log)", () => {
  it("sums multiple entries per wife", () => {
    let state = createQasmState([HIND, ZAYNAB]);
    state = addExpense(state, { wifeId: 1, amount: 50, note: "ثياب" }, "2026-01-01");
    state = addExpense(state, { wifeId: 1, amount: 20 }, "2026-01-02");
    state = addExpense(state, { wifeId: 2, amount: 10 }, "2026-01-02");
    expect(expenseTotalsByWife(state)).toEqual({ 1: 70, 2: 10 });
  });

  it("ignores a non-finite amount instead of corrupting the log", () => {
    let state = createQasmState([HIND]);
    state = addExpense(state, { wifeId: 1, amount: NaN }, "2026-01-01");
    expect(state.expenses).toEqual([]);
  });

  it("does not mutate the state passed in", () => {
    const state = createQasmState([HIND]);
    const before = JSON.parse(JSON.stringify(state));
    addExpense(state, { wifeId: 1, amount: 5 }, "2026-01-01");
    expect(state).toEqual(before);
  });
});

describe("isQasmState", () => {
  it("accepts a real QasmState", () => {
    expect(isQasmState(createQasmState([HIND, ZAYNAB]))).toBe(true);
  });

  it("rejects null/undefined/primitives", () => {
    expect(isQasmState(null)).toBe(false);
    expect(isQasmState(undefined)).toBe(false);
    expect(isQasmState("not an object")).toBe(false);
    expect(isQasmState(42)).toBe(false);
  });

  it("rejects an empty object (the exact malformed-blob crash case)", () => {
    expect(isQasmState({})).toBe(false);
  });

  it("rejects a shape missing one required array field", () => {
    const almost = { ...createQasmState([HIND]), expenses: undefined };
    expect(isQasmState(almost)).toBe(false);
  });

  it("accepts a stored state missing the newer undoStack field (back-compat with older saved data)", () => {
    const legacy = {
      wives: [{ id: 1, name: "هند", active: true }],
      order: [1],
      turnIndex: 0,
      initialStayQueue: [],
      history: [],
      drawHistory: [],
      expenses: [],
    };
    expect(isQasmState(legacy)).toBe(true);
  });

  it("rejects a present but malformed undoStack field", () => {
    const malformed = { ...createQasmState([HIND]), undoStack: "not-an-array" };
    expect(isQasmState(malformed)).toBe(false);
  });
});
