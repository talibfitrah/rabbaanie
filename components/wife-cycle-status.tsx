import { useMemo } from "react";
import { View, Text } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { addDays, classify, isoToday, predict, rulingsFor, DEFAULT_SETTINGS, type CycleDay, type CycleSettings, type Flow } from "@/lib/haid";
import { haidText } from "@/lib/haid-text";

type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);

/** Husband-side, per wife. Server gate: active confirmed partnership only (INV-1/INV-4). */
export function WifeCycleStatus({ wifeId, expanded }: { wifeId: number; expanded: boolean }) {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const T = haidText(lang);
  const q = trpc.cycle.getPartner.useQuery({ partnerId: wifeId }, { enabled: expanded, staleTime: 60_000 });
  const today = isoToday();
  const view = useMemo(() => {
    if (!q.data?.enabled) return null;
    const days: CycleDay[] = q.data.days.map((d) => ({ date: d.date, flow: d.flow as Flow, color: d.color as CycleDay["color"], ghusl: d.ghusl }));
    const settings: CycleSettings = { ...DEFAULT_SETTINGS, ...(q.data.settings ?? {}), enabled: true };
    const cls = classify(days, settings, addDays(today, -60), today);
    const t = cls[cls.length - 1];
    return { t, r: rulingsFor(t), p: predict(days, settings, today) };
  }, [q.data, today]);
  if (!expanded || !view) return null;
  const align = { textAlign: isRTL ? ("right" as const) : ("left" as const) };
  const line = (s: string) => <Text style={[{ color: colors.foreground, fontSize: 12, marginTop: 2 }, align]}>{s}</Text>;
  return (
    <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <Text style={[{ color: colors.foreground, fontWeight: "700", fontSize: 13 }, align]}>{tx(lang, "Haar toestand vandaag", "Her state today", "حالها اليوم")}: {T.status[view.t.status]}</Text>
      {line(T.intercourse[view.r.intercourse])}
      {view.p.expectedPurity && line(tx(lang, "Verwachte reinheid: ", "Expected purity: ", "الطهر المتوقَّع: ") + view.p.expectedPurity)}
      {view.p.nextStart && line(tx(lang, "Volgende menstruatie: ", "Next period: ", "الحيضة القادمة: ") + view.p.nextStart)}
      {view.p.fertile && line(tx(lang, "Vruchtbare dagen: ", "Fertile days: ", "أيام الخصوبة: ") + `${view.p.fertile[0]} — ${view.p.fertile[1]}`)}
    </View>
  );
}
