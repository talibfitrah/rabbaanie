import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
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
  isRTL: boolean;
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
  getToday: { useQuery: (input: { lang: Lang; date: string }) => { data: DailyDeedsToday | undefined; isError: boolean } };
  toggle: {
    useMutation: (opts: {
      onMutate: (vars: ToggleVars) => Promise<{ previous: DailyDeedsToday | undefined }>;
      onError: (err: unknown, vars: ToggleVars, ctx: { previous: DailyDeedsToday | undefined } | undefined) => void;
      onSuccess: () => void;
    }) => { mutate: (vars: ToggleVars) => void };
  };
}
interface DailyDeedsUtilsApi {
  getToday: {
    cancel: (input: { lang: Lang; date: string }) => Promise<void>;
    getData: (input: { lang: Lang; date: string }) => DailyDeedsToday | undefined;
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
export function DailyDeedsCard({ lang, isRTL }: Props) {
  const dailyDeeds = trpc as unknown as { dailyDeeds: DailyDeedsHookApi };
  const utils = trpc.useUtils() as unknown as { dailyDeeds: DailyDeedsUtilsApi };
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
      const previous = utils.dailyDeeds.getToday.getData({ lang, date: todayKey });
      utils.dailyDeeds.getToday.setData({ lang, date: todayKey }, (old) =>
        old ? { ...old, deeds: toggleDeedDone(old.deeds, deedId, done) } : old
      );
      return { previous };
    },
    // Roll back the optimistic flip if the server rejects it — otherwise a
    // failed toggle would stay stuck showing the wrong checked state.
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.dailyDeeds.getToday.setData({ lang, date: todayKey }, ctx.previous);
    },
    onSuccess: () => utils.dailyDeeds.getToday.invalidate(),
  });

  // Same reasoning as daily-diagnostic-card.tsx's isError/NOT_FOUND branch:
  // this procedure not existing on the server yet (client/server ship as
  // separate steps) is the expected case while the server side lands, and
  // this card is optional/below-the-fold — so any query error (not just
  // NOT_FOUND) simply renders nothing rather than an error state to fix.
  if (todayQuery.isError) return null;

  const data = todayQuery.data;
  if (!data) return null;

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
});
