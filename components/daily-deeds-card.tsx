import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

interface Deed {
  id: string;
  label: string;
  done: boolean;
}

interface DailyDeedsToday {
  date: string;
  deeds: Deed[];
}

interface Props {
  lang: Lang;
}

type ToggleVars = { deedId: string; done: boolean };

/**
 * ponytail: `dailyDeeds` isn't registered on AppRouter yet — the server side
 * of this feature is a separate task and this file's scope is client-only,
 * so `trpc.dailyDeeds` / `utils.dailyDeeds` have no real generated type here.
 * Left untyped, that cascades into implicit-`any` on every call below. This
 * hand-written shape covers exactly the calls this file makes and is cast in
 * at the two lines that touch `trpc`/`utils` directly, so everything else
 * stays checked against `DailyDeedsToday`. At runtime the tRPC proxy resolves
 * paths dynamically regardless of this type, so the calls already work
 * correctly (or NOT_FOUND-and-render-null, per the check below) whether or
 * not the router is registered yet. Upgrade path: once the server task adds
 * `dailyDeeds` to AppRouter, delete this block and the two `as unknown as`
 * casts — the generated types take over with no other change needed here.
 */
// `date` (added alongside the pre-existing `lang`) folds today's UTC date
// into this query's input so it's also part of its cache key — see the
// `todayKey` comment at its call site below for why. The real server input
// schema doesn't need a matching change: zod's default `z.object()` strips
// unknown keys rather than rejecting them, so an extra field the server
// never declared is simply ignored, not an error.
interface DailyDeedsHookApi {
  getToday: {
    useQuery: (input: { lang: Lang; date: string }) => {
      data: DailyDeedsToday | undefined;
      isLoading: boolean;
      isError: boolean;
      error: unknown;
      refetch: () => void;
    };
  };
  toggle: {
    useMutation: (opts: {
      onMutate: (vars: ToggleVars) => Promise<void>;
      onError: (err: unknown, vars: ToggleVars) => void;
      onSettled: () => Promise<void> | void;
    }) => { mutate: (vars: ToggleVars) => void; isPending: boolean; isError: boolean; variables: ToggleVars | undefined };
  };
}
interface DailyDeedsUtilsApi {
  getToday: {
    cancel: (input: { lang: Lang; date: string }) => Promise<void>;
    setData: (
      input: { lang: Lang; date: string },
      updater: DailyDeedsToday | undefined | ((old: DailyDeedsToday | undefined) => DailyDeedsToday | undefined)
    ) => void;
    invalidate: () => Promise<void>;
  };
}

/**
 * Pure transform: flips one deed's `done` state, leaves every other row
 * untouched. Pulled out of the component so it's assertable without a
 * renderer (none is installed in this project — see
 * tests/daily-deeds-card.test.ts), same reasoning as
 * daily-diagnostic-card.tsx's buildReviewSelections. Used by the toggle
 * mutation's onMutate to write the optimistic cache update below.
 */
export function toggleDeedDone(deeds: Deed[], deedId: string, done: boolean): Deed[] {
  return deeds.map((d) => (d.id === deedId ? { ...d, done } : d));
}

/**
 * Daily deeds checklist — a separate, always-visible card below the personal
 * review (DailyDiagnosticCard). Deeds are a curated list, not AI-generated,
 * so — unlike that card's getToday — there is no per-fetch generation cost
 * to guard against and this fetches on mount with no `enabled` gate.
 */
export function DailyDeedsCard({ lang }: Props) {
  const dailyDeeds = trpc as unknown as { dailyDeeds: DailyDeedsHookApi };
  const utils = trpc.useUtils() as unknown as { dailyDeeds: DailyDeedsUtilsApi };
  const queryClient = useQueryClient();
  // Day-scoped input: without `date`, the query key is `{lang}` alone, so a
  // cached response from YESTERDAY (in-memory, or restored from AsyncStorage
  // by lib/query-persistence.ts on app boot — which stamps a fresh
  // `dataUpdatedAt`, defeating the 5-minute staleTime check) satisfies
  // today's mount with no network call and no downstream date check (unlike
  // daily-diagnostic-card.tsx) to catch it — this is the direct cause of a
  // real bug report: yesterday's checked-off deeds shown on a new day.
  // Folding today's date into the input makes it part of the query key too,
  // so a new day is a genuine cache miss — a stale key simply cannot answer
  // it. UTC to match the server's day key (server/daily-deeds.ts todayKey()).
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayQuery = dailyDeeds.dailyDeeds.getToday.useQuery({ lang, date: todayKey });
  const toggleMutation = dailyDeeds.dailyDeeds.toggle.useMutation({
    onMutate: async ({ deedId, done }) => {
      await utils.dailyDeeds.getToday.cancel({ lang, date: todayKey });
      utils.dailyDeeds.getToday.setData({ lang, date: todayKey }, (old) =>
        old ? { ...old, deeds: toggleDeedDone(old.deeds, deedId, done) } : old
      );
    },
    // Refetch rather than restore a snapshot: a snapshot of the WHOLE response
    // taken in onMutate is stale the moment ANOTHER deed's toggle succeeds
    // against it, and writing it back un-checks a deed the server has already
    // saved. The server is the only thing that knows the real state after a
    // failure, so ask it — but only once nothing else is on the wire. A
    // refetch answers with what the server has, and the server has not been
    // told yet about a toggle that is still in flight, so settling on EVERY
    // toggle un-checks its peers — the same bug from the other side.
    // query-core awaits onSettled before marking this mutation done, so it
    // still counts itself: 1 means "I am the last one". The failed flip is
    // surfaced to the user below either way.
    // ponytail: isMutating() is unfiltered, so an unrelated mutation anywhere
    // in the app also defers this settle. That is the safe direction — the
    // optimistic state simply stays until the next refetch — whereas a
    // mutationKey filter would ride on tRPC's internal key shape and, once it
    // stopped matching, would silently never settle at all.
    // Undo THIS deed's flip, and only this one. onSettled below reconciles
    // against the server, but only when nothing else is mutating anywhere in
    // the app — so a failed toggle could otherwise sit on screen showing a
    // state the server rejected until the card unmounts. Reverting the single
    // deed by the same pure transform that flipped it is safe where restoring
    // a whole-response snapshot is not: a peer toggle the server has already
    // accepted is left exactly as it is.
    onError: (_err, { deedId, done }) => {
      utils.dailyDeeds.getToday.setData({ lang, date: todayKey }, (old) =>
        old ? { ...old, deeds: toggleDeedDone(old.deeds, deedId, !done) } : old
      );
    },
    onSettled: () => {
      if (queryClient.isMutating() === 1) return utils.dailyDeeds.getToday.invalidate();
    },
  });

  // The deeds list is only mounted once its half of the duo row is tapped, so
  // a bare `return null` here read as a dead control for the whole fetch —
  // and permanently, if it failed. Same three states the sibling card renders
  // (daily-diagnostic-card.tsx), in the same order.
  if (todayQuery.isLoading) {
    return (
      <View style={[s.card, s.statusRow]}>
        <ActivityIndicator size="small" color="#1B4332" />
        <Text style={[s.statusText, { textAlign: lang === "ar" ? "right" : "left" }]}>
          {tx(lang, "Bezig met laden...", "Loading...", "جارٍ التحميل...")}
        </Text>
      </View>
    );
  }

  // NOT_FOUND is the one error worth staying silent about: it means the
  // procedure isn't deployed on this server yet (client and server for this
  // feature ship as separate steps), so a "tap to retry" could never succeed.
  if (todayQuery.isError && (todayQuery.error as any)?.data?.code === "NOT_FOUND") return null;

  const data = todayQuery.data;
  // `deeds` is checked, not trusted: DailyDeedsToday above is hand-written and
  // cast in with `as unknown as`, so nothing type-checks the real response. On
  // the home tab a malformed one would throw out of `data.deeds.map` and take
  // the screen down; the retry card below is the fallback this file already
  // renders for every other failure.
  if (todayQuery.isError || !data || !Array.isArray(data.deeds)) {
    return (
      <Pressable
        onPress={() => todayQuery.refetch()}
        style={({ pressed }) => [s.card, s.statusRow, pressed && { opacity: 0.85 }]}
      >
        <MaterialIcons name="error-outline" size={18} color="#B91C1C" />
        <Text style={[s.statusText, { textAlign: lang === "ar" ? "right" : "left" }]} numberOfLines={2}>
          {tx(lang, "Laden mislukt, tik om opnieuw te proberen", "Failed to load, tap to retry", "فشل التحميل، اضغط لإعادة المحاولة")}
        </Text>
      </Pressable>
    );
  }

  const pendingDeedId = toggleMutation.isPending ? toggleMutation.variables?.deedId : undefined;

  return (
    <View style={s.card}>
      <Text style={[s.title, { textAlign: lang === "ar" ? "right" : "left" }]}>
        {tx(lang, "Dagelijkse daden", "Daily deeds", "تذكير الأعمال اليومية")}
      </Text>
      <Text style={[s.subtitle, { textAlign: lang === "ar" ? "right" : "left" }]}>
        {tx(lang, "Vink af wat u vandaag deed", "Check off what you did today", "علّم ما أدّيتَه اليوم")}
      </Text>
      {data.deeds.map((deed) => (
        <Pressable
          key={deed.id}
          disabled={pendingDeedId === deed.id}
          onPress={() => toggleMutation.mutate({ deedId: deed.id, done: !deed.done })}
          style={({ pressed }) => [s.row, { flexDirection: "row" }, pressed && { opacity: 0.7 }]}
        >
          <View style={[s.checkbox, deed.done && s.checkboxChecked]}>
            {deed.done && <MaterialIcons name="check" size={14} color="#fff" />}
          </View>
          <Text style={[s.label, deed.done && s.labelDone, { textAlign: lang === "ar" ? "right" : "left" }]}>
            {deed.label}
          </Text>
        </Pressable>
      ))}
      {toggleMutation.isError && (
        <Text style={[s.errorText, { textAlign: lang === "ar" ? "right" : "left" }]}>
          {tx(lang, "Verzenden mislukt, probeer opnieuw", "Failed to send, please try again", "تعذّر الإرسال، حاول مرة أخرى")}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#F1F8F2",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E8ECE9",
    padding: 14,
  },
  title: { fontSize: 14, fontWeight: "700", color: "#1B4332", marginBottom: 4 },
  subtitle: { fontSize: 11, lineHeight: 16, color: "#52796F", marginBottom: 10 },
  row: { alignItems: "center", gap: 10, paddingVertical: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: "#1B4332", borderColor: "#1B4332" },
  label: { flex: 1, fontSize: 14, fontWeight: "500", color: "#374151" },
  labelDone: { color: "#9CA3AF", textDecorationLine: "line-through" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusText: { flex: 1, fontSize: 14, fontWeight: "700", color: "#1B4332" },
  errorText: { fontSize: 12, fontWeight: "600", color: "#B91C1C", marginTop: 8 },
});
