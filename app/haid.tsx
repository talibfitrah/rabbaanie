import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Switch, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { getIslamicDate } from "@/lib/prayer-data";
import { addDays, classify, isExcusedToday, isoToday, predict, ramadanQadaaDays, rulingsFor, DEFAULT_SETTINGS, type CycleDay, type CycleSettings, type DayStatus, type Flow } from "@/lib/haid";
import { haidText } from "@/lib/haid-text";
import { HAID_RULINGS } from "@/lib/haid-rulings";
import { syncHaidNotifications } from "@/lib/haid-notifications";

type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);
const STATUS_COLOR: Record<DayStatus, string> = { haid: "#DC2626", nifas: "#B45309", istihada: "#7C3AED", tuhr_pending_ghusl: "#0EA5E9", tuhr: "transparent" };

function monthGrid(monthStart: string): string[] {
  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i));
}

/**
 * Private women's tracker. Data lives on the server (trpc.cycle.*) so her
 * confirmed husband can read it (decision 15); every rule comes from lib/haid.ts.
 */
export default function HaidScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const T = haidText(lang);
  const { state, loading } = useAppState();
  const { user, isAuthenticated } = useAuth();
  const params = useLocalSearchParams<{ purityCheck?: string }>();
  const isWoman = state.parentProfile.gender === "vrouw";
  const utils = trpc.useUtils();

  // !loading: state.parentProfile is still hydrating on a cold start, and a
  // stale/default gender there must not bounce a real woman off her own screen.
  useEffect(() => { if (!loading && isAuthenticated && !isWoman) router.replace("/(tabs)/family" as any); }, [loading, isAuthenticated, isWoman, router]);

  const q = trpc.cycle.getMine.useQuery(undefined, { enabled: isAuthenticated && isWoman });
  const invalidate = () => utils.cycle.getMine.invalidate();
  const onMutationError = (e: { message: string }) => Alert.alert(tx(lang, "Er ging iets mis", "Something went wrong", "حدث خطأ ما"), e.message);
  const upsertDay = trpc.cycle.upsertDay.useMutation({
    // Optimistic: reflect the tap immediately so the ruling below updates
    // without waiting for the server, AND so the "Ghusl done" button — which
    // reads the selected day's flow — sees the flow she JUST set rather than the
    // stale server copy. Tapping "spotting" then "ghusl" used to race: ghusl
    // read the old (empty) flow and fell back to "dry", silently clearing the
    // كدرة/صفرة entry and giving no ruling. onSettled reconciles with the server.
    onMutate: async (vars) => {
      await utils.cycle.getMine.cancel();
      const prev = utils.cycle.getMine.getData(undefined);
      utils.cycle.getMine.setData(undefined, (old: any) => {
        if (!old) return old;
        const daysArr = [...(old.days ?? [])];
        const i = daysArr.findIndex((d: any) => d.date === vars.date);
        const next = { date: vars.date, flow: vars.flow, color: vars.color ?? null, ghusl: vars.ghusl ?? false };
        if (i >= 0) daysArr[i] = { ...daysArr[i], ...next };
        else daysArr.push(next);
        return { ...old, days: daysArr };
      });
      return { prev };
    },
    onError: (e, _vars, ctx: any) => {
      if (ctx?.prev !== undefined) utils.cycle.getMine.setData(undefined, ctx.prev);
      onMutationError(e);
    },
    onSettled: invalidate,
  });
  const deleteDay = trpc.cycle.deleteDay.useMutation({ onSuccess: invalidate, onError: onMutationError });
  const saveSettings = trpc.cycle.saveSettings.useMutation({ onSuccess: invalidate, onError: onMutationError });
  const disable = trpc.cycle.disable.useMutation({
    onSuccess: () => {
      invalidate();
      // C9: don't rely on the screen effect below — it explicitly bails
      // when settings.enabled is false, so a stale excused flag + purity/
      // ghusl alarms from before disabling would otherwise survive. Disable
      // deletes all her days server-side, so an empty list here always
      // resolves to excused:false, clearing the flag and rescheduling
      // prayers immediately.
      if (user?.id) syncHaidNotifications({ userId: user.id, days: [], settings: DEFAULT_SETTINGS, language: lang }).catch(() => {});
    },
    onError: onMutationError,
  });

  const days: CycleDay[] = useMemo(() => (q.data?.days ?? []).map((d) => ({ date: d.date, flow: d.flow as Flow, color: d.color as CycleDay["color"], ghusl: d.ghusl })), [q.data]);
  const settings: CycleSettings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(q.data?.settings ?? {}), enabled: !!q.data?.enabled }), [q.data]);

  const today = isoToday();
  const [selected, setSelected] = useState(today);
  const [monthStart, setMonthStart] = useState(today.slice(0, 7) + "-01");
  const [showSettings, setShowSettings] = useState(false);
  const [showKaffarahInfo, setShowKaffarahInfo] = useState(false); // decision 6: information on request, never shown by default
  const [openRulings, setOpenRulings] = useState<Set<number>>(new Set());
  const scrollRef = useRef<ScrollView>(null);
  // Settings used to render at the bottom of a long ScrollView — opening it from
  // the header gear showed nothing until she scrolled all the way down. It now
  // renders right below the header, so jump the scroll position to match.
  useEffect(() => { if (showSettings) scrollRef.current?.scrollTo({ y: 0, animated: true }); }, [showSettings]);

  // Explicit `today` (item E-2): `to` extends 45 days into the future for the
  // calendar/predictions display, but the unlogged-day extension must stop at
  // the real today, not assume blood through not-yet-lived future days.
  const classified = useMemo(() => classify(days, settings, addDays(today, -400), addDays(today, 45), today), [days, settings, today]);
  const byDate = useMemo(() => new Map(classified.map((c) => [c.date, c])), [classified]);
  const prediction = useMemo(() => predict(days, settings, today), [days, settings, today]);
  // An out-of-classify-window date (grid navigated far past/future) has no
  // entry — show a neutral pure day for THAT date, not today's rulings.
  const selectedCls = byDate.get(selected) ?? { date: selected, status: "tuhr" as const, ghuslDue: false, advisories: [] };
  const rulings = rulingsFor(selectedCls);
  const ramadan = useMemo(() => ramadanQadaaDays(classified.filter((c) => c.date <= today), (d) => { const h = getIslamicDate(new Date(`${d}T12:00:00`), null); return { month: h.month, year: h.year }; }), [classified, today]);

  // Onset-only notes (decision 7), filtered here — the engine stays untouched:
  // qadaa_prayer_if_missed_at_onset only makes sense on the day the run began;
  // prayer_of_this_time_due_after_ghusl is a one-time message tied to the
  // moment purity begins, not a persistent daily reminder while ghusl stays due.
  const prevCls = byDate.get(addDays(selected, -1));
  const isFirstGhuslDueDay = selectedCls.ghuslDue && (prevCls?.status === "haid" || prevCls?.status === "nifas");
  const visibleNotes = rulings.notes.filter((n) => {
    if (n === "kaffarah_info") return false; // decision 6: behind the "More" toggle below
    if (n === "qadaa_prayer_if_missed_at_onset") return selectedCls.runDay === 1;
    if (n === "prayer_of_this_time_due_after_ghusl") return isFirstGhuslDueDay;
    return true;
  });
  const hasKaffarahInfo = rulings.notes.includes("kaffarah_info");

  useEffect(() => {
    if (!q.data || !user?.id || !settings.enabled) return;
    syncHaidNotifications({ userId: user.id, days, settings, language: lang }).catch(() => {});
  }, [q.data, user?.id, settings, days, lang]);

  const log = (flow: Flow, extra: Partial<CycleDay> = {}) => {
    const existing = days.find((d) => d.date === selected);
    // C12: color only applies to flow "blood" (server refine) — never carry
    // a prior blood day's colour onto a dry/spotting entry, or the server
    // rejects the write and she stays stuck classified excused.
    const color = flow === "blood" ? (extra.color ?? existing?.color ?? null) : null;
    upsertDay.mutate({ date: selected, flow, color, ghusl: extra.ghusl ?? false });
  };

  if (!isAuthenticated || !isWoman) return null;
  if (q.isLoading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;

  const card = { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border } as const;
  const align = { textAlign: isRTL ? ("right" as const) : ("left" as const) };
  const label = (s: string) => <Text style={[{ color: colors.foreground, fontSize: 14, marginBottom: 4 }, align]}>{s}</Text>;

  if (!settings.enabled) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12 }} style={{ backgroundColor: colors.background }}>
        <Text style={[{ color: colors.foreground, fontSize: 20, fontWeight: "700", marginBottom: 12 }, align]}>{tx(lang, "Menstruatie en reinheid", "Menses and purity", "متابعة الحيض والطهر")}</Text>
        <View style={card}>{label(T.consent)}</View>
        <Pressable onPress={() => saveSettings.mutate({ enabled: true })} disabled={saveSettings.isPending} style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: "center" }}>
          <Text style={{ color: "#FFF", fontWeight: "700" }}>{tx(lang, "Inschakelen", "Enable", "تفعيل")}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 40 }} style={{ backgroundColor: colors.background }}>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "700" }}>{tx(lang, "Menstruatie en reinheid", "Menses and purity", "متابعة الحيض والطهر")}</Text>
        <Pressable onPress={() => setShowSettings((v) => !v)} hitSlop={10}><MaterialIcons name="settings" size={22} color={colors.muted} /></Pressable>
      </View>

      {showSettings && (
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>{tx(lang, "Instellingen", "Settings", "الإعدادات")}</Text>
            <Pressable onPress={() => setShowSettings(false)} hitSlop={10}><MaterialIcons name="close" size={22} color={colors.muted} /></Pressable>
          </View>
          <SettingsCard settings={settings} lang={lang} colors={colors} align={align} isSaving={saveSettings.isPending} onSave={(p) => saveSettings.mutate(p)} onDisable={() => Alert.alert(tx(lang, "Uitschakelen?", "Disable?", "إيقاف الميزة؟"), T.consent, [{ text: tx(lang, "Annuleren", "Cancel", "إلغاء") }, { text: tx(lang, "Uitschakelen en wissen", "Disable and delete", "إيقاف وحذف"), style: "destructive", onPress: () => disable.mutate() }])} />
        </View>
      )}

      {params.purityCheck === "1" && isExcusedToday(classified, today) && (
        <View style={[card, { borderColor: colors.primary }]}>
          {label(tx(lang, "Bent u weer rein?", "Have you become pure?", "هل طهرتِ؟"))}
          <Pressable onPress={() => { setSelected(today); upsertDay.mutate({ date: today, flow: "dry" }); }} style={{ backgroundColor: colors.primary, padding: 10, borderRadius: 8, alignItems: "center" }}>
            <Text style={{ color: "#FFF", fontWeight: "700" }}>{tx(lang, "Ja, ik ben rein", "Yes, I am pure", "نعم، طهرتُ")}</Text>
          </Pressable>
        </View>
      )}

      {/* Today / selected day: log buttons first, resulting ruling right below — one card, no scrolling to see the effect of a tap */}
      <View style={card}>
        <Text style={[{ color: STATUS_COLOR[selectedCls.status] === "transparent" ? colors.foreground : STATUS_COLOR[selectedCls.status], fontSize: 17, fontWeight: "700", marginBottom: 6 }, align]}>
          {selected === today ? tx(lang, "Vandaag", "Today", "اليوم") : selected} — {T.status[selectedCls.status]}{selectedCls.runDay ? ` (${tx(lang, "dag", "day", "اليوم")} ${selectedCls.runDay})` : ""}
        </Text>
        {label(tx(lang, "Registreren voor", "Log for", "تسجيل ليوم") + " " + selected)}
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {(["blood", "spotting", "dry"] as Flow[]).map((f) => (
            <Pressable key={f} onPress={() => log(f)} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text style={{ color: colors.foreground }}>{T.flow[f]}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => log("blood", { color: "black" })} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}><Text style={{ color: colors.foreground }}>{tx(lang, "Bloed — zwart/dik", "Blood — black/thick", "دم أسود ثخين")}</Text></Pressable>
          <Pressable onPress={() => log("blood", { color: "red" })} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}><Text style={{ color: colors.foreground }}>{tx(lang, "Bloed — rood/dun", "Blood — red/thin", "دم أحمر رقيق")}</Text></Pressable>
          <Pressable onPress={() => log(days.find((d) => d.date === selected)?.flow || "dry", { ghusl: true })} style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}><Text style={{ color: colors.primary }}>{tx(lang, "Ghusl gedaan", "Ghusl done", "اغتسلتُ")}</Text></Pressable>
          {days.some((d) => d.date === selected) && (
            <Pressable onPress={() => deleteDay.mutate({ date: selected })} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}><Text style={{ color: colors.muted }}>{tx(lang, "Wissen", "Clear", "مسح")}</Text></Pressable>
          )}
        </View>
        {label(T.prayer[rulings.prayer])}{label(T.fasting[rulings.fasting])}{label(T.intercourse[rulings.intercourse])}{label(T.ghusl[rulings.ghusl])}
        {rulings.permitted.length > 0 && label(tx(lang, "Toegestaan: ", "Permitted: ", "مباح: ") + rulings.permitted.map((k) => T.permitted[k]).join("، "))}
        {visibleNotes.map((n) => <Text key={n} style={[{ color: colors.muted, fontSize: 12, marginTop: 4 }, align]}>• {T.notes[n]}</Text>)}
        {hasKaffarahInfo && (showKaffarahInfo
          ? <Text style={[{ color: colors.muted, fontSize: 12, marginTop: 4 }, align]}>• {T.notes.kaffarah_info}</Text>
          : <Pressable onPress={() => setShowKaffarahInfo(true)}><Text style={[{ color: colors.primary, fontSize: 12, marginTop: 4 }, align]}>{tx(lang, "Meer", "More", "المزيد")}</Text></Pressable>
        )}
        {selectedCls.advisories.map((a) => <Text key={a} style={[{ color: "#B45309", fontSize: 12, marginTop: 4 }, align]}>⚠ {T.advisory[a]}</Text>)}
      </View>

      {/* Month grid */}
      <View style={card}>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Pressable onPress={() => setMonthStart(addDays(monthStart, -1).slice(0, 7) + "-01")}><MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={22} color={colors.foreground} /></Pressable>
          <Text style={{ color: colors.foreground, fontWeight: "700" }}>{monthStart.slice(0, 7)}</Text>
          <Pressable onPress={() => setMonthStart(addDays(monthStart, 32).slice(0, 7) + "-01")}><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.foreground} /></Pressable>
        </View>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap" }}>
          {monthGrid(monthStart).map((d) => {
            const c = byDate.get(d);
            const bg = c ? STATUS_COLOR[c.status] : "transparent";
            const isSel = d === selected;
            return (
              <Pressable key={d} onPress={() => setSelected(d)} style={{ width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: bg === "transparent" ? undefined : bg + "33", borderWidth: isSel ? 2 : d === today ? 1 : 0, borderColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.foreground, fontSize: 12 }}>{Number(d.slice(8))}</Text>
                  {d > today && prediction.fertile && d >= prediction.fertile[0] && d <= prediction.fertile[1] && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#16A34A", position: "absolute", bottom: 3 }} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Predictions */}
      <View style={card}>
        {label(tx(lang, "Verwachtingen", "Predictions", "التقديرات"))}
        {prediction.expectedPurity && label(tx(lang, "Verwachte reinheid: ", "Expected purity: ", "الطهر المتوقَّع: ") + prediction.expectedPurity)}
        {prediction.nextStart && label(tx(lang, "Volgende menstruatie: ", "Next period: ", "الحيضة القادمة: ") + prediction.nextStart)}
        {prediction.fertile && label(tx(lang, "Vruchtbare dagen: ", "Fertile days: ", "أيام الخصوبة: ") + `${prediction.fertile[0]} — ${prediction.fertile[1]}`)}
        <Text style={[{ color: colors.muted, fontSize: 12 }, align]}>⚠ {T.fertileWarning}</Text>
        {ramadan && label(tx(lang, "In te halen Ramadaan-dagen: ", "Ramadaan days to make up: ", "أيام قضاء رمضان: ") + `${ramadan.days} (${ramadan.year})`)}
        <Pressable onPress={() => router.push("/(tabs)/dhikri" as any)}><Text style={[{ color: colors.primary, marginTop: 6 }, align]}>{tx(lang, "Adhkaar voor de menstruerende vrouw →", "Adhkaar for the menstruating woman →", "أذكار الحائض والنفساء ←")}</Text></Pressable>
      </View>

      {/* Haid rulings reference (Daa3iyah 2026-09-05): the full fiqh, one
          collapsible per topic so it opens on tap. Content in lib/haid-rulings.ts,
          generated verbatim from the rulings doc. */}
      <View style={card}>
        <Text style={[{ color: colors.foreground, fontSize: 16, fontWeight: "700", marginBottom: 8 }, align]}>
          {tx(lang, "Regels van menstruatie en reinheid", "Rulings of menses and purity", "أحكام الحيض والطهر")}
        </Text>
        {HAID_RULINGS.map((s, i) => {
          const open = openRulings.has(i);
          return (
            <View key={i} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border, paddingVertical: 8 }}>
              <Pressable
                onPress={() => setOpenRulings((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}
              >
                <Text style={[{ color: colors.foreground, fontSize: 14, fontWeight: "600", flex: 1 }, align]}>{s.title}</Text>
                <MaterialIcons name={open ? "expand-less" : "expand-more"} size={22} color={colors.muted} />
              </Pressable>
              {open && (
                <Text style={[{ color: colors.muted, fontSize: 13, lineHeight: 24, marginTop: 6 }, align]}>
                  {s.body.replace(/\*\*/g, "").replace(/#{1,6}[ \t]*/g, "").replace(/\n?---\s*$/, "").trim()}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function SettingsCard({ settings, lang, colors, align, isSaving, onSave, onDisable }: { settings: CycleSettings; lang: Lang; colors: ReturnType<typeof useColors>; align: { textAlign: "left" | "right" }; isSaving: boolean; onSave: (p: Omit<Partial<CycleSettings>, "enabled">) => void; onDisable: () => void }) {
  const { isRTL } = useI18n();
  const [habit, setHabit] = useState(settings.habitLength ? String(settings.habitLength) : "");
  const [cycle, setCycle] = useState(settings.cycleLength ? String(settings.cycleLength) : "");
  const [pregnant, setPregnant] = useState(settings.pregnantSince ?? "");
  const [birth, setBirth] = useState(settings.birthDate ?? "");
  const [misc, setMisc] = useState(settings.miscarriageDate ?? "");
  const [gest, setGest] = useState(settings.gestationDays ? String(settings.gestationDays) : "");
  const [contra, setContra] = useState(settings.contraception);
  const [ghuslRem, setGhuslRem] = useState(settings.ghuslReminder);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  // Regex shape plus a real calendar round-trip — the regex alone accepts
  // "2026-02-30" or "2026-13-01", which the app-wide date arithmetic below
  // (addDays, diffDays) would then silently roll over to a different date.
  const isValidDate = (s: string) => iso.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const field = (labelText: string, value: string, set: (v: string) => void, placeholder: string) => (
    <View style={{ marginBottom: 8 }}>
      <Text style={[{ color: colors.muted, fontSize: 12 }, align]}>{labelText}</Text>
      <TextInput value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={colors.muted} style={[{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.foreground }, align]} />
    </View>
  );
  const save = () => {
    for (const d of [pregnant, birth, misc]) if (d && !isValidDate(d)) { Alert.alert(tx(lang, "Ongeldige datum", "Invalid date", "تاريخ غير صالح"), tx(lang, "Vul de datum in als JJJJ-MM-DD.", "Enter the date as YYYY-MM-DD.", "أدخلي التاريخ بصيغة سنة-شهر-يوم.")); return; }
    onSave({ habitLength: num(habit), cycleLength: num(cycle), pregnantSince: pregnant || null, birthDate: birth || null, miscarriageDate: misc || null, gestationDays: num(gest), contraception: contra, ghuslReminder: ghuslRem });
  };
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
      {field(tx(lang, "Gewoonte (dagen menstruatie; leeg = automatisch)", "Habit (menses days; empty = learned)", "العادة (أيام الحيض؛ فارغ = تلقائي)"), habit, setHabit, "7")}
      {field(tx(lang, "Cycluslengte (dagen; leeg = automatisch)", "Cycle length (days; empty = learned)", "طول الدورة (أيام؛ فارغ = تلقائي)"), cycle, setCycle, "28")}
      {field(tx(lang, "Zwanger sinds", "Pregnant since", "حامل منذ"), pregnant, setPregnant, "YYYY-MM-DD")}
      {field(tx(lang, "Bevallingsdatum", "Birth date", "تاريخ الولادة"), birth, setBirth, "YYYY-MM-DD")}
      {field(tx(lang, "Miskraam op", "Miscarriage on", "تاريخ الإسقاط"), misc, setMisc, "YYYY-MM-DD")}
      {field(tx(lang, "Zwangerschapsduur bij miskraam (dagen)", "Gestation at miscarriage (days)", "عمر الحمل عند الإسقاط (أيام)"), gest, setGest, "120")}
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><Text style={{ color: colors.foreground }}>{tx(lang, "Anticonceptie", "Contraception", "موانع الحمل")}</Text><Switch value={contra} onValueChange={setContra} /></View>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><Text style={{ color: colors.foreground }}>{tx(lang, "Herinnering aan ghusl", "Ghusl reminder", "تذكير بالغسل")}</Text><Switch value={ghuslRem} onValueChange={setGhuslRem} /></View>
      <Pressable onPress={save} disabled={isSaving} style={{ backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1, padding: 12, borderRadius: 8, alignItems: "center", marginBottom: 8 }}><Text style={{ color: "#FFF", fontWeight: "700" }}>{tx(lang, "Opslaan", "Save", "حفظ")}</Text></Pressable>
      <Pressable onPress={onDisable} style={{ padding: 10, alignItems: "center" }}><Text style={{ color: "#DC2626" }}>{tx(lang, "Uitschakelen en gegevens wissen", "Disable and delete data", "إيقاف الميزة وحذف البيانات")}</Text></Pressable>
    </View>
  );
}
