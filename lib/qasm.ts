/**
 * القَسْم والقرعة — pure fairness logic for a polygamous husband's night
 * rotation and travel-companion draw. Husband-only, private (INV-5 in
 * docs/superpowers/specs/2026-08-31-polygamy-suite-design.md): a wife must
 * never see this. Enforced by keeping ALL of it client-local — no server
 * write path anywhere in this feature, and no server persistence of any of
 * this state (app/qasm.tsx does read the husband's own already-authorized
 * wife list via the existing trpc.links.listPartners query, same as
 * family.tsx already does — that is not new server surface) — and gating
 * the entry point on the husband's own account.
 *
 * Pure module, no I/O: app/qasm.tsx owns AsyncStorage persistence and calls
 * these functions on the loaded state.
 */

/**
 * Single source of truth for the AsyncStorage key this feature persists
 * under, shared by app/qasm.tsx (read/write) and lib/auth-context.tsx
 * (deleted on logout) so the two can never drift apart into two different
 * key formats.
 */
export function qasmStorageKey(userId: number): string {
  return `@qasm_state_${userId}`;
}

/** بِكْر (never previously married) or ثيّب (previously married). Decides
 * a newly-added wife's initial-stay length — Muslim, from Anas: "It is the
 * sunnah that when a man marries a virgin and he already has a previously-
 * married wife, he stays with her seven days, then it is divided; and if
 * he marries a previously-married woman, he stays with her three days,
 * then it is divided." */
export type MaritalHistory = "bikr" | "thayyib";

export function initialStayNights(history: MaritalHistory): number {
  return history === "bikr" ? 7 : 3;
}

export interface QasmWife {
  id: number;
  name: string;
  /** False once she is no longer a confirmed wife (e.g. divorce) — dropped
   * from the live rotation/draw pool but kept here (name and all) so her
   * past history/drawHistory/expenses rows stay readable instead of
   * resolving to a blank name forever. */
  active: boolean;
}

/** One resolved night, in the order they happened. `gifted` marks هبة
 * الليلة — the wife whose turn it was waived it onward rather than staying. */
export interface QasmNightRecord {
  wifeId: number;
  date: string;
  gifted: boolean;
}

export interface QasmDrawRecord {
  wifeId: number;
  date: string;
}

export interface QasmExpenseRecord {
  wifeId: number;
  amount: number;
  note?: string;
  date: string;
}

/** Captured by advance() just before it changes turnIndex/initialStayQueue,
 * so undoLastNight() can restore them exactly afterwards — advance()'s two
 * branches (steady rotation vs. initial-stay countdown) are otherwise
 * ambiguous to reverse from the resulting state alone. It is FLAT: it does
 * NOT embed the prior undoStack (which would grow the persisted state
 * without bound), and undo is a single level — undoing empties the stack.
 * The turnIndex here is POSITIONAL, so any change to `order`
 * (reorderRotation/addWife/syncWivesFromPartners) clears the pending
 * snapshot rather than letting undo restore a now-stale index. */
export interface QasmUndoSnapshot {
  turnIndex: number;
  initialStayQueue: { wifeId: number; nightsLeft: number }[];
}

export interface QasmState {
  /** Every wife ever known, active or not (see QasmWife.active). */
  wives: QasmWife[];
  /** Steady-state rotation queue (active wife ids), one night each in turn. */
  order: number[];
  /** Index into `order` for whose turn it is once no initial stay is owed. */
  turnIndex: number;
  /** FIFO queue of new wives still owed their 7/3 initial stay. While
   * non-empty, the head interrupts the steady rotation above — `turnIndex`
   * does not move until it empties, so the round resumes exactly where it
   * was left off (per the hadith: "then it is divided" — i.e. the normal
   * rotation continues, not restarts). */
  initialStayQueue: { wifeId: number; nightsLeft: number }[];
  history: QasmNightRecord[];
  drawHistory: QasmDrawRecord[];
  expenses: QasmExpenseRecord[];
  /** Bounded to the single most recent advance() — enough to undo "the last
   * night" (what was asked for), not a full history of undos. Cleared
   * whenever something else invalidates it: resetQasm(), or
   * deleteNightRecord() removing the very entry this would restore. */
  undoStack: QasmUndoSnapshot[];
}

export const isoToday = (): string => new Date().toISOString().slice(0, 10);

/**
 * Fresh setup for a household's FIRST-ever use of this screen. The given
 * wives enter as already-established members of the rotation with no
 * initial stay owed — there is no way to know when a founding wife actually
 * married, so the 7/3 grace rule cannot be applied retroactively. It only
 * ever engages for a wife added LATER, via addWife().
 *
 * ponytail: this is a real ceiling of the "no server persistence" design
 * (a HARD requirement for this feature, not an oversight) — a wife added
 * before the husband ever opens this screen, or rediscovered after an
 * uninstall/storage-clear, re-enters as already-established too, with no
 * 7/3 owed. There is no server-side marriage-date record to recover this
 * from without adding server state, which this feature is deliberately
 * built without. Upgrade path if this ever matters enough: a server-side
 * "wife added on" timestamp the husband already implicitly creates by
 * confirming the partnership.
 */
export function createQasmState(wives: readonly QasmWife[]): QasmState {
  return {
    wives: wives.map((w) => ({ id: w.id, name: w.name, active: true })),
    order: wives.map((w) => w.id),
    turnIndex: 0,
    initialStayQueue: [],
    history: [],
    drawHistory: [],
    expenses: [],
    undoStack: [],
  };
}

export interface QasmTurn {
  wifeId: number;
  isInitialStay: boolean;
  /** Nights still owed in her initial stay; 0 when isInitialStay is false. */
  nightsLeftInInitialStay: number;
}

/** Whose turn it is right now: the head of the initial-stay queue if one is
 * owed, else whoever the steady rotation points at. Null with no wives. */
export function currentTurn(state: QasmState): QasmTurn | null {
  if (state.initialStayQueue.length > 0) {
    const head = state.initialStayQueue[0];
    return { wifeId: head.wifeId, isInitialStay: true, nightsLeftInInitialStay: head.nightsLeft };
  }
  if (state.order.length === 0) return null;
  return {
    wifeId: state.order[state.turnIndex % state.order.length],
    isInitialStay: false,
    nightsLeftInInitialStay: 0,
  };
}

/**
 * Resolves the current night — logs it and passes the turn onward. A
 * gifted night (هبة الليلة) moves the turn exactly the same way a stayed
 * night does; only the log records the difference, because either way her
 * slot is now spent and the next wife (or the rest of an initial stay) is up.
 *
 * A gift is honored even mid initial-stay: those nights are HER entitlement
 * (Muslim, from Anas), and a right held for someone can be waived by that
 * same someone — the identical principle that makes هبة الليلة valid for a
 * normal-rotation night in the first place (Sawdah radiya Allahu 'anha).
 *
 * Also snapshots the pre-advance turnIndex/initialStayQueue into
 * `undoStack` (a flat, single-entry snapshot — it does NOT embed the prior
 * undoStack, so the persisted state cannot grow without bound) so
 * undoLastNight() can reverse exactly this call. Any structural change to
 * the rotation (reorderRotation/addWife/syncWivesFromPartners) clears it,
 * since the snapshot's positional turnIndex would otherwise be stale.
 */
export function advance(
  state: QasmState,
  opts: { gifted?: boolean } = {},
  today: string = isoToday(),
): QasmState {
  const turn = currentTurn(state);
  if (!turn) return state;

  const history = [...state.history, { wifeId: turn.wifeId, date: today, gifted: !!opts.gifted }];
  const snapshot: QasmUndoSnapshot = {
    turnIndex: state.turnIndex,
    initialStayQueue: state.initialStayQueue,
  };

  if (state.initialStayQueue.length > 0) {
    const [head, ...rest] = state.initialStayQueue;
    const nightsLeft = head.nightsLeft - 1;
    const initialStayQueue = nightsLeft > 0 ? [{ ...head, nightsLeft }, ...rest] : rest;
    return { ...state, initialStayQueue, history, undoStack: [snapshot] };
  }

  const turnIndex = (state.turnIndex + 1) % state.order.length;
  return { ...state, turnIndex, history, undoStack: [snapshot] };
}

/**
 * Reverses the most recent advance() — removing the history entry it added
 * AND restoring turnIndex/initialStayQueue to exactly what they were before
 * it ran, using the snapshot advance() left in `undoStack`. Bounded to one
 * level (Daa3iyah asked to undo "the last night"): calling this twice in a
 * row is a no-op the second time, same as calling it with nothing to undo.
 * Also a no-op once `undoStack` has been cleared by something else since
 * that advance (resetQasm, or deleteNightRecord removing that same entry).
 */
export function undoLastNight(state: QasmState): QasmState {
  if (state.history.length === 0 || state.undoStack.length === 0) return state;
  const snapshot = state.undoStack[state.undoStack.length - 1];
  return {
    ...state,
    history: state.history.slice(0, -1),
    turnIndex: snapshot.turnIndex,
    initialStayQueue: snapshot.initialStayQueue,
    undoStack: [],
  };
}

/**
 * Removes one entry from the nights log as a factual-record correction
 * (wrong wife, wrong date, logged twice) — unlike undoLastNight, this never
 * touches the rotation itself, only the log. Guards an out-of-range index.
 * Clears the pending undo snapshot when the deleted entry IS the current
 * last one, since undoLastNight would otherwise restore the rotation for a
 * night that is no longer the log's last entry — reversing the wrong one.
 */
export function deleteNightRecord(state: QasmState, index: number): QasmState {
  if (index < 0 || index >= state.history.length) return state;
  const deletingLast = index === state.history.length - 1;
  return {
    ...state,
    history: state.history.filter((_, i) => i !== index),
    undoStack: deletingLast ? [] : state.undoStack,
  };
}

/**
 * Marries in a new wife — or remarries a previously-departed one (رجعة) —
 * joining the steady rotation going forward and queuing 7 (bikr) or 3
 * (thayyib) initial nights behind any stay already in progress (FIFO — two
 * new wives close together each get their own full grace period, in the
 * order they were added). No-op only if she is already an ACTIVE member,
 * so a defensive re-add from syncWivesFromPartners can never double her
 * rotation share or restart her clock. A known-but-INACTIVE wife (she left
 * the rotation, e.g. divorce) is reactivated and restored to `order` —
 * without this, syncWivesFromPartners flags her as newWives precisely so
 * she comes back through here rather than being silently stuck at active:
 * true with no rotation slot (found in review).
 */
export function addWife(state: QasmState, wife: QasmWife, history: MaritalHistory): QasmState {
  const existing = state.wives.find((w) => w.id === wife.id);
  if (existing?.active) return state;

  const wives = existing
    ? state.wives.map((w) => (w.id === wife.id ? { ...w, name: wife.name, active: true } : w))
    : [...state.wives, { id: wife.id, name: wife.name, active: true }];

  return {
    ...state,
    wives,
    order: [...state.order, wife.id],
    initialStayQueue: [...state.initialStayQueue, { wifeId: wife.id, nightsLeft: initialStayNights(history) }],
    undoStack: [],
  };
}

/**
 * Reconciles local state with the live confirmed-wives list
 * (trpc.links.listPartners). Never auto-adds a brand-new wife, and never
 * auto-REACTIVATES a returning one either — the caller must ask the husband
 * to mark her bikr/thayyib and call addWife() for either case (addWife's
 * own doc comment covers the reactivation half). A wife counts as "new" for
 * this purpose whenever she is not currently an ACTIVE rotation member —
 * whether truly never-seen-before, or previously marked inactive (divorce)
 * and now reappearing (رجعة/remarriage) — so only addWife(), never this
 * function, ever restores anyone to `order`. Marks anyone active who is no
 * longer in the live list `active: false`, dropping her from the LIVE
 * rotation/queue so she can never be picked for a future night or travel
 * draw. Her wives entry (name included) and her past
 * history/drawHistory/expenses rows are left in place as a factual record.
 */
export function syncWivesFromPartners(
  state: QasmState,
  currentWives: readonly QasmWife[],
): { state: QasmState; newWives: QasmWife[] } {
  const currentIds = new Set(currentWives.map((w) => w.id));
  const activeKnownIds = new Set(state.wives.filter((w) => w.active).map((w) => w.id));

  const newWives = currentWives.filter((w) => !activeKnownIds.has(w.id));

  const wives = state.wives.map((w) => {
    if (!w.active) return w; // reactivated only via addWife, see newWives above
    const live = currentWives.find((c) => c.id === w.id);
    if (!live) return { ...w, active: false };
    return live.name !== w.name ? { ...w, name: live.name } : w;
  });

  const order = state.order.filter((id) => currentIds.has(id));
  const initialStayQueue = state.initialStayQueue.filter((q) => currentIds.has(q.wifeId));

  // Track WHO was designated by identity, not by raw array index. A naive
  // `state.turnIndex % order.length` reassigns the turn to whoever the
  // SHRUNK array's modulo happens to land on — removing a wife who wasn't
  // even due can silently skip the wife who actually was. Preserve her
  // identity across the filter instead; only advance if SHE herself left.
  let turnIndex = 0;
  if (order.length > 0 && state.order.length > 0) {
    const oldOrder = state.order;
    const designatedId = oldOrder[state.turnIndex % oldOrder.length];
    if (currentIds.has(designatedId)) {
      turnIndex = order.indexOf(designatedId);
    } else {
      for (let step = 1; step <= oldOrder.length; step++) {
        const candidate = oldOrder[(state.turnIndex + step) % oldOrder.length];
        if (currentIds.has(candidate)) {
          turnIndex = order.indexOf(candidate);
          break;
        }
      }
    }
  }

  // Only clear a pending undo when the rotation ACTUALLY changed structure
  // (a wife left, or the turn moved). A sync that finds nothing different
  // (the common periodic case) must not silently discard the husband's undo.
  const structural =
    order.length !== state.order.length ||
    order.some((id, i) => id !== state.order[i]) ||
    turnIndex !== state.turnIndex;
  return {
    state: { ...state, wives, order, initialStayQueue, turnIndex, undoStack: structural ? [] : state.undoStack },
    newWives,
  };
}

/**
 * Manually reorders the rotation. `newOrder` must be a permutation of the
 * current `order` (same ids, none added/dropped/duplicated) — anything else
 * is a no-op rather than a silent corruption of who's in the rotation.
 * Preserves WHOSE turn is designated across the reorder, not the numeric
 * slot: `turnIndex` is recomputed to wherever that same wife id lands in
 * `newOrder`, the identical identity-over-index technique
 * syncWivesFromPartners already uses above. This holds even mid
 * initial-stay, when turnIndex points at whoever resumes once the queue
 * empties rather than at currentTurn() — reordering must not silently hand
 * her resumed slot to someone else.
 */
export function reorderRotation(state: QasmState, newOrder: number[]): QasmState {
  const sortedCurrent = [...state.order].sort((a, b) => a - b);
  const sortedNew = [...newOrder].sort((a, b) => a - b);
  const isPermutation =
    sortedCurrent.length === sortedNew.length && sortedCurrent.every((id, i) => id === sortedNew[i]);
  if (!isPermutation) return state;

  const designatedId = state.order[state.turnIndex % state.order.length];
  const turnIndex = Math.max(0, newOrder.indexOf(designatedId));
  return { ...state, order: newOrder, turnIndex, undoStack: [] };
}

/**
 * Returns the household to a fresh rotation cycle: active wives re-enter as
 * already-established members (like a brand-new createQasmState), with
 * history, drawHistory, turnIndex, initialStayQueue and any pending undo
 * snapshot all cleared. Expenses are kept — نفقة is a financial record, not
 * rotation state — and so is the full wives roster (inactive members
 * included), since a kept expense row can still reference one.
 */
export function resetQasm(state: QasmState): QasmState {
  const fresh = createQasmState(state.wives.filter((w) => w.active));
  return { ...fresh, wives: state.wives, expenses: state.expenses };
}

/**
 * قرعة: a uniform pick among the given wives — Sunnah for deciding who
 * travels with him (Bukhari/Muslim). `rng` defaults to Math.random and is
 * injectable so the pick is deterministically testable; must return a value
 * in [0, 1). A defensive rng() === 1 clamps to the last wife instead of
 * indexing out of bounds.
 */
export function pickWifeForTravel(
  wives: readonly QasmWife[],
  rng: () => number = Math.random,
): number | null {
  if (wives.length === 0) return null;
  const idx = Math.min(wives.length - 1, Math.floor(rng() * wives.length));
  return wives[idx].id;
}

/** Draws among ACTIVE wives only and logs it. No-op (state unchanged) when
 * there is no one to draw from. */
export function recordTravelDraw(
  state: QasmState,
  rng: () => number = Math.random,
  today: string = isoToday(),
): QasmState {
  const wifeId = pickWifeForTravel(state.wives.filter((w) => w.active), rng);
  if (wifeId === null) return state;
  return { ...state, drawHistory: [...state.drawHistory, { wifeId, date: today }] };
}

/** Removes one entry from the travel-draw log — same factual-record-edit
 * semantics as deleteNightRecord, guarding an out-of-range index. The draw
 * log has no rotation/turn implication, so unlike deleteNightRecord there
 * is no undo snapshot to invalidate. */
export function deleteDrawRecord(state: QasmState, index: number): QasmState {
  if (index < 0 || index >= state.drawHistory.length) return state;
  return { ...state, drawHistory: state.drawHistory.filter((_, i) => i !== index) };
}

/** نفقة log (optional, P4): a light per-wife spend/gift record — no
 * categories, no currency handling, just a running total for fairness
 * visibility. Silently drops a non-finite amount rather than corrupting the
 * log with a NaN that would poison every future sum. Not restricted to
 * active wives — a final gift logged around a divorce is still real نفقة;
 * the screen's own wife-picker is what limits day-to-day entry to current
 * wives. */
export function addExpense(
  state: QasmState,
  entry: { wifeId: number; amount: number; note?: string },
  today: string = isoToday(),
): QasmState {
  if (!Number.isFinite(entry.amount)) return state;
  return {
    ...state,
    expenses: [...state.expenses, { ...entry, date: today }],
  };
}

export function expenseTotalsByWife(state: QasmState): Record<number, number> {
  const totals: Record<number, number> = {};
  for (const e of state.expenses) {
    totals[e.wifeId] = (totals[e.wifeId] ?? 0) + e.amount;
  }
  return totals;
}

/**
 * Type-guards a value parsed from AsyncStorage before trusting it as a
 * QasmState — the sole writer is this module's own persist path, but a
 * future schema change reading an old persisted blob (or, defensively, a
 * hand-edited one) must not crash the screen with ".map is not a function"
 * on a shape that merely happens to be valid JSON.
 */
export function isQasmState(value: unknown): value is QasmState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.wives) &&
    Array.isArray(v.order) &&
    typeof v.turnIndex === "number" &&
    Array.isArray(v.initialStayQueue) &&
    Array.isArray(v.history) &&
    Array.isArray(v.drawHistory) &&
    Array.isArray(v.expenses) &&
    // undoStack is a newer field (added alongside undoLastNight) — optional
    // here so a state saved by an older app version still validates;
    // app/qasm.tsx defaults it to [] on read (see the load effect there).
    (v.undoStack === undefined || Array.isArray(v.undoStack))
  );
}
