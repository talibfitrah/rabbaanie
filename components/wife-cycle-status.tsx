import { useMemo, type ReactNode } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { addDays, classify, isoToday, predict, rulingsFor, DEFAULT_SETTINGS, type CycleDay, type CycleSettings, type Flow } from "@/lib/haid";
import { haidText } from "@/lib/haid-text";

type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);

/** Husband-side, per wife. Server gate: active confirmed partnership only (INV-1/INV-4). */
export function WifeCycleStatus({ wifeId, emptyFallback }: { wifeId: number; emptyFallback?: ReactNode }) {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const T = haidText(lang);
  const q = trpc.cycle.getPartner.useQuery({ partnerId: wifeId }, { staleTime: 60_000 });
  const today = isoToday();
  const view = useMemo(() => {
    if (!q.data?.enabled) return null;
    const days: CycleDay[] = q.data.days.map((d) => ({ date: d.date, flow: d.flow as Flow, color: d.color as CycleDay["color"], ghusl: d.ghusl }));
    const settings: CycleSettings = { ...DEFAULT_SETTINGS, ...(q.data.settings ?? {}), enabled: true };
    const cls = classify(days, settings, addDays(today, -60), today);
    const t = cls[cls.length - 1];
    const todayDay = q.data.days.find((d) => d.date === today) ?? null;
    return { t, r: rulingsFor(t), p: predict(days, settings, today), todayDay };
  }, [q.data, today]);
  // Loading is NOT "not shared": while the query is in flight, view is also
  // null. Show a spinner so a caller's emptyFallback ("not shared yet") can't
  // flash for a wife who actually tracks her cycle.
  if (q.isLoading) return <ActivityIndicator size="small" color={colors.primary} />;
  // A fetch error is not "not shared" either — say so distinctly rather than
  // claim she tracks nothing.
  if (q.isError)
    return (
      <Text style={{ color: colors.muted, fontSize: 13, textAlign: isRTL ? "right" : "left" }}>
        {tx(lang, "Kon niet laden", "Couldn't load", "تعذّر تحميل المعلومات")}
      </Text>
    );
  if (!view) return <>{emptyFallback ?? null}</>;
  const align = { textAlign: isRTL ? ("right" as const) : ("left" as const) };
  const line = (s: string) => <Text style={[{ color: colors.foreground, fontSize: 12, marginTop: 2 }, align]}>{s}</Text>;
  return (
    <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <Text style={[{ color: colors.foreground, fontWeight: "700", fontSize: 13 }, align]}>{tx(lang, "Haar toestand vandaag", "Her state today", "حالها اليوم")}: {T.status[view.t.status]}</Text>
      {view.todayDay?.flow === "blood" && line(
        view.todayDay.color === "black"
          ? tx(lang, "Bloedtype: zwart/dik", "Blood type: black/thick", "نوع الدم: أسود ثخين")
          : view.todayDay.color === "red"
          ? tx(lang, "Bloedtype: rood/dun", "Blood type: red/thin", "نوع الدم: أحمر رقيق")
          : tx(lang, "Bloedtype: bloed", "Blood type: blood", "نوع الدم: دم")
      )}
      {line(T.intercourse[view.r.intercourse])}
      {view.p.expectedPurity && line(tx(lang, "Verwachte reinheid: ", "Expected purity: ", "الطهر المتوقَّع: ") + view.p.expectedPurity)}
      {view.p.nextStart && line(tx(lang, "Volgende menstruatie: ", "Next period: ", "الحيضة القادمة: ") + view.p.nextStart)}
      {view.p.fertile && line(tx(lang, "Vruchtbare dagen: ", "Fertile days: ", "أيام الخصوبة: ") + `${view.p.fertile[0]} — ${view.p.fertile[1]}`)}
    </View>
  );
}
