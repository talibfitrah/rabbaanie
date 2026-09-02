import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
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
  isoToday,
  isQasmState,
  pickWifeForTravel,
  qasmStorageKey,
  reorderRotation,
  resetQasm,
  syncWivesFromPartners,
  undoLastNight,
  type MaritalHistory,
  type QasmState,
  type QasmWife,
} from "@/lib/qasm";

type Lang = "nl" | "en" | "ar";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

/**
 * القَسْم والقرعة — husband-only, private (INV-5, see
 * docs/superpowers/specs/2026-08-31-polygamy-suite-design.md §0/§5). No new
 * server surface: the only network call this screen makes is the existing
 * trpc.links.listPartners read of the husband's own already-authorized wife
 * list (same query family.tsx already uses) — nothing this screen produces
 * (rotation, history, draws, expenses) is ever sent anywhere. State is
 * persisted only to AsyncStorage, keyed by the logged-in husband's own
 * account id, so a second account on the same device (or a wife, who is
 * never gated in in the first place) addresses a different key entirely.
 */
export default function QasmScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const { state, loading: stateLoading } = useAppState();
  const { user, isAuthenticated } = useAuth();

  const listPartnersQuery = trpc.links.listPartners.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 0,
  });
  const liveWives: QasmWife[] = useMemo(
    () =>
      (listPartnersQuery.data ?? [])
        .filter((p) => p.confirmed)
        .map((p) => ({ id: p.id, name: p.name || tx(lang, "Echtgenote", "Wife", "الزوجة"), active: true })),
    [listPartnersQuery.data, lang],
  );

  const pp = state.parentProfile as any;
  // Same gate as the family-tab entry button (gender + 2-confirmed-wives) —
  // re-checked here because this screen is reachable by direct navigation,
  // not only through that button. There is no server backstop for this
  // module (see the module doc comment), so the client-side gate is the
  // only one there is; the render below never mounts the private content
  // (or even this screen's own title) unless gated is true — see the
  // early-return redirect below.
  const gateReady = !stateLoading && !listPartnersQuery.isLoading;
  // `pp.gender || "man"`: the same default-to-man convention every gender
  // gate in this codebase uses (family.tsx, messages.tsx) for an unset
  // local field — not something introduced here. Flagged in review as a
  // gate that "fails open" on unset gender; true, but bounded: the server
  // caps a woman at one confirmed partnership (INV-6), so `liveWives.length
  // >= 2` cannot be satisfied by an actual wife account regardless of what
  // her local, unsynced gender field happens to read.
  const gated = (pp.gender || "man") === "man" && liveWives.length >= 2;

  const storageKey = user?.id ? qasmStorageKey(user.id) : null;
  const [qasmState, setQasmState] = useState<QasmState | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [pendingNewWives, setPendingNewWives] = useState<QasmWife[]>([]);
  const [drawResult, setDrawResult] = useState<number | null>(null);
  const [expenseWifeId, setExpenseWifeId] = useState<number | null>(null);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");

  // Redirect away the instant the gate fails — never render the lock
  // message, or this screen's own title, to a non-qualifying viewer (this
  // screen can be reached by direct/deep navigation, not only the hidden
  // family-tab button). Handled below via an early return, before any
  // qasm-specific JSX is built.
  useEffect(() => {
    if (gateReady && !gated) router.replace("/(tabs)/family" as any);
  }, [gateReady, gated, router]);

  useEffect(() => {
    // Reset identity-scoped state synchronously, before the async read
    // below resolves: if this screen instance survives an account switch
    // without unmounting, a stale qasmState from the PREVIOUS identity must
    // never render, or be reconciled/persisted, under the new one's key.
    setQasmState(null);
    setStorageLoaded(false);
    setPendingNewWives([]);
    setDrawResult(null);
    if (!storageKey) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Schema-validated, not just JSON-parsed: the sole writer is this
          // module's own persist(), but a future shape change reading an
          // old blob must fall back to "nothing saved yet" rather than
          // crash the screen on the first array method that assumes a
          // field the old blob doesn't have.
          // undoStack (added alongside undoLastNight) is optional in
          // isQasmState for exactly this reason — default it here so a
          // blob saved before this feature shipped still loads.
          if (isQasmState(parsed)) setQasmState({ ...parsed, undoStack: parsed.undoStack ?? [] });
        } catch {
          // malformed JSON — leave qasmState null, treated as fresh setup.
        }
      }
      setStorageLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const persist = (next: QasmState) => {
    setQasmState(next);
    if (storageKey) AsyncStorage.setItem(storageKey, JSON.stringify(next));
  };

  // For handlers that compute the next state FROM the current one
  // (advance/addWife): reads the latest state via React's functional
  // setState rather than the render's closure, so two actions fired in the
  // same tick (e.g. rapid double-tap, or answering two pending-wife
  // prompts back to back) both apply instead of the second silently
  // clobbering the first's result with a stale snapshot.
  const persistUpdate = (updater: (prev: QasmState) => QasmState) => {
    setQasmState((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      if (storageKey) AsyncStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  // Accidental-double-tap guard (fat-finger / slow-render double press),
  // keyed PER ACTION — a real second attempt at the SAME action 500ms
  // later goes through normally, and this never blocks a genuinely
  // different action (e.g. marking a second pending wife right after the
  // first) fired within the same window, which a single shared timestamp
  // would silently swallow.
  const lastActionAt = useRef<Record<string, number>>({});
  const debounced = (key: string, fn: () => void) => () => {
    const now = Date.now();
    if (now - (lastActionAt.current[key] ?? 0) < 500) return;
    lastActionAt.current[key] = now;
    fn();
  };

  // First-ever setup (no persisted state) creates the rotation from today's
  // wives with no initial stay owed (see createQasmState's doc comment).
  // Every later run reconciles against the live confirmed-wives list —
  // detects a genuinely new wife (prompted below for bikr/thayyib rather
  // than auto-added) and drops anyone no longer confirmed, never touching
  // history. `qasmState` is read from closure rather than listed as a
  // dependency on purpose: this effect answers "did the SERVER-side wife
  // list change", not "did the local rotation change" (advance/gift/draw
  // taps must not re-trigger it).
  useEffect(() => {
    if (!storageLoaded || !storageKey || !listPartnersQuery.isSuccess || !gated) return;
    if (qasmState === null) {
      persist(createQasmState(liveWives));
      return;
    }
    const { state: synced, newWives } = syncWivesFromPartners(qasmState, liveWives);
    setPendingNewWives(newWives);
    if (JSON.stringify(synced) !== JSON.stringify(qasmState)) persist(synced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageLoaded, storageKey, listPartnersQuery.isSuccess, liveWives, gated]);

  const nameFor = (id: number) => qasmState?.wives.find((w) => w.id === id)?.name || "";
  const turn = qasmState ? currentTurn(qasmState) : null;
  // A wife picked in the نفقة form can stop being a current wife (divorce)
  // while the form is still open; fall back to null rather than logging an
  // expense against an id no longer in qasmState.wives.
  const validExpenseWifeId = qasmState?.wives.some((w) => w.id === expenseWifeId) ? expenseWifeId : null;

  // Both handlers below: `qasmState` only gates "is anything loaded yet"
  // (an existence check with no consequence if stale by one render — the
  // effect never has 2->0->1 gaps once truthy). The actual read that must
  // be current — the value advance()/addWife() compute from — is `prev`
  // inside persistUpdate, never this outer `qasmState`. Keep it that way:
  // switching either handler's write to use the closure `qasmState`
  // instead of `prev` reintroduces the clobber persistUpdate exists to
  // prevent (found in review).
  const handleAdvance = (gifted: boolean) => {
    if (!qasmState) return;
    persistUpdate((prev) => advance(prev, { gifted }));
  };

  const handleMarkNewWife = (wife: QasmWife, history: MaritalHistory) => {
    if (!qasmState) return;
    persistUpdate((prev) => addWife(prev, wife, history));
    setPendingNewWives((prev) => prev.filter((w) => w.id !== wife.id));
  };

  const handleDraw = () => {
    if (!qasmState) return;
    // The pick itself is a single, synchronous read of the CURRENT active
    // wives (no gap for it to go stale before this line runs) — computed
    // exactly ONCE, outside the state updater below, on purpose. An
    // earlier version drew (Math.random and all) INSIDE the setQasmState
    // updater together with setDrawResult/Alert.alert; React can invoke an
    // updater more than once (StrictMode, concurrent re-renders), which
    // could persist one wife while announcing a different one — wrong for
    // a feature whose entire point is "submit to the قرعة outcome" (found
    // in review). The updater itself now only appends the already-decided
    // pick to `prev.drawHistory`, so it stays pure and can't diverge.
    const activeWives = qasmState.wives.filter((w) => w.active);
    const pickedId = pickWifeForTravel(activeWives);
    if (pickedId === null) return;
    const today = isoToday();
    persistUpdate((prev) => ({ ...prev, drawHistory: [...prev.drawHistory, { wifeId: pickedId, date: today }] }));
    setDrawResult(pickedId);
    const name = activeWives.find((w) => w.id === pickedId)?.name || "";
    Alert.alert(
      tx(lang, "Resultaat van de loting", "Draw result", "نتيجة القرعة"),
      tx(lang, `${name} reist met u mee.`, `${name} will travel with you.`, `ستُرافقك ${name} في السفر.`),
    );
  };

  const handleAddExpense = () => {
    if (!qasmState || validExpenseWifeId === null) return;
    const amount = parseFloat(expenseAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert(tx(lang, "Ongeldig bedrag", "Invalid amount", "مبلغ غير صالح"));
      return;
    }
    persistUpdate((prev) => addExpense(prev, { wifeId: validExpenseWifeId, amount, note: expenseNote.trim() || undefined }));
    setExpenseAmount("");
    setExpenseNote("");
  };

  const handleUndoLastNight = () => {
    if (!qasmState) return;
    persistUpdate(undoLastNight);
  };

  const handleDeleteNightRecord = (index: number) => {
    if (!qasmState) return;
    persistUpdate((prev) => deleteNightRecord(prev, index));
  };

  const handleDeleteDrawRecord = (index: number) => {
    if (!qasmState) return;
    persistUpdate((prev) => deleteDrawRecord(prev, index));
  };

  // `newOrder` is computed once from the render-time order (the swap the
  // pressed arrow represents) — same "decide, then apply" separation as
  // handleDraw above. If the live order changed underneath (a wife added,
  // synced away) before this commits, reorderRotation's own permutation
  // guard safely no-ops instead of applying a stale swap.
  const handleReorderRotation = (newOrder: number[]) => {
    if (!qasmState) return;
    persistUpdate((prev) => reorderRotation(prev, newOrder));
  };

  const handleResetQasm = () => {
    if (!qasmState) return;
    Alert.alert(
      tx(lang, "Het قَسْم volledig resetten?", "Reset the قَسْم completely?", "هل تريد إعادة ضبط القَسْم بالكامل؟"),
      tx(
        lang,
        "De volgorde, nachtgeschiedenis en lotingen worden gewist. De نفقة-gegevens blijven bewaard.",
        "The rotation order, night history and draws will be cleared. نفقة records are kept.",
        "سيُحذف ترتيب القَسْم وسجلّ الليالي والقرعات. ستبقى بيانات النفقة كما هي.",
      ),
      [
        { text: tx(lang, "Annuleren", "Cancel", "إلغاء"), style: "cancel" },
        { text: tx(lang, "Resetten", "Reset", "إعادة الضبط"), style: "destructive", onPress: () => persistUpdate(resetQasm) },
      ],
    );
  };

  const rowDir = isRTL ? "row-reverse" : "row";
  const textAlign = isRTL ? "right" : "left";
  const card = { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border };

  // Not ready yet, or gated out (redirect effect above is firing): render
  // nothing qasm-specific at all — not even this screen's own title — so a
  // non-qualifying viewer who reaches /qasm by direct navigation sees only
  // a content-free spinner indistinguishable from an ordinary loading state.
  if (!gateReady || !gated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: rowDir,
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.foreground }}>
          القَسْم والقرعة
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {!qasmState ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
          {pendingNewWives.map((wife) => (
            <View key={wife.id} style={[card, { borderColor: colors.warning }]}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, textAlign, marginBottom: 8 }}>
                {tx(
                  lang,
                  `Nieuwe echtgenote: ${wife.name} — is zij nog maagd (bikr) of eerder gehuwd (thayyib)?`,
                  `New wife: ${wife.name} — is she previously unmarried (bikr) or previously married (thayyib)?`,
                  `زوجة جديدة: ${wife.name} — هل هي بِكر أم ثيّب؟`,
                )}
              </Text>
              <View style={{ flexDirection: rowDir, gap: 8 }}>
                <Pressable
                  onPress={debounced(`mark-${wife.id}-bikr`, () => handleMarkNewWife(wife, "bikr"))}
                  style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 10, padding: 10, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                    {tx(
                      lang,
                      `Maagd — ${initialStayNights("bikr")} nachten`,
                      `Bikr — ${initialStayNights("bikr")} nights`,
                      `بِكر — ${initialStayNights("bikr")} ليالٍ`,
                    )}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={debounced(`mark-${wife.id}-thayyib`, () => handleMarkNewWife(wife, "thayyib"))}
                  style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 10, padding: 10, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                    {tx(
                      lang,
                      `Eerder gehuwd — ${initialStayNights("thayyib")} nachten`,
                      `Thayyib — ${initialStayNights("thayyib")} nights`,
                      `ثيّب — ${initialStayNights("thayyib")} ليالٍ`,
                    )}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}

          {/* ═══════ قَسْم المبيت ═══════ */}
          <View style={card}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, textAlign, marginBottom: 6 }}>
              {tx(lang, "Vannacht is het de beurt van", "Tonight is the turn of", "الليلة ليلة")}
            </Text>
            {turn ? (
              <>
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, textAlign }}>
                  {nameFor(turn.wifeId)}
                </Text>
                {turn.isInitialStay && (
                  <View style={{ flexDirection: rowDir, alignItems: "center", gap: 6, marginTop: 6 }}>
                    <MaterialIcons name="card-giftcard" size={16} color={colors.warning} />
                    <Text style={{ fontSize: 12, color: colors.warning, fontWeight: "600" }}>
                      {tx(
                        lang,
                        `Ontvangstnachten — nog ${turn.nightsLeftInInitialStay} over`,
                        `Welcome nights — ${turn.nightsLeftInInitialStay} left`,
                        `من ليالي الاستقبال — بقي ${turn.nightsLeftInInitialStay}`,
                      )}
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: rowDir, gap: 8, marginTop: 12 }}>
                  <Pressable
                    onPress={debounced("advance", () => handleAdvance(false))}
                    style={{ flex: 1, backgroundColor: colors.success, borderRadius: 10, padding: 12, alignItems: "center", flexDirection: rowDir, gap: 6 }}
                  >
                    <MaterialIcons name="check-circle" size={16} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                      {tx(lang, "Nacht voltooid", "Night completed", "تمّت الليلة")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={debounced("gift", () => handleAdvance(true))}
                    style={{ flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.warning, borderRadius: 10, padding: 12, alignItems: "center" }}
                  >
                    <Text style={{ color: colors.warning, fontWeight: "700", fontSize: 13 }}>
                      {tx(lang, "Zij schenkt haar nacht (هبة)", "She gifts her night (هبة)", "هبة الليلة")}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 13 }}>—</Text>
            )}
          </View>

          {qasmState.order.length > 0 && (
            <View style={card}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, textAlign, marginBottom: 8 }}>
                {tx(lang, "Volgorde van de verdeling", "Rotation order", "ترتيب القَسْم")}
              </Text>
              {qasmState.order.map((id, i) => {
                const isCurrent = !!(turn && !turn.isInitialStay && id === turn.wifeId);
                return (
                  <View
                    key={`${id}-${i}`}
                    style={{
                      flexDirection: rowDir,
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 6,
                      borderBottomWidth: i < qasmState.order.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 16,
                        backgroundColor: isCurrent ? colors.primary : colors.background,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: isCurrent ? "#fff" : colors.foreground }}>
                        {nameFor(id)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: rowDir, gap: 4 }}>
                      <Pressable
                        disabled={i === 0}
                        onPress={debounced(`order-up-${id}`, () => {
                          const newOrder = [...qasmState.order];
                          [newOrder[i - 1], newOrder[i]] = [newOrder[i], newOrder[i - 1]];
                          handleReorderRotation(newOrder);
                        })}
                        style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center", opacity: i === 0 ? 0.3 : 1 }}
                      >
                        <MaterialIcons name="arrow-upward" size={18} color={colors.foreground} />
                      </Pressable>
                      <Pressable
                        disabled={i === qasmState.order.length - 1}
                        onPress={debounced(`order-down-${id}`, () => {
                          const newOrder = [...qasmState.order];
                          [newOrder[i], newOrder[i + 1]] = [newOrder[i + 1], newOrder[i]];
                          handleReorderRotation(newOrder);
                        })}
                        style={{
                          width: 30,
                          height: 30,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: i === qasmState.order.length - 1 ? 0.3 : 1,
                        }}
                      >
                        <MaterialIcons name="arrow-downward" size={18} color={colors.foreground} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {qasmState.history.length > 0 && (
            <View style={card}>
              <View style={{ flexDirection: rowDir, alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, textAlign }}>
                  {tx(lang, "Recente nachten", "Recent nights", "الليالي الأخيرة")}
                </Text>
                {qasmState.undoStack.length > 0 && (
                  <Pressable
                    onPress={debounced("undo-last-night", handleUndoLastNight)}
                    style={{ flexDirection: rowDir, alignItems: "center", gap: 4 }}
                  >
                    <MaterialIcons name="undo" size={16} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                      {tx(lang, "Ongedaan maken", "Undo", "تراجع عن آخر ليلة")}
                    </Text>
                  </Pressable>
                )}
              </View>
              {[...qasmState.history].reverse().slice(0, 6).map((h, i) => {
                const index = qasmState.history.length - 1 - i;
                return (
                  <View
                    key={index}
                    style={{ flexDirection: rowDir, alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}
                  >
                    <Text style={{ fontSize: 13, color: colors.foreground }}>{nameFor(h.wifeId)}</Text>
                    <View style={{ flexDirection: rowDir, alignItems: "center", gap: 6 }}>
                      {h.gifted && <MaterialIcons name="card-giftcard" size={13} color={colors.warning} />}
                      <Text style={{ fontSize: 12, color: colors.muted }}>{h.date}</Text>
                      <Pressable onPress={() => handleDeleteNightRecord(index)} hitSlop={8}>
                        <MaterialIcons name="delete-outline" size={16} color={colors.error} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ═══════ قرعة السفر ═══════ */}
          <View style={card}>
            <View style={{ flexDirection: rowDir, alignItems: "center", gap: 8, marginBottom: 10 }}>
              <MaterialIcons name="flight-takeoff" size={18} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>
                {tx(lang, "Loting voor een reis", "Draw for a trip", "قرعة للسفر")}
              </Text>
            </View>
            <Pressable
              onPress={debounced("draw", handleDraw)}
              style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: "center", flexDirection: rowDir, gap: 6 }}
            >
              <MaterialIcons name="casino" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                {tx(lang, "Trek de loting", "Draw lots", "أجرِ القرعة")}
              </Text>
            </Pressable>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: colors.muted }}>
              {tx(
                lang,
                "Een echte قرعة laat het lot beslissen — houd u aan de uitkomst.",
                "A real قرعة submits to the outcome — honor the result it gives.",
                "القرعة تسليمٌ للقدر — التزم بما تُسفر عنه.",
              )}
            </Text>
            {drawResult !== null && (
              <Text style={{ marginTop: 10, textAlign: "center", fontSize: 14, fontWeight: "700", color: colors.primary }}>
                {nameFor(drawResult)}
              </Text>
            )}
            {qasmState.drawHistory.length > 0 && (
              <View style={{ marginTop: 10 }}>
                {[...qasmState.drawHistory].reverse().slice(0, 5).map((d, i) => {
                  const index = qasmState.drawHistory.length - 1 - i;
                  return (
                    <View
                      key={index}
                      style={{ flexDirection: rowDir, alignItems: "center", justifyContent: "space-between", paddingVertical: 3 }}
                    >
                      <Text style={{ fontSize: 12, color: colors.foreground }}>{nameFor(d.wifeId)}</Text>
                      <View style={{ flexDirection: rowDir, alignItems: "center", gap: 6 }}>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{d.date}</Text>
                        <Pressable onPress={() => handleDeleteDrawRecord(index)} hitSlop={8}>
                          <MaterialIcons name="delete-outline" size={15} color={colors.error} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* ═══════ نفقة log (P4) ═══════ */}
          <View style={card}>
            <View style={{ flexDirection: rowDir, alignItems: "center", gap: 8, marginBottom: 10 }}>
              <MaterialIcons name="payments" size={18} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>
                {tx(lang, "Nafaqa-overzicht (optioneel)", "نفقة log (optional)", "سجلّ النفقة (اختياري)")}
              </Text>
            </View>
            <View style={{ flexDirection: rowDir, flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {qasmState.wives.filter((w) => w.active).map((w) => (
                <Pressable
                  key={w.id}
                  onPress={() => setExpenseWifeId(w.id)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: validExpenseWifeId === w.id ? colors.primary : colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 12, color: validExpenseWifeId === w.id ? "#fff" : colors.foreground }}>{w.name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: rowDir, gap: 8 }}>
              <TextInput
                value={expenseAmount}
                onChangeText={setExpenseAmount}
                placeholder={tx(lang, "Bedrag", "Amount", "المبلغ")}
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                style={{ flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.foreground, textAlign }}
              />
              <TextInput
                value={expenseNote}
                onChangeText={setExpenseNote}
                placeholder={tx(lang, "Notitie (optioneel)", "Note (optional)", "ملاحظة (اختياري)")}
                placeholderTextColor={colors.muted}
                style={{ flex: 2, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.foreground, textAlign }}
              />
            </View>
            <Pressable
              onPress={debounced("expense", handleAddExpense)}
              disabled={validExpenseWifeId === null}
              style={{ marginTop: 8, backgroundColor: colors.primary, borderRadius: 10, padding: 10, alignItems: "center", opacity: validExpenseWifeId === null ? 0.5 : 1 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{tx(lang, "Toevoegen", "Add", "إضافة")}</Text>
            </Pressable>
            {qasmState.expenses.length > 0 && (
              <View style={{ marginTop: 12 }}>
                {Object.entries(expenseTotalsByWife(qasmState)).map(([id, total]) => (
                  <View key={id} style={{ flexDirection: rowDir, justifyContent: "space-between", paddingVertical: 3 }}>
                    <Text style={{ fontSize: 12, color: colors.foreground }}>{nameFor(Number(id))}</Text>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>{total}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ═══════ إعادة الضبط ═══════ */}
          <Pressable
            onPress={debounced("reset-qasm", handleResetQasm)}
            style={[card, { borderColor: colors.error, alignItems: "center", flexDirection: rowDir, gap: 6, justifyContent: "center" }]}
          >
            <MaterialIcons name="restart-alt" size={16} color={colors.error} />
            <Text style={{ color: colors.error, fontWeight: "700", fontSize: 13 }}>
              {tx(lang, "القَسْم volledig resetten", "Reset the قَسْم completely", "إعادة ضبط القَسْم بالكامل")}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
